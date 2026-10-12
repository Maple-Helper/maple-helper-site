/* The dashboard's player and app numbers (/admin/): app 0.18.1 and later only.

   From 0.18.1 every event the app sends (maplehelper/telemetry.py, presence.py) goes under the install's lasting
   random id (settings["install_id"]), stats can't be turned off, and the app pings every 10 minutes while it runs.
   So every number here is a plain count of distinct install ids or of events: no flags, no estimates.

   Kept out: events of app versions before 0.18.1, and development runs (frozen = false).
   Days, weeks and months are in Israel time (Asia/Jerusalem). uniqExact everywhere (uniq is approximate), and every
   query has its own LIMIT (PostHog returns 100 rows otherwise). tools/verify-players.js re-counts all of it from the
   raw events. */
"use strict";

const TZ = "Asia/Jerusalem";
const MIN_VERSION = 18001;                 // 0.18.1 as major*1e6 + minor*1e3 + patch
const V = "toString(properties.app_version)";
const part = (i) => `toInt(extract(splitByChar('.', ${V})[${i}], '^[0-9]+'))`;
const VNUM = `(${part(1)} * 1000000 + ${part(2)} * 1000 + ${part(3)})`;
const EVENTS = "('app_running', 'app_started', 'app_updated', 'question_asked', 'voice_used', 'app_closed', " +
  "'window_opened', 'app_crashed', 'kb_updated', 'kb_update_failed')";
const flag = (p) => `coalesce(toString(properties.${p}), '') IN ('true', '1')`;
const NOT_DEV = "coalesce(toString(properties.frozen), '') != 'false'";
const SINCE = "timestamp >= toDateTime('2026-10-12 00:00:00', 'UTC')";   // 0.18.1 was released that day
const CLEAN = `(${SINCE} AND event IN ${EVENTS} AND ${NOT_DEV} AND ${VNUM} >= ${MIN_VERSION})`;
/* a question the player asked: not a 'Try again' / 'Ask Claude anyway' of the one before (retry = true) */
const ASKED = `(event = 'question_asked' AND NOT ${flag("retry")})`;
const LOCAL = `toTimeZone(timestamp, '${TZ}')`;
const DAY = `toDate(${LOCAL})`;
const TODAY = `toDate(toTimeZone(now(), '${TZ}'))`;
const str = (p) => `coalesce(nullIf(toString(properties.${p}), ''), '')`;
const LEVEL = `if(toFloat(properties.char_level) > 0, concat(toString(toInt(floor(toFloat(properties.char_level) / 10)) * 10),
    '-', toString(toInt(floor(toFloat(properties.char_level) / 10)) * 10 + 9)), '')`;
const TOP = "ORDER BY count() DESC, v LIMIT 50";

/* each install once, with the value of `expr` on its latest "running" ping of the last 30 days (a ping always
   carries the app's context; other events may not) */
const perInstall = (dim, expr) => `
    SELECT '${dim}', v, count() FROM (
      SELECT distinct_id, argMax(${expr}, timestamp) AS v FROM events
      WHERE ${CLEAN} AND event = 'app_running' AND timestamp > now() - INTERVAL 30 DAY GROUP BY distinct_id LIMIT 1000000
    ) GROUP BY v ${TOP}`;
const counted = (dim, ev, expr) => `
    SELECT '${dim}', ${expr} AS v, count() FROM events
    WHERE ${CLEAN} AND event = '${ev}' AND timestamp > now() - INTERVAL 30 DAY GROUP BY v ${TOP}`;

