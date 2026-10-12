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

/* How each number is counted, so that every one of them is exact for what its label says:

   Players come from the app's presence ping (event app_running, maplehelper/presence.py, app 0.15.0+): sent at
   start and every 10 minutes. It carries three flags kept in the install's own settings file: first_ping (the
   first ping this install ever sent), first_today (the first of its UTC day), first_this_month (the first of its
   UTC month). A flag is stored only after PostHog took the ping, so each install sends each flag exactly once
   per period, whatever its version and however often it restarts: counting flags counts installs exactly.
   Pings before 0.18.1 have a new random id per run (no lasting id), so unique ids are never used for those.

   0.18.1+ pings also carry run_id and are sent under the install's lasting id: the country, character and
   setting breakdowns and the "came back" share use only those, counting each install once (its latest value).

   Usage events (question_asked, app_started, ...) come from installs whose usage stats were on: all of them from
   0.18.1, before that only the installs that hadn't turned them off.

   Days and months are UTC (the flags' own clock), whatever the PostHog project's time zone is. */
const NOT_DEV = "coalesce(toString(properties.frozen), '') != 'false'";   // source runs are development
const PING = `(event = 'app_running' AND ${NOT_DEV})`;
const NEW_PING = `(${PING} AND coalesce(toString(properties.run_id), '') != '')`;
const flag = (p) => `toString(properties.${p}) IN ('true', '1')`;
const UTC_DAY = "toDate(toTimeZone(timestamp, 'UTC'))";
const TODAY = "toDate(toTimeZone(now(), 'UTC'))";
const THIS_MONTH = `toStartOfMonth(${UTC_DAY}) = toStartOfMonth(${TODAY})`;
const ONLINE = "timestamp > now() - INTERVAL 11 MINUTE";   // one ping every 10 minutes
const APP_EVENTS = "('app_started', 'app_updated', 'question_asked', 'voice_used', 'app_closed', 'window_opened', " +
  "'app_crashed', 'kb_updated', 'kb_update_failed')";
const USAGE = `(event IN ${APP_EVENTS} AND ${NOT_DEV})`;
const SITE_EV = "startsWith(event, 'site_')";
const LAST30 = "timestamp > now() - INTERVAL 30 DAY";

/* breakdown rows are [dimension, value, count]; JS keeps the top 15 of each */
const str = (p) => `coalesce(nullIf(toString(properties.${p}), ''), '')`;
const LEVEL = `if(toFloat(properties.char_level) > 0, concat(toString(toInt(floor(toFloat(properties.char_level) / 10)) * 10),
    '-', toString(toInt(floor(toFloat(properties.char_level) / 10)) * 10 + 9)), '')`;
/* each install once, with its latest value of `expr`, among 0.18.1+ pings of the last 30 days */
const latestPerInstall = (dim, expr) => `
    SELECT '${dim}', v, count() FROM (
      SELECT distinct_id, argMax(${expr}, timestamp) AS v FROM events
      WHERE ${NEW_PING} AND ${LAST30} GROUP BY distinct_id
    ) GROUP BY v`;
const counted = (dim, where, expr) => `
    SELECT '${dim}', ${expr} AS v, count() FROM events WHERE ${where} AND ${LAST30} GROUP BY v`;

