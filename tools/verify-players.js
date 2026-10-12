/* Re-counts every number of the clean players page (/admin/players/, app 0.18.1+) from PostHog's raw events.

   node tools/verify-players.js        (needs POSTHOG_PERSONAL_API_KEY; POSTHOG_PROJECT_ID defaults to 643525)

   The page's numbers come from HogQL (api/_lib/players.js). Here every raw event is downloaded with its properties
   JSON and the same numbers are counted in plain JS: the version filter, the dev filter, Israel-time days and the
   per-install values are all redone here, not taken from HogQL. Any difference is printed; exit code 1. */
"use strict";
const { hogql } = require("../api/_lib/sources");
const players = require("../api/_lib/players");

const key = process.env.POSTHOG_PERSONAL_API_KEY;
const project = process.env.POSTHOG_PROJECT_ID || "643525";
const host = (process.env.POSTHOG_HOST || "https://us.posthog.com").replace(/\/$/, "");
if (!key) { console.error("POSTHOG_PERSONAL_API_KEY is not set"); process.exit(2); }
const q = (sql) => hogql(host, project, key, sql);

const EVENTS = ["app_running", "app_started", "app_updated", "question_asked", "voice_used", "app_closed",
  "window_opened", "app_crashed", "kb_updated", "kb_update_failed"];

async function all(until) {
  const out = new Map();
  let after = "2026-10-01 00:00:00.000000";          // 0.18.1 came out on 2026-10-12
  for (;;) {
    const rows = await q(`SELECT toString(uuid), event, distinct_id,
        formatDateTime(toTimeZone(timestamp, 'UTC'), '%Y-%m-%d %H:%i:%S.%f') AS ts, properties
      FROM events
      WHERE event IN (${EVENTS.map((e) => `'${e}'`).join(", ")})
        AND toTimeZone(timestamp, 'UTC') >= toDateTime64('${after}', 6, 'UTC')
        AND toTimeZone(timestamp, 'UTC') <= toDateTime64('${until}', 6, 'UTC')
      ORDER BY timestamp, uuid LIMIT 10000`);
    let fresh = 0;
    for (const r of rows) if (!out.has(r[0])) { out.set(r[0], r); fresh++; }
    if (rows.length < 10000 || !fresh) break;
    after = rows[rows.length - 1][3];
  }
  const ilDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" });
  return [...out.values()].map(([uuid, event, id, ts, props]) => {
    const p = typeof props === "string" ? JSON.parse(props || "{}") : (props || {});
    const at = Date.parse(ts.replace(" ", "T") + "Z");
    return { uuid, event, id, at, day: ilDay.format(new Date(at)), p };
  });
}

/* "0.18.1" -> 18001; anything after the digits of a part ("0b1") is ignored, as in the page's HogQL */
function vnum(v) {
  const parts = String(v == null ? "" : v).split(".");
  const n = (i) => { const m = /^[0-9]+/.exec(parts[i] || ""); return m ? Number(m[0]) : NaN; };
  return n(0) * 1e6 + n(1) * 1e3 + n(2);
}
const yes = (v) => v === true || v === "true" || v === 1 || v === "1";

let failures = 0;
function check(name, page, raw) {
  const ok = JSON.stringify(page) === JSON.stringify(raw);
  if (!ok) failures++;
  console.log(`${ok ? "OK  " : "DIFF"} ${name}: page ${JSON.stringify(page)}  raw ${JSON.stringify(raw)}`);
}

