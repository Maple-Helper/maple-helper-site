/* Checks the admin dashboard's numbers against PostHog's raw events.

   node tools/verify-stats.js        (needs POSTHOG_PERSONAL_API_KEY; POSTHOG_PROJECT_ID defaults to 643525)

   1. runs the dashboard's own queries (api/_lib/sources.js)
   2. downloads every raw app event with its full properties JSON and counts the same things here in plain JS,
      reading the JSON itself (not HogQL's toString/coalesce), so a wrong property filter shows up as a difference
   3. checks the flags' promise where it can be proven (0.18.1+ pings, under a lasting id): no flag sent twice in
      its period, and every install-day after the first carries first_today
   Any difference is printed and the exit code is 1. */
"use strict";
const { QUERIES, hogql } = require("../api/_lib/sources");

const key = process.env.POSTHOG_PERSONAL_API_KEY;
const project = process.env.POSTHOG_PROJECT_ID || "643525";
const host = (process.env.POSTHOG_HOST || "https://us.posthog.com").replace(/\/$/, "");
if (!key) { console.error("POSTHOG_PERSONAL_API_KEY is not set"); process.exit(2); }
const q = (sql) => hogql(host, project, key, sql);

/* every matching event, 10,000 at a time, paged by (timestamp, uuid) with microseconds, deduplicated by uuid */
async function all(where, until) {
  const out = new Map();
  let after = "1970-01-01 00:00:00.000000";
  for (;;) {
    const rows = await q(`SELECT toString(uuid), event, distinct_id,
        formatDateTime(toTimeZone(timestamp, 'UTC'), '%Y-%m-%d %H:%i:%S.%f') AS ts, properties
      FROM events
      WHERE ${where} AND toTimeZone(timestamp, 'UTC') >= toDateTime64('${after}', 6, 'UTC')
        AND toTimeZone(timestamp, 'UTC') <= toDateTime64('${until}', 6, 'UTC')
      ORDER BY timestamp, uuid LIMIT 10000`);
    let fresh = 0;
    for (const r of rows) if (!out.has(r[0])) { out.set(r[0], r); fresh++; }
    if (rows.length < 10000 || !fresh) break;
    after = rows[rows.length - 1][3];
  }
  return [...out.values()].map(([uuid, event, id, ts, props]) => {
    const p = typeof props === "string" ? JSON.parse(props || "{}") : (props || {});
    return { uuid, event, id, ts, day: ts.slice(0, 10), at: Date.parse(ts.replace(" ", "T") + "Z"), p };
  });
}

let failures = 0;
function check(name, dashboard, raw) {
  const ok = JSON.stringify(dashboard) === JSON.stringify(raw);
  if (!ok) failures++;
  console.log(`${ok ? "OK  " : "DIFF"} ${name}: dashboard ${JSON.stringify(dashboard)}  raw ${JSON.stringify(raw)}`);
}
const yes = (v) => v === true || v === "true" || v === 1 || v === "1";
const isDev = (e) => e.p.frozen === false || e.p.frozen === "false";

