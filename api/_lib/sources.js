/* Where the admin dashboard's numbers come from. Each source returns
   { configured: false } when its env vars are missing, or { error } when the call fails,
   so one broken source never blanks the whole dashboard. */
"use strict";

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

async function github() {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "maplehelper-admin", "X-GitHub-Api-Version": "2022-11-28" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const api = `https://api.github.com/repos/${REPO}`;
  const traffic = !!process.env.GITHUB_TOKEN;   // the traffic API needs push access

  const [repo, releases, runs, views, clones, referrers, paths, rate] = await Promise.all([
    getJson(api, headers),
    getJson(`${api}/releases?per_page=50`, headers),
    soft(getJson(`${api}/actions/runs?per_page=8`, headers)),
    traffic ? soft(getJson(`${api}/traffic/views`, headers)) : null,
    traffic ? soft(getJson(`${api}/traffic/clones`, headers)) : null,
    traffic ? soft(getJson(`${api}/traffic/popular/referrers`, headers)) : null,
    traffic ? soft(getJson(`${api}/traffic/popular/paths`, headers)) : null,
    soft(getJson("https://api.github.com/rate_limit", headers)),
  ]);

  const totals = { windows: 0, mac: 0, portable: 0, kbChecks: 0, kbDownloads: 0, updateChecks: 0, other: 0 };
  const rel = releases
    .filter((r) => !r.draft)
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

/* App events come from maplehelper/telemetry.py and presence.py (always on since app 0.18.1, under a lasting
   random id per install); site events from /api/collect.
   Presence pings of 0.15.0-0.18.0 ("legacy") carry a new random id for every run, so they can't be counted as
   unique installs: they are counted by their first_today / first_this_month / first_ping flags instead. */
const APP_EVENTS = "('app_started', 'app_updated', 'question_asked', 'voice_used', 'app_running', 'app_closed', " +
  "'window_opened', 'app_crashed', 'kb_updated', 'kb_update_failed')";
/* Source runs of the app (frozen = false) are development, not players. */
const NOT_DEV = "coalesce(toString(properties.frozen), '') != 'false'";
const SCOPE = `(startsWith(event, 'site_') OR (event IN ${APP_EVENTS} AND ${NOT_DEV}))`;
const LEGACY = "(event = 'app_running' AND coalesce(toString(properties.run_id), '') = '')";
const anyApp = `event IN ${APP_EVENTS}`;
const isApp = `(${anyApp} AND NOT ${LEGACY})`;
const isSite = "startsWith(event, 'site_')";
const truthy = (p) => `toString(properties.${p}) IN ('true', '1')`;
const COUNTRY = "coalesce(nullIf(toString(properties.$geoip_country_name), ''), '(unknown)')";
/* installs: unique lasting ids plus one per legacy ping carrying `flag` */
const players = (flag, when) => `uniqIf(distinct_id, ${isApp} AND ${when}) + countIf(${LEGACY} AND ${truthy(flag)} AND ${when})`;
const charProp = (dim, prop) => `
    UNION ALL SELECT '${dim}', toString(properties.${prop}) AS v, uniq(distinct_id) FROM events
      WHERE ${isApp} AND timestamp > now() - INTERVAL 30 DAY AND ${NOT_DEV} AND toString(properties.${prop}) != '' GROUP BY v`;

const QUERIES = {
  summary: `
    SELECT
      uniqIf(distinct_id, ${isSite} AND timestamp > now() - INTERVAL 5 MINUTE),
      uniqIf(distinct_id, ${anyApp} AND timestamp > now() - INTERVAL 15 MINUTE),
      ${players("first_today", "timestamp > now() - INTERVAL 1 DAY")},
      uniqIf(distinct_id, ${isApp} AND timestamp > now() - INTERVAL 7 DAY),
      ${players("first_this_month", "1")},
      countIf(event = 'question_asked' AND timestamp > now() - INTERVAL 1 DAY),
      countIf(event = 'question_asked'),
      countIf(event = 'question_asked' AND ${truthy("screenshot")}),
      countIf(event = 'voice_used'),
      countIf(event = 'app_started' AND ${truthy("fresh_install")}),
      countIf(event = 'app_updated'),
      uniqIf(distinct_id, event = 'site_pageview' AND timestamp > now() - INTERVAL 1 DAY),
      countIf(event = 'site_pageview' AND timestamp > now() - INTERVAL 1 DAY),
      uniqIf(distinct_id, event = 'site_pageview'),
      countIf(event = 'site_pageview'),
      countIf(event = 'site_download' AND timestamp > now() - INTERVAL 1 DAY),
      countIf(event = 'site_download'),
      countIf(event = 'app_crashed'),
      uniqIf(distinct_id, event = 'app_crashed'),
      countIf(event = 'kb_updated'),
      countIf(event = 'kb_update_failed'),
      avgIf(toFloat(properties.minutes), event = 'app_closed' AND toFloat(properties.minutes) < 1440),
      uniqIf(distinct_id, event = 'question_asked'),
      countIf(event = 'window_opened')
    FROM events
    WHERE timestamp > now() - INTERVAL 30 DAY AND ${SCOPE}`,
  /* all time: installs ever (lasting ids + legacy first pings), and those with a lasting id */
  totals: `
    SELECT
      uniqIf(distinct_id, ${isApp}) + countIf(${LEGACY} AND ${truthy("first_ping")}),
      uniqIf(distinct_id, ${isApp})
    FROM events
    WHERE ${anyApp} AND ${NOT_DEV}`,
  /* who comes back, by lasting id: seen before last week and again in it; seen on more than one day */
  retention: `
    SELECT
      countIf(first < now() - INTERVAL 7 DAY),
      countIf(first < now() - INTERVAL 7 DAY AND last > now() - INTERVAL 7 DAY),
      countIf(first < now() - INTERVAL 1 DAY),
      countIf(first < now() - INTERVAL 1 DAY AND days > 1)
    FROM (
      SELECT distinct_id, min(timestamp) AS first, max(timestamp) AS last, uniq(toDate(timestamp)) AS days
      FROM events WHERE ${isApp} AND ${NOT_DEV} GROUP BY distinct_id
    )`,
  daily: `
    SELECT toDate(timestamp) AS day,
      uniqIf(distinct_id, ${isApp}) + countIf(${LEGACY} AND ${truthy("first_today")}),
      countIf(event = 'question_asked'),
      countIf(event = 'app_started' AND ${truthy("fresh_install")}),
      uniqIf(distinct_id, event = 'site_pageview'),
      countIf(event = 'site_download'),
      countIf(event = 'app_updated'),
      countIf(event = 'app_crashed')
    FROM events
    WHERE timestamp > now() - INTERVAL 30 DAY AND ${SCOPE}
    GROUP BY day ORDER BY day`,
  hourly: `
    SELECT toStartOfHour(timestamp) AS hour,
      uniqIf(distinct_id, ${isSite}),
      uniqIf(distinct_id, ${anyApp})
    FROM events
    WHERE timestamp > now() - INTERVAL 48 HOUR AND ${SCOPE}
    GROUP BY hour ORDER BY hour`,
  breakdowns: `
    SELECT 'answered_by', toString(properties.answered_by) AS v, count() FROM events
      WHERE event = 'question_asked' AND timestamp > now() - INTERVAL 30 DAY AND ${NOT_DEV} GROUP BY v
    UNION ALL SELECT 'app_version', toString(properties.app_version) AS v, ${players("first_today", "1")} FROM events
      WHERE ${anyApp} AND timestamp > now() - INTERVAL 1 DAY AND ${NOT_DEV} GROUP BY v
    UNION ALL SELECT 'app_os', toString(properties.$os) AS v, ${players("first_this_month", "1")} FROM events
      WHERE ${anyApp} AND timestamp > now() - INTERVAL 30 DAY AND ${NOT_DEV} GROUP BY v
    UNION ALL SELECT 'app_country', ${COUNTRY} AS v, uniq(distinct_id) FROM events
      WHERE ${isApp} AND timestamp > now() - INTERVAL 30 DAY AND ${NOT_DEV} GROUP BY v
    ${charProp("app_language", "language")}
    ${charProp("app_provider", "provider")}
    ${charProp("char_class", "char_class")}
    ${charProp("char_job", "char_job")}
    UNION ALL SELECT 'char_level', concat(toString(toInt(floor(toFloat(properties.char_level) / 10)) * 10), '-',
        toString(toInt(floor(toFloat(properties.char_level) / 10)) * 10 + 9)) AS v, uniq(distinct_id) FROM events
      WHERE ${isApp} AND timestamp > now() - INTERVAL 30 DAY AND ${NOT_DEV} AND toFloat(properties.char_level) > 0 GROUP BY v
    UNION ALL SELECT 'window', toString(properties.window) AS v, count() FROM events
      WHERE event = 'window_opened' AND timestamp > now() - INTERVAL 30 DAY AND ${NOT_DEV} GROUP BY v
    UNION ALL SELECT 'crash', concat(toString(properties.error), ' @ ', toString(properties.where)) AS v, count() FROM events
      WHERE event = 'app_crashed' AND timestamp > now() - INTERVAL 30 DAY AND ${NOT_DEV} GROUP BY v
    UNION ALL SELECT 'kb_fail', toString(properties.reason) AS v, count() FROM events
      WHERE event = 'kb_update_failed' AND timestamp > now() - INTERVAL 30 DAY AND ${NOT_DEV} GROUP BY v
    UNION ALL SELECT 'site_country', toString(properties.country) AS v, uniq(distinct_id) FROM events
      WHERE event = 'site_pageview' AND timestamp > now() - INTERVAL 30 DAY GROUP BY v
    UNION ALL SELECT 'site_referrer', toString(properties.ref_host) AS v, count() FROM events
      WHERE event = 'site_pageview' AND timestamp > now() - INTERVAL 30 DAY GROUP BY v
    UNION ALL SELECT 'site_page', toString(properties.page) AS v, count() FROM events
      WHERE event = 'site_pageview' AND timestamp > now() - INTERVAL 30 DAY GROUP BY v
    UNION ALL SELECT 'site_visitor_os', toString(properties.os) AS v, uniq(distinct_id) FROM events
      WHERE event = 'site_pageview' AND timestamp > now() - INTERVAL 30 DAY GROUP BY v
    UNION ALL SELECT 'site_download_os', toString(properties.target) AS v, count() FROM events
      WHERE event = 'site_download' AND timestamp > now() - INTERVAL 30 DAY GROUP BY v`,
  recent: `
    SELECT timestamp, event, substring(distinct_id, 1, 6),
      toString(properties.app_version), toString(properties.$os), toString(properties.answered_by),
      coalesce(nullIf(toString(properties.country), ''), toString(properties.$geoip_country_name)),
      toString(properties.page), toString(properties.target),
      toString(properties.char_job), toString(properties.char_level), toString(properties.window),
      toString(properties.error)
    FROM events
    WHERE timestamp > now() - INTERVAL 1 DAY AND event NOT IN ('site_heartbeat', 'app_running') AND ${SCOPE}
    ORDER BY timestamp DESC LIMIT 40`,
};

async function hogql(host, project, key, query) {
  const r = await fetchWithTimeout(`${host}/api/projects/${project}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query }, name: "maplehelper-admin" }),
  }, 15000);
  if (!r.ok) throw new Error(`PostHog ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).results || [];
}

const num = (v) => Number(v) || 0;

async function posthog() {
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  const project = process.env.POSTHOG_PROJECT_ID;
  if (!key || !project) return { configured: false };
  const host = (process.env.POSTHOG_HOST || "https://us.posthog.com").replace(/\/$/, "");

  const names = Object.keys(QUERIES);
  const settled = await Promise.allSettled(names.map((n) => hogql(host, project, key, QUERIES[n])));
  const res = {};
  const errors = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") res[names[i]] = s.value;
    else errors.push(`${names[i]}: ${s.reason.message}`);
  });
  if (!Object.keys(res).length) throw new Error(errors[0] || "PostHog returned nothing");

  const s = (res.summary && res.summary[0]) || [];
  const breakdowns = {};
  for (const [dim, value, count] of res.breakdowns || []) {
    (breakdowns[dim] = breakdowns[dim] || []).push({ value: value || "(unknown)", count: num(count) });
  }
  for (const k in breakdowns) breakdowns[k].sort((a, b) => b.count - a.count).splice(12);

  return {
    configured: true,
    errors,
    siteKeySet: !!process.env.POSTHOG_PROJECT_KEY,
    summary: res.summary ? {
      siteOnline: num(s[0]), appActive15m: num(s[1]), appDau: num(s[2]), appWau: num(s[3]), appMau: num(s[4]),
      questions24h: num(s[5]), questions30d: num(s[6]), questionsWithScreenshot30d: num(s[7]),
      voice30d: num(s[8]), freshInstalls30d: num(s[9]), appUpdates30d: num(s[10]),
      siteVisitors24h: num(s[11]), pageviews24h: num(s[12]), siteVisitors30d: num(s[13]), pageviews30d: num(s[14]),
      siteDownloads24h: num(s[15]), siteDownloads30d: num(s[16]),
      crashes30d: num(s[17]), crashedInstalls30d: num(s[18]), kbUpdates30d: num(s[19]), kbFails30d: num(s[20]),
      avgSessionMin: Math.round(num(s[21]) * 10) / 10, askers30d: num(s[22]), windowsOpened30d: num(s[23]),
    } : null,
    totals: res.totals && res.totals[0] ? { installsEver: num(res.totals[0][0]), trackedInstalls: num(res.totals[0][1]) } : null,
    retention: res.retention && res.retention[0] ? {
      olderThan7d: num(res.retention[0][0]), back7d: num(res.retention[0][1]),
      olderThan1d: num(res.retention[0][2]), cameBack: num(res.retention[0][3]),
    } : null,
    daily: (res.daily || []).map((r) => ({
      day: String(r[0]).slice(0, 10), appUsers: num(r[1]), questions: num(r[2]), installs: num(r[3]),
      visitors: num(r[4]), downloads: num(r[5]), updates: num(r[6]), crashes: num(r[7]),
    })),
    hourly: (res.hourly || []).map((r) => ({ hour: r[0], siteVisitors: num(r[1]), appUsers: num(r[2]) })),
    breakdowns,
    recent: (res.recent || []).map((r) => ({
      at: r[0], event: r[1], who: r[2], version: r[3], os: r[4], answeredBy: r[5], country: r[6], page: r[7], target: r[8],
      job: r[9], level: r[10], window: r[11], error: r[12],
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

module.exports = { github, uptime, posthog, vercel };