const QUERIES = {
  summary: `
    SELECT
      uniqExactIf(distinct_id, event = 'app_running' AND timestamp > now() - INTERVAL 11 MINUTE),
      uniqExactIf(distinct_id, ${DAY} = ${TODAY}),
      uniqExactIf(distinct_id, ${DAY} >= ${TODAY} - 6),
      uniqExactIf(distinct_id, toStartOfMonth(${DAY}) = toStartOfMonth(${TODAY})),
      uniqExact(distinct_id),
      uniqExactIf(distinct_id, event = 'app_started' AND ${flag("fresh_install")}),
      uniqExactIf(distinct_id, event = 'app_started' AND ${flag("fresh_install")} AND ${DAY} = ${TODAY}),
      countIf(${ASKED}),
      countIf(${ASKED} AND ${DAY} = ${TODAY}),
      countIf(${ASKED} AND ${flag("screenshot")}),
      uniqExactIf(distinct_id, ${ASKED}),
      countIf(event = 'voice_used'),
      countIf(event = 'app_crashed'),
      uniqExactIf(distinct_id, event = 'app_crashed'),
      countIf(event = 'kb_updated'),
      countIf(event = 'kb_update_failed'),
      countIf(event = 'app_closed' AND toFloat(properties.minutes) IS NOT NULL),
      sumIf(toFloat(properties.minutes), event = 'app_closed' AND toFloat(properties.minutes) IS NOT NULL),
      countIf(event = 'window_opened'),
      formatDateTime(min(${LOCAL}), '%Y-%m-%d %H:%i'),
      countIf(event = 'app_updated'),
      countIf(event = 'question_asked' AND ${flag("retry")}),
      uniqExactIf(distinct_id, event = 'app_started')
    FROM events WHERE ${CLEAN}`,
  /* per day: players, questions, installs new that day (first start after installing), installs seen on 0.18.1+
     for the first time that day (new installs and those that updated), updates */
  daily: `
    SELECT ${DAY} AS day,
      uniqExact(distinct_id),
      countIf(${ASKED}),
      uniqExactIf(distinct_id, event = 'app_started' AND ${flag("fresh_install")}),
      countIf(event = 'app_updated')
    FROM events WHERE ${CLEAN}
    GROUP BY day ORDER BY day LIMIT 1000`,
  first_seen: `
    SELECT first, count() FROM (
      SELECT distinct_id, min(${DAY}) AS first FROM events WHERE ${CLEAN} GROUP BY distinct_id LIMIT 1000000
    ) GROUP BY first ORDER BY first LIMIT 1000`,
  hourly: `
    SELECT formatDateTime(toStartOfHour(toTimeZone(timestamp, 'UTC')), '%Y-%m-%dT%H:00:00Z') AS hour,
      uniqExactIf(distinct_id, event = 'app_running')
    FROM events WHERE ${CLEAN} AND timestamp > now() - INTERVAL 49 HOUR
    GROUP BY hour ORDER BY hour LIMIT 100`,
  /* who comes back, by app starts (a session that runs past midnight is not a return): of the installs first
     seen before today, how many started the app on 2+ different days; of those first seen 7+ days ago, how many
     started it in the last 7 days */
  retention: `
    SELECT
      countIf(first < ${TODAY}), countIf(first < ${TODAY} AND start_days > 1),
      countIf(first <= ${TODAY} - 7), countIf(first <= ${TODAY} - 7 AND last_start >= ${TODAY} - 6)
    FROM (
      SELECT distinct_id, min(${DAY}) AS first, uniqExact(${DAY}) AS start_days, max(${DAY}) AS last_start
      FROM events WHERE ${CLEAN} AND event = 'app_started' GROUP BY distinct_id LIMIT 1000000
    )`,
  per_install: [
    perInstall("version", V),
    perInstall("os", str("$os")),
    perInstall("country", str("$geoip_country_name")),
    perInstall("char_level", LEVEL),
    perInstall("char_class", str("char_class")),
    perInstall("char_job", str("char_job")),
    perInstall("provider", str("provider")),
    perInstall("language", str("language")),
  ].join(" UNION ALL "),
  per_event: [
    counted("answered_by", "question_asked", `if(${flag("retry")}, concat(${str("answered_by")}, ' (retry)'), ${str("answered_by")})`),
    counted("window", "window_opened", "splitByChar(':', coalesce(toString(properties.window), ''))[1]"),   // history:<character> -> history
    counted("crash", "app_crashed", "concat(toString(properties.error), ' @ ', toString(properties.where))"),
    counted("kb_fail", "kb_update_failed", str("reason")),
    counted("updated_from", "app_updated", str("from_version")),
  ].join(" UNION ALL "),
  recent: `
    SELECT timestamp, event, substring(distinct_id, 1, 6), ${V}, toString(properties.$os),
      toString(properties.answered_by), toString(properties.$geoip_country_name), toString(properties.char_job),
      toString(properties.char_level), toString(properties.window), toString(properties.error), toString(properties.minutes)
    FROM events
    WHERE ${CLEAN} AND event != 'app_running' AND timestamp > now() - INTERVAL 1 DAY
    ORDER BY timestamp DESC LIMIT 50`,
};