const QUERIES = {
  players: `
    SELECT
      uniqIf(distinct_id, ${ONLINE}),
      countIf(${flag("first_today")} AND ${UTC_DAY} = ${TODAY}),
      countIf(${flag("first_this_month")} AND ${THIS_MONTH}),
      countIf(${flag("first_ping")}),
      countIf(${flag("first_ping")} AND ${THIS_MONTH})
    FROM events WHERE ${PING}`,
  usage: `
    SELECT
      countIf(event = 'question_asked' AND ${UTC_DAY} = ${TODAY}),
      countIf(event = 'question_asked' AND ${LAST30}),
      countIf(event = 'question_asked' AND ${LAST30} AND ${flag("screenshot")}),
      uniqIf(distinct_id, event = 'question_asked' AND ${LAST30}),
      countIf(event = 'voice_used' AND ${LAST30}),
      countIf(event = 'app_started' AND ${flag("fresh_install")} AND ${THIS_MONTH}),
      countIf(event = 'app_updated' AND ${THIS_MONTH}),
      countIf(event = 'app_crashed' AND ${LAST30}),
      uniqIf(distinct_id, event = 'app_crashed' AND ${LAST30}),
      countIf(event = 'kb_updated' AND ${LAST30}),
      countIf(event = 'kb_update_failed' AND ${LAST30}),
      avgIf(toFloat(properties.minutes), event = 'app_closed' AND ${LAST30}),
      countIf(event = 'app_closed' AND ${LAST30})
    FROM events WHERE ${USAGE}`,
  site: `
    SELECT
      uniqIf(distinct_id, timestamp > now() - INTERVAL 5 MINUTE),
      uniqIf(distinct_id, event = 'site_pageview' AND ${UTC_DAY} = ${TODAY}),
      countIf(event = 'site_pageview' AND ${UTC_DAY} = ${TODAY}),
      uniqIf(distinct_id, event = 'site_pageview' AND ${LAST30}),
      countIf(event = 'site_pageview' AND ${LAST30}),
      countIf(event = 'site_download' AND ${UTC_DAY} = ${TODAY}),
      countIf(event = 'site_download' AND ${LAST30})
    FROM events WHERE ${SITE_EV}`,
  /* of the installs first seen on 0.18.1+ before today (UTC), how many ran on 2+ UTC days; of those first seen
     8+ days ago, how many ran in the last 7 days */
  retention: `
    SELECT
      countIf(first < ${TODAY}), countIf(first < ${TODAY} AND days > 1),
      countIf(first < ${TODAY} - 7), countIf(first < ${TODAY} - 7 AND last >= ${TODAY} - 6)
    FROM (
      SELECT distinct_id, min(${UTC_DAY}) AS first, max(${UTC_DAY}) AS last, uniq(${UTC_DAY}) AS days
      FROM events WHERE ${NEW_PING} GROUP BY distinct_id
    )`,
  daily: `
    SELECT ${UTC_DAY} AS day,
      countIf(${PING} AND ${flag("first_today")}),
      countIf(${PING} AND ${flag("first_ping")}),
      countIf(event = 'question_asked' AND ${NOT_DEV}),
      countIf(event = 'app_started' AND ${NOT_DEV} AND ${flag("fresh_install")}),
      countIf(event = 'app_updated' AND ${NOT_DEV}),
      uniqIf(distinct_id, event = 'site_pageview'),
      countIf(event = 'site_download')
    FROM events
    WHERE ${LAST30} AND (${PING} OR ${USAGE} OR ${SITE_EV})
    GROUP BY day ORDER BY day`,
  hourly: `
    SELECT toStartOfHour(timestamp) AS hour, uniqIf(distinct_id, ${SITE_EV}), uniqIf(distinct_id, ${PING})
    FROM events
    WHERE timestamp > now() - INTERVAL 48 HOUR AND (${SITE_EV} OR ${PING})
    GROUP BY hour ORDER BY hour`,
  b_players: `
    SELECT 'version_now', toString(properties.app_version) AS v, uniq(distinct_id) FROM events
      WHERE ${PING} AND ${ONLINE} GROUP BY v
    UNION ALL SELECT 'version_today', toString(properties.app_version) AS v, count() FROM events
      WHERE ${PING} AND ${flag("first_today")} AND ${UTC_DAY} = ${TODAY} GROUP BY v
    UNION ALL SELECT 'os_month', toString(properties.$os) AS v, count() FROM events
      WHERE ${PING} AND ${flag("first_this_month")} AND ${THIS_MONTH} GROUP BY v`,
  b_installs: [
    latestPerInstall("country", str("$geoip_country_name")),
    latestPerInstall("char_level", LEVEL),
    latestPerInstall("char_class", str("char_class")),
    latestPerInstall("char_job", str("char_job")),
    latestPerInstall("provider", str("provider")),
    latestPerInstall("language", str("language")),
  ].join(" UNION ALL "),
  b_events: [
    counted("answered_by", `event = 'question_asked' AND ${NOT_DEV}`, str("answered_by")),
    counted("window", `event = 'window_opened' AND ${NOT_DEV}`, str("window")),
    counted("crash", `event = 'app_crashed' AND ${NOT_DEV}`, "concat(toString(properties.error), ' @ ', toString(properties.where))"),
    counted("kb_fail", `event = 'kb_update_failed' AND ${NOT_DEV}`, str("reason")),
    counted("site_country", "event = 'site_pageview'", str("country")),
    counted("site_referrer", "event = 'site_pageview'", str("ref_host")),
    counted("site_page", "event = 'site_pageview'", str("page")),
    counted("site_visitor_os", "event = 'site_pageview'", str("os")),
    counted("site_download_os", "event = 'site_download'", str("target")),
  ].join(" UNION ALL "),
  recent: `
    SELECT timestamp, event, substring(distinct_id, 1, 6),
      toString(properties.app_version), toString(properties.$os), toString(properties.answered_by),
      coalesce(nullIf(toString(properties.country), ''), toString(properties.$geoip_country_name)),
      toString(properties.page), toString(properties.target),
      toString(properties.char_job), toString(properties.char_level), toString(properties.window),
      toString(properties.error)
    FROM events
    WHERE timestamp > now() - INTERVAL 1 DAY AND (${USAGE} OR event IN ('site_pageview', 'site_download'))
    ORDER BY timestamp DESC LIMIT 40`,
};

