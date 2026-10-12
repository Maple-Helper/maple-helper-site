/* Where the admin dashboard's numbers come from. Each source returns
   { configured: false } when its env vars are missing, or { error } when the call fails,
   so one broken source never blanks the whole dashboard. */
"use strict";
const players = require("./players");

const REPO = process.env.GITHUB_REPO || "Maple-Helper/maple-helper";
const SITE = (process.env.SITE_URL || "https://www.maplehelper.app").replace(/\/$/, "");

async function fetchWithTimeout(url, opts = {}, ms = 9000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function getJson(url, headers) {
  const r = await fetchWithTimeout(url, { headers });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} from ${new URL(url).pathname}`);
  return r.json();
}

/* A failed sub-request becomes null instead of rejecting the whole source. */
const soft = (p) => p.catch(() => null);

/* ---------------------------------------------------------------- GitHub */

/* What each release asset's download_count actually measures. */
function assetKind(name) {
  if (name === "MapleHelper-Setup.exe") return "windows";          // site downloads + Windows in-app updates
  if (name.endsWith(".dmg")) return "mac";
  if (/portable\.zip$/.test(name)) return "portable";
  if (name === "kb-manifest.json") return "kbChecks";              // running apps checking for game-data updates
  if (name === "kb.zip") return "kbDownloads";                     // apps that then pulled new game data
  if (name === "SHA256SUMS.txt") return "updateChecks";            // Windows apps verifying an app update
  return "other";
}

/* every release, 100 a page (a single page of 50 would drop the oldest ones once there are more) */
async function allReleases(api, headers) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await getJson(`${api}/releases?per_page=100&page=${page}`, headers);
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

async function github() {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "maplehelper-admin", "X-GitHub-Api-Version": "2022-11-28" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const api = `https://api.github.com/repos/${REPO}`;
  const traffic = !!process.env.GITHUB_TOKEN;   // the traffic API needs push access

  const [repo, releases, runs, views, clones, referrers, paths, rate] = await Promise.all([
    getJson(api, headers),
    allReleases(api, headers),
    soft(getJson(`${api}/actions/runs?per_page=8`, headers)),
    traffic ? soft(getJson(`${api}/traffic/views`, headers)) : null,
    traffic ? soft(getJson(`${api}/traffic/clones`, headers)) : null,
    traffic ? soft(getJson(`${api}/traffic/popular/referrers`, headers)) : null,
    traffic ? soft(getJson(`${api}/traffic/popular/paths`, headers)) : null,
    soft(getJson("https://api.github.com/rate_limit", headers)),
  ]);

  const totals = { windows: 0, mac: 0, portable: 0, kbChecks: 0, kbDownloads: 0, updateChecks: 0, other: 0 };
  const rel = releases
    .filter((r) => !r.draft && !r.prerelease)      // kb-seed (a prerelease) only seeds the KB for the builds
    .map((r) => {
      const counts = { windows: 0, mac: 0, portable: 0, kbChecks: 0, kbDownloads: 0, updateChecks: 0, other: 0 };
      for (const a of r.assets || []) {
        const k = assetKind(a.name);
        counts[k] += a.download_count;
        totals[k] += a.download_count;
      }
      return { tag: r.tag_name, name: r.name, published: r.published_at, prerelease: r.prerelease, url: r.html_url, counts };
    });

  return {
    configured: true,
    repo: REPO,
    tokenUsed: !!process.env.GITHUB_TOKEN,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    watchers: repo.subscribers_count,
    openIssues: repo.open_issues_count,
    pushedAt: repo.pushed_at,
    totals,
    releases: rel,
    workflowRuns: runs && runs.workflow_runs
      ? runs.workflow_runs.map((w) => ({
          name: w.name, branch: w.head_branch, event: w.event, status: w.status,
          conclusion: w.conclusion, created: w.created_at, url: w.html_url, title: w.display_title,
        }))
      : null,
    traffic: traffic
      ? {
          views: views && { count: views.count, uniques: views.uniques, daily: views.views },
          clones: clones && { count: clones.count, uniques: clones.uniques, daily: clones.clones },
          referrers,
          paths,
        }
      : null,
    rateLimit: rate && rate.resources && rate.resources.core
      ? { remaining: rate.resources.core.remaining, limit: rate.resources.core.limit, reset: rate.resources.core.reset }
      : null,
  };
}