const num = (v) => Number(v) || 0;

/* runs named queries 3 at a time (PostHog runs at most 3 of a project at once and queues the rest) */
async function pool(queries, hogql, deadline = Date.now() + 45000) {
  const names = Object.keys(queries);
  const results = {};
  const errors = [];
  let next = 0;
  async function worker() {
    while (next < names.length) {
      const n = names[next++];
      if (Date.now() > deadline) { errors.push(`${n}: skipped, out of time`); continue; }
      try { results[n] = await hogql(queries[n], deadline); } catch (e) { errors.push(`${n}: ${e.message}`); }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return { results, errors };
}

async function run(hogql, extra = {}) {
  /* the app's queries and the caller's (the site's) share one pool of 3 */
  const { results: all, errors } = await pool({ ...QUERIES, ...extra }, hogql);
  const res = all;

  const s = (res.summary && res.summary[0]) || null;
  const r = (res.retention && res.retention[0]) || null;
  const lists = {};
  for (const n of ["per_install", "per_event"]) {
    for (const [dim, value, count] of res[n] || []) (lists[dim] = lists[dim] || []).push({ value: value || "", count: num(count) });
  }
  for (const k in lists) lists[k].sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
  const firstSeen = {};
  for (const [d, c] of res.first_seen || []) firstSeen[String(d).slice(0, 10)] = num(c);

  return {
    extra: Object.fromEntries(Object.keys(extra).map((k) => [k, all[k]])),
    errors,
    failed: errors.map((e) => e.split(":")[0]),
    timezone: TZ,
    summary: s ? {
      online: num(s[0]), today: num(s[1]), week: num(s[2]), month: num(s[3]), ever: num(s[4]),
      newInstalls: num(s[5]), newInstallsToday: num(s[6]),
      questions: num(s[7]), questionsToday: num(s[8]), questionsWithScreenshot: num(s[9]), askers: num(s[10]),
      voice: num(s[11]), crashes: num(s[12]), crashedInstalls: num(s[13]), kbUpdates: num(s[14]), kbFails: num(s[15]),
      sessions: num(s[16]), sessionMinutes: num(s[17]), windowsOpened: num(s[18]), since: s[19] || null, updates: num(s[20]),
      retries: num(s[21]), started: num(s[22]),
    } : null,
    retention: r ? { before: num(r[0]), cameBack: num(r[1]), week: num(r[2]), activeWeek: num(r[3]) } : null,
    daily: !res.daily ? null : res.daily.map((x) => {
      const day = String(x[0]).slice(0, 10);
      return { day, players: num(x[1]), questions: num(x[2]), newInstalls: num(x[3]), updates: num(x[4]),
        firstSeen: res.first_seen ? firstSeen[day] || 0 : null };
    }),
    hourly: res.hourly ? res.hourly.map((x) => ({ hour: x[0], online: num(x[1]) })) : null,
    lists,
    recent: !res.recent ? null : res.recent.map((x) => ({
      at: x[0], event: x[1], who: x[2], version: x[3], os: x[4], answeredBy: x[5], country: x[6], job: x[7],
      level: x[8], window: x[9], error: x[10], minutes: x[11],
    })),
  };
}

module.exports = { QUERIES, run, pool, TZ, MIN_VERSION };