async function hogql(host, project, key, query) {
  const r = await fetchWithTimeout(`${host}/api/projects/${project}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query }, name: "maplehelper-admin" }),
  }, 20000);
  if (!r.ok) throw new Error(`PostHog ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).results || [];
}

const num = (v) => Number(v) || 0;

async function posthog() {
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  const project = process.env.POSTHOG_PROJECT_ID;
  if (!key || !project) return { configured: false };
  const host = (process.env.POSTHOG_HOST || "https://us.posthog.com").replace(/\/$/, "");

  /* PostHog runs at most 3 queries of a project at once and queues the rest: 3 at a time here, so none of them
     waits in that queue past its timeout ("This operation was aborted") */
  const names = Object.keys(QUERIES);
  const res = {};
  const errors = [];
  let next = 0;
  async function worker() {
    while (next < names.length) {
      const n = names[next++];
      try {
        res[n] = await hogql(host, project, key, QUERIES[n]);
      } catch (e) {
        errors.push(`${n}: ${e.message}`);
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  if (!Object.keys(res).length) throw new Error(errors[0] || "PostHog returned nothing");

  const row = (n) => (res[n] && res[n][0]) || null;
  const p = row("players"), u = row("usage"), st = row("site"), rt = row("retention");
  const breakdowns = {};
  names.filter((n) => n.startsWith("b_")).forEach((n) => {
    for (const [dim, value, count] of res[n] || []) {
      (breakdowns[dim] = breakdowns[dim] || []).push({ value: value || "", count: num(count) });
    }
  });
  for (const k in breakdowns) breakdowns[k].sort((a, b) => b.count - a.count).splice(15);

  return {
    configured: true,
    errors,
    siteKeySet: !!process.env.POSTHOG_PROJECT_KEY,
    players: p ? {
      online: num(p[0]), today: num(p[1]), month: num(p[2]), ever: num(p[3]), firstSeenMonth: num(p[4]),
    } : null,
    usage: u ? {
      questionsToday: num(u[0]), questions30d: num(u[1]), questionsWithScreenshot30d: num(u[2]), askers30d: num(u[3]),
      voice30d: num(u[4]), freshInstallsMonth: num(u[5]), updatesMonth: num(u[6]), crashes30d: num(u[7]),
      crashedInstalls30d: num(u[8]), kbUpdates30d: num(u[9]), kbFails30d: num(u[10]),
      avgSessionMin: num(u[12]) ? Math.round(num(u[11]) * 10) / 10 : null, sessions30d: num(u[12]),
    } : null,
    site: st ? {
      online: num(st[0]), visitorsToday: num(st[1]), pageviewsToday: num(st[2]), visitors30d: num(st[3]),
      pageviews30d: num(st[4]), downloadsToday: num(st[5]), downloads30d: num(st[6]),
    } : null,
    retention: rt ? {
      eligible: num(rt[0]), cameBack: num(rt[1]), eligible7: num(rt[2]), active7: num(rt[3]),
    } : null,
    daily: (res.daily || []).map((r) => ({
      day: String(r[0]).slice(0, 10), players: num(r[1]), firstPings: num(r[2]), questions: num(r[3]),
      installs: num(r[4]), updates: num(r[5]), visitors: num(r[6]), downloads: num(r[7]),
    })),
    hourly: (res.hourly || []).map((r) => ({ hour: r[0], siteVisitors: num(r[1]), appRuns: num(r[2]) })),
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

module.exports = { github, uptime, posthog, vercel, QUERIES, hogql };
