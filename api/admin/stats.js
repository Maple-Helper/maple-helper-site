"use strict";
const auth = require("../_lib/auth");
const sources = require("../_lib/sources");

/* One snapshot per function instance for 2 minutes: the dashboard refreshes itself and
   several managers may have it open, but GitHub (60 calls/hour without a token) and
   PostHog's query API shouldn't be hit on every request. */
const TTL_MS = 2 * 60 * 1000;   // 14 PostHog queries a refresh; its limit is 2400 an hour
const MIN_FORCE_MS = 2 * 60 * 1000;   // the Refresh button: at most once per snapshot
let cache = null;
let inflight = null;
const ERROR_TTL_MS = 60 * 1000;

async function settle(name, fn) {
  try {
    return await fn();
  } catch (e) {
    return { configured: true, error: e.message || String(e) };
  }
}

async function snapshot() {
  const [github, uptime, posthog, vercel] = await Promise.all([
    settle("github", sources.github),
    settle("uptime", sources.uptime),
    settle("posthog", sources.posthog),
    settle("vercel", sources.vercel),
  ]);
  return { generatedAt: new Date().toISOString(), github, uptime, posthog, vercel };
}

module.exports = async function stats(req, res) {
  auth.noStore(res);
  if (req.method !== "GET") return res.status(405).json({ error: "method" });
  if (!auth.isAdmin(req)) {
    return res.status(401).json({
      error: "unauthorized", configured: auth.configured(), reason: auth.setupProblem(), env: process.env.VERCEL_ENV || "local",
    });
  }

  /* a snapshot with failed parts is kept 15 s only, so a busy moment at PostHog is retried soon; two requests at
     expiry share one refresh instead of each sending its own queries */
  const age = cache ? Date.now() - cache.at : Infinity;
  const ttl = cache && cache.partial ? ERROR_TTL_MS : TTL_MS;
  const force = req.query && req.query.fresh === "1" && age > MIN_FORCE_MS;
  const retryWait = cache && cache.retryAt ? Date.now() - cache.retryAt < ERROR_TTL_MS : false;
  if (!cache || ((age > ttl || force) && !retryWait)) {
    if (!inflight) {
      inflight = snapshot().then((data) => {
        const partial = !!(data.posthog && data.posthog.errors && data.posthog.errors.length) || !!(data.posthog && data.posthog.error);
        /* a refresh that came back with failed parts doesn't replace a complete snapshot of the last 10 minutes:
           that one is shown, marked with its time, and the next try comes a minute later */
        if (partial && cache && !cache.partial && Date.now() - cache.at < 10 * 60 * 1000) {
          cache = { ...cache, data: { ...cache.data, staleSince: cache.data.generatedAt }, partial: false, at: cache.at, retryAt: Date.now() };
          return;
        }
        cache = { at: Date.now(), data, partial };
      }).finally(() => { inflight = null; });
    }
    await inflight;
  }
  return res.status(200).json(cache.data);
};