(async () => {
  const now = Date.now();
  const until = new Date(now).toISOString().replace("T", " ").replace("Z", "") + "000";
  const page = await players.run(q);
  if (page.errors.length) console.log("page query errors:", page.errors);
  const all_ = await all(until);
  const E = all_.filter((e) => !(e.p.frozen === false || e.p.frozen === "false") && vnum(e.p.app_version) >= players.MIN_VERSION);
  console.log(`raw: ${all_.length} app events since 2026-10-01, ${E.length} of them 0.18.1+ and not development\n`);

  const ilDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" });
  const today = ilDay.format(new Date(now));
  const minus = (d, n) => new Date(Date.parse(d + "T12:00:00Z") - n * 86400e3).toISOString().slice(0, 10);
  const ids = (list) => new Set(list.map((e) => e.id)).size;
  const ev = (name) => E.filter((e) => e.event === name);
  const s = page.summary;

  check("online now (11 min)", s.online, ids(ev("app_running").filter((e) => now - e.at < 11 * 60e3)));
  check("today", s.today, ids(E.filter((e) => e.day === today)));
  check("last 7 days", s.week, ids(E.filter((e) => e.day >= minus(today, 6))));
  check("this month", s.month, ids(E.filter((e) => e.day.slice(0, 7) === today.slice(0, 7))));
  check("all players", s.ever, ids(E));
  const fresh = ev("app_started").filter((e) => yes(e.p.fresh_install));
  check("new installs", s.newInstalls, ids(fresh));
  check("new installs today", s.newInstallsToday, ids(fresh.filter((e) => e.day === today)));
  check("updates", s.updates, ev("app_updated").length);
  const qa = ev("question_asked");
  check("questions", s.questions, qa.length);
  check("questions today", s.questionsToday, qa.filter((e) => e.day === today).length);
  check("questions with a screenshot", s.questionsWithScreenshot, qa.filter((e) => yes(e.p.screenshot)).length);
  check("players who asked", s.askers, ids(qa));
  check("voice", s.voice, ev("voice_used").length);
  check("crashes", s.crashes, ev("app_crashed").length);
  check("installs that crashed", s.crashedInstalls, ids(ev("app_crashed")));
  check("game-data updates", s.kbUpdates, ev("kb_updated").length);
  check("game-data failures", s.kbFails, ev("kb_update_failed").length);
  const closed = ev("app_closed").filter((e) => e.p.minutes != null && !isNaN(Number(e.p.minutes)));
  check("sessions", s.sessions, closed.length);
  check("session minutes", Math.round(s.sessionMinutes * 10), Math.round(closed.reduce((a, e) => a + Number(e.p.minutes), 0) * 10));
  check("windows opened", s.windowsOpened, ev("window_opened").length);

  /* days */
  const byDay = {};
  E.forEach((e) => { (byDay[e.day] = byDay[e.day] || []).push(e); });
  const first = {};
  E.forEach((e) => { if (!first[e.id] || e.day < first[e.id]) first[e.id] = e.day; });
  for (const r of page.daily) {
    const list = byDay[r.day] || [];
    check(`${r.day} players`, r.players, ids(list));
    check(`${r.day} questions`, r.questions, list.filter((e) => e.event === "question_asked").length);
    check(`${r.day} new installs`, r.newInstalls, ids(list.filter((e) => e.event === "app_started" && yes(e.p.fresh_install))));
    check(`${r.day} updates`, r.updates, list.filter((e) => e.event === "app_updated").length);
    check(`${r.day} first seen`, r.firstSeen, Object.values(first).filter((d) => d === r.day).length);
  }
  check("days listed", page.daily.map((r) => r.day), Object.keys(byDay).sort());

  /* retention */
  const span = {};
  E.forEach((e) => { const x = (span[e.id] = span[e.id] || { first: e.day, last: e.day, days: new Set() }); x.days.add(e.day); if (e.day < x.first) x.first = e.day; if (e.day > x.last) x.last = e.day; });
  const S = Object.values(span);
  check("came back", [page.retention.before, page.retention.cameBack],
    [S.filter((x) => x.first < today).length, S.filter((x) => x.first < today && x.days.size > 1).length]);
  check("still active after a week", [page.retention.week, page.retention.activeWeek],
    [S.filter((x) => x.first <= minus(today, 7)).length, S.filter((x) => x.first <= minus(today, 7) && x.last >= minus(today, 6)).length]);

  /* per-install lists: each install's value on its latest event of the last 30 days */
  const latest = {};
  E.filter((e) => now - e.at < 30 * 86400e3).forEach((e) => { if (!latest[e.id] || e.at >= latest[e.id].at) latest[e.id] = e; });
  const level = (p) => { const n = Number(p.char_level); if (!(n > 0)) return ""; const b = Math.floor(n / 10) * 10; return `${b}-${b + 9}`; };
  const str = (v) => (v == null ? "" : String(v));
  const tally = (fn) => {
    const m = {};
    Object.values(latest).forEach((e) => { const v = fn(e.p); m[v] = (m[v] || 0) + 1; });
    return Object.entries(m).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  };
  const L = page.lists;
  const sorted = (x) => (x || []).slice().sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
  check("list: version", sorted(L.version), tally((p) => str(p.app_version)));
  check("list: os", sorted(L.os), tally((p) => str(p.$os)));
  check("list: country", sorted(L.country), tally((p) => str(p.$geoip_country_name)));
  check("list: level", sorted(L.char_level), tally(level));
  check("list: class", sorted(L.char_class), tally((p) => str(p.char_class)));
  check("list: job", sorted(L.char_job), tally((p) => str(p.char_job)));
  check("list: provider", sorted(L.provider), tally((p) => str(p.provider)));
  check("list: language", sorted(L.language), tally((p) => str(p.language)));
  const count = (evName, fn) => {
    const m = {};
    E.filter((e) => e.event === evName && now - e.at < 30 * 86400e3).forEach((e) => { const v = fn(e.p); m[v] = (m[v] || 0) + 1; });
    return Object.entries(m).map(([value, c]) => ({ value, count: c })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  };
  check("list: who answered", sorted(L.answered_by), count("question_asked", (p) => str(p.answered_by)));
  check("list: windows", sorted(L.window), count("window_opened", (p) => str(p.window)));
  check("list: updated from", sorted(L.updated_from), count("app_updated", (p) => str(p.from_version)));
  check("list: crashes", sorted(L.crash), count("app_crashed", (p) => `${str(p.error)} @ ${str(p.where)}`));
  check("list: kb failures", sorted(L.kb_fail), count("kb_update_failed", (p) => str(p.reason)));

  console.log(failures ? `\n${failures} difference(s)` : "\nevery number matches the raw events");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
