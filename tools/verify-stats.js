/* Checks the admin dashboard's player numbers against PostHog's raw events.

   node tools/verify-stats.js        (needs POSTHOG_PERSONAL_API_KEY; POSTHOG_PROJECT_ID defaults to 643525)

   1. runs the dashboard's own queries (api/_lib/sources.js)
   2. downloads every raw presence ping and usage event and counts the same things here, in plain JS
   3. checks the flags' promise: no install sends first_today twice in a UTC day, first_this_month twice in a month,
      or first_ping twice (provable for 0.18.1+ installs, which ping under a lasting id)
   Any difference is printed and the exit code is 1. */
"use strict";
const { QUERIES, hogql } = require("../api/_lib/sources");

const key = process.env.POSTHOG_PERSONAL_API_KEY;
const project = process.env.POSTHOG_PROJECT_ID || "643525";
const host = (process.env.POSTHOG_HOST || "https://us.posthog.com").replace(/\/$/, "");
if (!key) { console.error("POSTHOG_PERSONAL_API_KEY is not set"); process.exit(2); }
const q = (sql) => hogql(host, project, key, sql);

const truthy = (v) => v === true || v === "true" || v === 1 || v === "1";
const utcDay = (t) => new Date(t).toISOString().slice(0, 10);

/* every row of a query, 10,000 at a time, by timestamp */
async function all(select, where) {
  const out = [];
  let after = "1970-01-01 00:00:00";
  for (;;) {
    const rows = await q(`SELECT ${select}, toString(toTimeZone(timestamp, 'UTC')) AS ts_utc FROM events
      WHERE ${where} AND toTimeZone(timestamp, 'UTC') > toDateTime('${after}', 'UTC')
      ORDER BY timestamp LIMIT 10000`);
    out.push(...rows);
    if (rows.length < 10000) return out;
    after = rows[rows.length - 1][rows[0].length - 1].slice(0, 19);
  }
}

let failures = 0;
function check(name, dashboard, raw) {
  const ok = JSON.stringify(dashboard) === JSON.stringify(raw);
  if (!ok) failures++;
  console.log(`${ok ? "OK  " : "DIFF"} ${name}: dashboard ${JSON.stringify(dashboard)}  raw ${JSON.stringify(raw)}`);
}

(async () => {
  const [players] = await q(QUERIES.players);
  const [usage] = await q(QUERIES.usage);
  const daily = await q(QUERIES.daily);

  const pings = await all(
    "distinct_id, toString(properties.first_ping), toString(properties.first_today), toString(properties.first_this_month), " +
    "coalesce(toString(properties.run_id), ''), toString(properties.app_version), toString(properties.$os), timestamp",
    "event = 'app_running' AND coalesce(toString(properties.frozen), '') != 'false'");
  const usageRows = await all(
    "event, distinct_id, toString(properties.screenshot), toString(properties.fresh_install), timestamp",
    "event IN ('question_asked', 'app_started', 'app_updated', 'voice_used') AND coalesce(toString(properties.frozen), '') != 'false'");
  console.log(`raw: ${pings.length} presence pings, ${usageRows.length} usage events\n`);

  const now = Date.now();
  const today = utcDay(now), month = today.slice(0, 7);
  const P = pings.map((r) => ({
    id: r[0], first: truthy(r[1]), today: truthy(r[2]), month: truthy(r[3]), run: r[4], version: r[5], os: r[6],
    at: new Date(r[7]).getTime(), day: r[8].slice(0, 10),
  }));

  check("players online (11 min)", Number(players[0]), new Set(P.filter((p) => now - p.at < 11 * 60e3).map((p) => p.id)).size);
  check("players today (UTC)", Number(players[1]), P.filter((p) => p.today && p.day === today).length);
  check("players this month (UTC)", Number(players[2]), P.filter((p) => p.month && p.day.slice(0, 7) === month).length);
  check("players ever", Number(players[3]), P.filter((p) => p.first).length);

  const perDay = {};
  P.filter((p) => p.today).forEach((p) => { perDay[p.day] = (perDay[p.day] || 0) + 1; });
  daily.forEach((r) => {
    const d = String(r[0]).slice(0, 10);
    if (Number(r[1]) || perDay[d]) check(`players on ${d}`, Number(r[1]), perDay[d] || 0);
  });

  /* the flags' promise, provable where the id lasts (0.18.1+) */
  const seen = {};
  let dupes = 0;
  P.filter((p) => p.run).forEach((p) => {
    for (const [f, period] of [["first", "ever"], ["today", p.day], ["month", p.day.slice(0, 7)]]) {
      if (!p[f]) continue;
      const k = `${p.id}|${f}|${period}`;
      if (seen[k]) { dupes++; console.log(`DIFF flag ${f} sent twice by ${p.id.slice(0, 6)} for ${period}`); }
      seen[k] = 1;
    }
  });
  check("0.18.1+ installs sending a flag twice", 0, dupes);
  /* and every 0.18.1+ install that pinged on a day sent first_today that day (or had sent it on an older version) */
  const idDays = new Set(P.filter((p) => p.run).map((p) => `${p.id}|${p.day}`));
  const flagged = new Set(P.filter((p) => p.run && p.today).map((p) => `${p.id}|${p.day}`));
  const firstRunDay = {};
  P.filter((p) => p.run).forEach((p) => { if (!firstRunDay[p.id] || p.day < firstRunDay[p.id]) firstRunDay[p.id] = p.day; });
  const missing = [...idDays].filter((k) => !flagged.has(k) && k.split("|")[1] !== firstRunDay[k.split("|")[0]]);
  check("0.18.1+ install-days without first_today (after their first day)", 0, missing.length);

  const U = usageRows.map((r) => ({ event: r[0], id: r[1], shot: truthy(r[2]), fresh: truthy(r[3]), at: new Date(r[4]).getTime(), day: r[5].slice(0, 10) }));
  const last30 = (u) => now - u.at < 30 * 86400e3;
  check("questions today (UTC)", Number(usage[0]), U.filter((u) => u.event === "question_asked" && u.day === today).length);
  check("questions, 30 days", Number(usage[1]), U.filter((u) => u.event === "question_asked" && last30(u)).length);
  check("questions with a screenshot", Number(usage[2]), U.filter((u) => u.event === "question_asked" && last30(u) && u.shot).length);
  check("players who asked", Number(usage[3]), new Set(U.filter((u) => u.event === "question_asked" && last30(u)).map((u) => u.id)).size);
  check("voice questions", Number(usage[4]), U.filter((u) => u.event === "voice_used" && last30(u)).length);
  check("new installs this month", Number(usage[5]), U.filter((u) => u.event === "app_started" && u.fresh && u.day.slice(0, 7) === month).length);
  check("updates this month", Number(usage[6]), U.filter((u) => u.event === "app_updated" && u.day.slice(0, 7) === month).length);

  console.log(failures ? `\n${failures} difference(s)` : "\nevery number matches the raw events");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