(async () => {
  /* one moment for both sides: the raw events are taken up to the time the dashboard queries ran (PostHog runs 3
     queries of a project at once, so these go one by one) */
  const now = Date.now();
  const until = new Date(now).toISOString().replace("T", " ").replace("Z", "") + "000";
  const [players] = await q(QUERIES.players);
  const [usage] = await q(QUERIES.usage);
  const daily = await q(QUERIES.daily);
  const [retention] = await q(QUERIES.retention);
  const events = await all("event IN ('app_running', 'question_asked', 'app_started', 'app_updated', 'voice_used')", until);
  const today = new Date(now).toISOString().slice(0, 10), month = today.slice(0, 7);
  const pings = events.filter((e) => e.event === "app_running" && !isDev(e));
  const usageEv = events.filter((e) => e.event !== "app_running" && !isDev(e));
  console.log(`raw: ${pings.length} presence pings, ${usageEv.length} usage events (dev runs left out)\n`);

  /* the dashboard's rule, recomputed: old pings (no run_id) count per flag, 0.18.1+ pings per distinct id */
  const installs = (list, f) => {
    const isNew = (e) => !!e.p.run_id;
    return list.filter((e) => !isNew(e) && yes(e.p[f])).length +
      new Set(list.filter((e) => isNew(e) && yes(e.p[f])).map((e) => e.id)).size;
  };
  check("players online (11 min)", Number(players[0]), new Set(pings.filter((e) => now - e.at < 11 * 60e3).map((e) => e.id)).size);
  check("players today (UTC)", Number(players[1]), installs(pings.filter((e) => e.day === today), "first_today"));
  check("players this month (UTC)", Number(players[2]), installs(pings.filter((e) => e.day.slice(0, 7) === month), "first_this_month"));
  check("players ever", Number(players[3]), installs(pings, "first_ping"));

  const oldest = new Date(now - 29 * 86400e3).toISOString().slice(0, 10);
  for (const r of daily) {
    const d = String(r[0]).slice(0, 10);
    if (d < oldest) continue;
    check(`players on ${d}`, Number(r[1]), installs(pings.filter((e) => e.day === d), "first_today"));
    check(`questions on ${d}`, Number(r[2]), usageEv.filter((e) => e.event === "question_asked" && e.day === d).length);
  }

  /* the flags' promise, where the id lasts (0.18.1+) */
  const newPings = pings.filter((e) => e.p.run_id);
  const seen = new Map();
  for (const e of newPings) {
    for (const [f, period] of [["first_ping", "ever"], ["first_today", e.day], ["first_this_month", e.day.slice(0, 7)]]) {
      if (!yes(e.p[f])) continue;
      const k = `${e.id}|${f}|${period}`;
      seen.set(k, (seen.get(k) || 0) + 1);
    }
  }
  const twice = [...seen].filter(([, n]) => n > 1);
  twice.forEach(([k, n]) => console.log(`     flag sent ${n} times: ${k.slice(0, 6)}…${k.slice(k.indexOf("|"))}`));
  console.log(`NOTE 0.18.1+ flags sent more than once: ${twice.length} (the dashboard counts each install once anyway)`);
  const firstDay = {};
  newPings.forEach((e) => { if (!firstDay[e.id] || e.day < firstDay[e.id]) firstDay[e.id] = e.day; });
  const days = new Set(newPings.map((e) => `${e.id}|${e.day}`));
  const flaggedDays = new Set(newPings.filter((e) => yes(e.p.first_today)).map((e) => `${e.id}|${e.day}`));
  const missing = [...days].filter((k) => !flaggedDays.has(k) && k.split("|")[1] !== firstDay[k.split("|")[0]]);
  console.log(`NOTE 0.18.1+ install-days without first_today after their first day: ${missing.length} (a flag lost on the way)`);

  /* retention, from the raw 0.18.1+ pings */
  const per = {};
  newPings.forEach((e) => { (per[e.id] = per[e.id] || new Set()).add(e.day); });
  const dayN = (n) => new Date(Date.parse(today + "T00:00:00Z") - n * 86400e3).toISOString().slice(0, 10);
  const ids = Object.values(per).map((s) => { const a = [...s].sort(); return { first: a[0], last: a[a.length - 1], n: a.length }; });
  check("came back", [Number(retention[0]), Number(retention[1])],
    [ids.filter((x) => x.first <= dayN(2)).length, ids.filter((x) => x.first <= dayN(2) && x.n > 1).length]);
  check("still active after a week", [Number(retention[2]), Number(retention[3])],
    [ids.filter((x) => x.first <= dayN(8)).length, ids.filter((x) => x.first <= dayN(8) && x.last >= dayN(6)).length]);

  const last30 = (e) => now - e.at < 30 * 86400e3;
  const qa = usageEv.filter((e) => e.event === "question_asked");
  check("questions today (UTC)", Number(usage[0]), qa.filter((e) => e.day === today).length);
  check("questions, 30 days", Number(usage[1]), qa.filter(last30).length);
  check("questions with a screenshot", Number(usage[2]), qa.filter((e) => last30(e) && yes(e.p.screenshot)).length);
  check("players who asked", Number(usage[3]), new Set(qa.filter(last30).map((e) => e.id)).size);
  check("voice questions", Number(usage[4]), usageEv.filter((e) => e.event === "voice_used" && last30(e)).length);
  check("new installs this month", Number(usage[5]), usageEv.filter((e) => e.event === "app_started" && yes(e.p.fresh_install) && e.day.slice(0, 7) === month).length);
  check("updates this month", Number(usage[6]), usageEv.filter((e) => e.event === "app_updated" && e.day.slice(0, 7) === month).length);

  console.log(failures ? `\n${failures} difference(s)` : "\nevery number matches the raw events");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