/* ---------------------------------------------------------------- uptime checks */

async function probe(name, url) {
  const t0 = Date.now();
  try {
    const r = await fetchWithTimeout(url, { method: "HEAD", redirect: "follow", headers: { "User-Agent": "maplehelper-admin" } }, 8000);
    return { name, url, ok: r.ok, status: r.status, ms: Date.now() - t0 };
  } catch (e) {
    return { name, url, ok: false, status: 0, ms: Date.now() - t0, error: e.name === "AbortError" ? "timeout" : e.message };
  }
}

async function uptime() {
  const dl = `https://github.com/${REPO}/releases/latest/download`;
  const checks = await Promise.all([
    probe("Site (English)", `${SITE}/`),
    probe("Site (Hebrew)", `${SITE}/he/`),
    probe("Windows installer", `${dl}/MapleHelper-Setup.exe`),
    probe("macOS DMG", `${dl}/MapleHelper-macOS.dmg`),
    probe("Game-data manifest", `${dl}/kb-manifest.json`),
    probe("Checksums", `${dl}/SHA256SUMS.txt`),
  ]);
  return { configured: true, checks };
}

/* ---------------------------------------------------------------- PostHog */

/* App numbers (players and usage): app 0.18.1 and later only, counted in api/_lib/players.js.
   Site numbers: the site's own anonymous visit events (api/collect.js), here. Days in Israel time, like the app's.
   uniqExact everywhere; every grouped list has its own ORDER BY + LIMIT (PostHog returns 100 rows otherwise). */
const SITE_EV = "startsWith(event, 'site_')";
const IL_DAY = `toDate(toTimeZone(timestamp, '${players.TZ}'))`;
const IL_TODAY = `toDate(toTimeZone(now(), '${players.TZ}'))`;
const LAST30 = "timestamp > now() - INTERVAL 30 DAY";
const sstr = (p) => `coalesce(nullIf(toString(properties.${p}), ''), '')`;
const siteList = (dim, ev, expr) => `
    SELECT '${dim}', ${expr} AS v, count() FROM events WHERE event = '${ev}' AND ${LAST30}
    GROUP BY v ORDER BY count() DESC, v LIMIT 50`;

const QUERIES = {
  site: `
    SELECT
      uniqExactIf(distinct_id, timestamp > now() - INTERVAL 5 MINUTE),
      uniqExactIf(distinct_id, event = 'site_pageview' AND ${IL_DAY} = ${IL_TODAY}),
      countIf(event = 'site_pageview' AND ${IL_DAY} = ${IL_TODAY}),
      uniqExactIf(distinct_id, event = 'site_pageview' AND ${LAST30}),
      countIf(event = 'site_pageview' AND ${LAST30}),
      countIf(event = 'site_download' AND ${IL_DAY} = ${IL_TODAY}),
      countIf(event = 'site_download' AND ${LAST30}),
      uniqExactIf(distinct_id, event = 'site_download' AND ${LAST30})
    FROM events WHERE ${SITE_EV}`,
  site_daily: `
    SELECT ${IL_DAY} AS day, uniqExactIf(distinct_id, event = 'site_pageview'), countIf(event = 'site_download')
    FROM events WHERE ${SITE_EV} AND ${IL_DAY} >= ${IL_TODAY} - 29
    GROUP BY day ORDER BY day LIMIT 100`,
  site_hourly: `
    SELECT formatDateTime(toStartOfHour(toTimeZone(timestamp, 'UTC')), '%Y-%m-%dT%H:00:00Z') AS hour, uniqExact(distinct_id)
    FROM events WHERE ${SITE_EV} AND timestamp > now() - INTERVAL 49 HOUR
    GROUP BY hour ORDER BY hour LIMIT 100`,
  site_lists: [
    siteList("site_country", "site_pageview", sstr("country")),
    siteList("site_referrer", "site_pageview", sstr("ref_host")),
    siteList("site_page", "site_pageview", sstr("page")),
    siteList("site_visitor_os", "site_pageview", sstr("os")),
    siteList("site_download_os", "site_download", sstr("target")),
  ].join(" UNION ALL "),
  site_recent: `
    SELECT timestamp, event, substring(distinct_id, 1, 10), toString(properties.page), toString(properties.target),
      toString(properties.country)
    FROM events WHERE event IN ('site_pageview', 'site_download') AND timestamp > now() - INTERVAL 1 DAY
    ORDER BY timestamp DESC LIMIT 20`,
};

