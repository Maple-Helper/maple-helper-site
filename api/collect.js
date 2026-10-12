/* Anonymous site stats for the admin dashboard: page views, a once-a-minute "still here"
   ping (for the online-now count) and download clicks, forwarded to PostHog.

   Off until POSTHOG_PROJECT_KEY is set. No cookies: the id is random per browser tab
   (sessionStorage). The visitor's IP is not forwarded and PostHog's GeoIP is disabled;
   the country comes from Vercel's x-vercel-ip-country header. */
"use strict";

const EVENTS = new Set(["pageview", "heartbeat", "download"]);
const BOTS = /bot|crawl|spider|slurp|preview|lighthouse|headless|curl|wget|python|monitor/i;
const HOST = (process.env.POSTHOG_INGEST_HOST || "https://us.i.posthog.com").replace(/\/$/, "");

const short = (v, n = 64) => (typeof v === "string" ? v.slice(0, n) : undefined);

function parse(body) {
  if (body && typeof body === "object") return body;
  try { return JSON.parse(body || "{}"); } catch (e) { return {}; }
}

/* the site's own pages ("/he" and "/he/" are one page); anything else is not a visit to count */
const PAGES = { "/": "/", "/he": "/he/", "/en": "/" };
const LANGS = new Set(["en", "he"]);
const OSES = new Set(["windows", "mac", "mobile", "other"]);
const TARGETS = new Set(["windows", "mac", "portable"]);

/* a request from a page of this site: the browser says so (Sec-Fetch-Site), or the Origin/Referer is the site */
function sameSite(req) {
  const fetchSite = String(req.headers["sec-fetch-site"] || "");
  if (fetchSite) return fetchSite === "same-origin";
  const from = String(req.headers.origin || req.headers.referer || "");
  try { return /(^|\.)maplehelper\.app$/.test(new URL(from).hostname); } catch (e) { return false; }
}

/* at most 40 events a minute from one address, per function instance (a page sends a view, a ping a minute and
   a click now and then): enough for a few open tabs, not for a script */
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  if (hits.size > 5000) hits.clear();
  const h = hits.get(ip) || { start: now, n: 0 };
  if (now - h.start > 60000) { h.start = now; h.n = 0; }
  h.n++;
  hits.set(ip, h);
  return h.n > 40;
}

module.exports = async function collect(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(204);
  const key = process.env.POSTHOG_PROJECT_KEY;
  if (req.method !== "POST" || !key) return res.end();
  /* only the live site counts (preview deployments are tests), and only requests from its own pages */
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") return res.end();
  if (!sameSite(req)) return res.end();
  if (BOTS.test(String(req.headers["user-agent"] || ""))) return res.end();
  if (limited(String(req.headers["x-forwarded-for"] || "").split(",")[0].trim())) return res.end();

  const b = parse(req.body);
  if (!EVENTS.has(b.e) || typeof b.sid !== "string" || !/^[a-z0-9]{8,40}$/.test(b.sid)) return res.end();
  const page = PAGES[String(b.p || "/").replace(/\/+$/, "") || "/"];
  if (!page) return res.end();

  let refHost;
  try { refHost = b.ref ? new URL(b.ref).hostname.replace(/^www\./, "") : "(direct)"; } catch (e) { refHost = "(unknown)"; }
  if (refHost === "maplehelper.app") refHost = "(internal)";

  const event = {
    api_key: key,
    event: "site_" + b.e,
    distinct_id: "web-" + b.sid,
    properties: {
      page,
      lang: LANGS.has(b.lang) ? b.lang : undefined,
      os: OSES.has(b.os) ? b.os : "other",
      target: b.e === "download" ? (TARGETS.has(b.target) ? b.target : "other") : undefined,
      ref_host: b.e === "pageview" ? refHost : undefined,
      country: short(String(req.headers["x-vercel-ip-country"] || ""), 4) || undefined,
      $process_person_profile: false,
      $geoip_disable: true,
      $lib: "maplehelper-site",
    },
  };

  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 3000);
    await fetch(`${HOST}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      signal: ctl.signal,
    }).finally(() => clearTimeout(t));
  } catch (e) {
    /* stats are best-effort: a failed forward is dropped */
  }
  return res.end();
};