/* up to 2 retries, after 3 s and 6 s, when PostHog is busy (503 "Queries are a little too busy right now", 429) */
async function hogql(host, project, key, query, attempt = 0) {
  const r = await fetchWithTimeout(`${host}/api/projects/${project}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    /* force_blocking: PostHog otherwise answers a repeated query from its own cache, minutes old (found in the
       audit: a fresh event was missing); the dashboard keeps its own 2-minute snapshot instead */
    body: JSON.stringify({ query: { kind: "HogQLQuery", query }, name: "maplehelper-admin", refresh: "force_blocking" }),
  }, 20000);
  if ((r.status === 503 || r.status === 429) && attempt < 2) {
    await new Promise((ok) => setTimeout(ok, 3000 * (attempt + 1)));
    return hogql(host, project, key, query, attempt + 1);
  }
  if (!r.ok) throw new Error(`PostHog ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).results || [];
}

const num = (v) => Number(v) || 0;

async function posthog() {
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  const project = process.env.POSTHOG_PROJECT_ID;
  if (!key || !project) return { configured: false };
  const host = (process.env.POSTHOG_HOST || "https://us.posthog.com").replace(/\/$/, "");
  const q = (sql) => hogql(host, project, key, sql);

  /* PostHog runs at most 3 queries of a project at once and queues the rest: the app's queries 3 at a time, then
     the site's, so none waits in that queue past its timeout */
  const app = await players.run(q);
  const res = await players.pool(QUERIES, q);
  const errors = app.errors.concat(res.errors);

  const st = (res.results.site && res.results.site[0]) || null;
  const lists = {};
  for (const [dim, value, count] of res.results.site_lists || []) {
    (lists[dim] = lists[dim] || []).push({ value: value || "", count: num(count) });
  }
  for (const k in lists) lists[k].sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));

  return {
    configured: true,
    errors,
    siteKeySet: !!process.env.POSTHOG_PROJECT_KEY,
    app,
    site: st ? {
      online: num(st[0]), visitorsToday: num(st[1]), pageviewsToday: num(st[2]), visitors30d: num(st[3]),
      pageviews30d: num(st[4]), downloadsToday: num(st[5]), downloads30d: num(st[6]), downloaders30d: num(st[7]),
    } : null,
    siteDaily: (res.results.site_daily || []).map((r) => ({ day: String(r[0]).slice(0, 10), visitors: num(r[1]), downloads: num(r[2]) })),
    siteHourly: (res.results.site_hourly || []).map((r) => ({ hour: r[0], visitors: num(r[1]) })),
    siteLists: lists,
    siteRecent: (res.results.site_recent || []).map((r) => ({
      at: r[0], event: r[1], who: r[2], page: r[3], target: r[4], country: r[5],
    })),
  };
}

/* ---------------------------------------------------------------- Vercel */

async function vercel() {
  const token = process.env.VERCEL_API_TOKEN;
  const project = process.env.VERCEL_PROJECT;
  const runtime = {
    env: process.env.VERCEL_ENV || "local",
    region: process.env.VERCEL_REGION || "",
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7),
    commitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE || "",
    node: process.version,
  };
  if (!token || !project) return { configured: false, runtime };

  const team = process.env.VERCEL_TEAM_ID ? `&teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : "";
  const data = await getJson(
    `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(project)}&limit=12${team}`,
    { Authorization: `Bearer ${token}` },
  );
  return {
    configured: true,
    runtime,
    deployments: (data.deployments || []).map((d) => ({
      url: d.url, state: d.state || d.readyState, target: d.target || "preview", created: d.created,
      ready: d.ready || null, branch: d.meta && d.meta.githubCommitRef,
      message: d.meta && d.meta.githubCommitMessage, sha: d.meta && (d.meta.githubCommitSha || "").slice(0, 7),
      inspector: d.inspectorUrl,
    })),
  };
}

module.exports = { github, uptime, posthog, vercel, QUERIES, hogql };
