/* Maple Helper admin dashboard. Talks only to /api/admin/*; the session is an HttpOnly cookie.
   English and Hebrew: every text goes through t(); the choice is kept per browser. */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var REFRESH_MS = 2 * 60 * 1000;      // the server keeps a snapshot for 2 minutes (PostHog's query limits)
  var data = null;
  var timer = null;
  var nf = new Intl.NumberFormat("en");
  var compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

  /* ---------------------------------------------------------------- language */

  var S = {
    title: ["Maple Helper admin", "ניהול Maple Helper"],
    managers_only: ["Site managers only.", "למנהלי האתר בלבד."],
    password: ["Password", "סיסמה"],
    sign_in: ["Sign in", "כניסה"],
    auto_refresh: ["Auto-refresh", "רענון אוטומטי"],
    refresh: ["Refresh", "רענון"],
    sign_out: ["Sign out", "יציאה"],
    right_now: ["Right now", "עכשיו"],
    downloads: ["Downloads", "הורדות"],
    downloads_src: ["GitHub Releases, all time", "GitHub Releases, מאז ומעולם"],
    players_usage: ["Players and app usage", "שחקנים ושימוש באפליקציה"],
    players_src: ["PostHog · days and months in UTC", "PostHog · ימים וחודשים לפי UTC"],
    website: ["Website", "האתר"],
    website_src: ["anonymous visit counts", "ספירת ביקורים אנונימית"],
    gh_repo: ["GitHub repository", "מאגר GitHub"],
    monitoring: ["Monitoring", "ניטור"],
    uptime_checks: ["Uptime checks", "בדיקות זמינות"],
    checked_each: ["checked on each refresh", "נבדק בכל רענון"],
    builds: ["Builds and releases", "בניות וגרסאות"],
    deploys: ["Site deployments", "פריסות האתר"],
    recent: ["Recent activity", "פעילות אחרונה"],
    last24: ["last 24 hours", "24 השעות האחרונות"],
    dl_note: ["These are GitHub's raw download counts. The Windows installer count includes in-app updates (every update downloads it again), so it is not a count of people; the release workflow also downloads it once per release. <b>Update checks</b> are Windows apps fetching <code>SHA256SUMS.txt</code> before updating themselves. Game-data checks and downloads (<code>kb-manifest.json</code>, <code>kb.zip</code>) are not shown: the nightly game-data update uploads those files again, which resets their counts, and the build workflows download them too.",
      "אלה מספרי ההורדות הגולמיים של GitHub. מספר ההורדות של תוכנת ההתקנה ל-Windows כולל גם עדכונים מתוך האפליקציה (כל עדכון מוריד אותה שוב), ולכן הוא לא מספר אנשים; גם תהליך השחרור מוריד אותה פעם אחת בכל גרסה. <b>בדיקות עדכון</b> הן אפליקציות Windows שמורידות את <code>SHA256SUMS.txt</code> לפני שהן מעדכנות את עצמן. בדיקות והורדות של נתוני המשחק (<code>kb-manifest.json</code>, <code>kb.zip</code>) לא מוצגות: העדכון הלילי מעלה את הקבצים האלה מחדש, וזה מאפס את המונים שלהם, וגם תהליכי הבנייה מורידים אותם."],
    how_counted: ["How these are counted", "איך זה נספר"],
    players_note: ["<b>Players</b> are counted by the app's \"running\" ping (version 0.14.0 and up; every 10 minutes). Each install stores three flags in its own settings file and sends each one once per period: the first ping it ever sent, the first of each UTC day, the first of each UTC month. Counting those flags counts every install once, whatever its version and however often it restarts. Rarely a flag arrives twice (PostHog took a ping while the app saw a timeout, or the settings file could not be saved): from 0.18.1 that still counts once, on older versions it counts twice. Not counted: installs still on 0.13.0 or older, installs that had switched the ping off in 0.14.0–0.18.0 (until they update), apps that are offline the whole day, players who never finished the first-run setup, and the developers' own source runs. One person with two computers counts twice: these are installs, not people. A computer whose clock is set to a wrong date files its days by that date. <b>Country, character and settings</b> are counted once per install (its latest value) among installs on 0.18.1 and up, which ping under a lasting random id. <b>Questions, new installs and updates</b> come from the usage stats: every install from 0.18.1; before that only installs created on 0.15.0 or later that kept them on. A few events are lost when an app is closed right after they happen.",
      "<b>שחקנים</b> נספרים לפי פינג \"האפליקציה רצה\" (מגרסה 0.14.0, כל 10 דקות). כל התקנה שומרת שלושה דגלים בקובץ ההגדרות שלה ושולחת כל אחד פעם אחת בכל תקופה: הפינג הראשון אי פעם, הראשון בכל יום (UTC), הראשון בכל חודש (UTC). ספירת הדגלים סופרת כל התקנה פעם אחת, בכל גרסה ולא משנה כמה פעמים היא הופעלה מחדש. לעיתים רחוקות דגל מגיע פעמיים (PostHog קיבל פינג בזמן שהאפליקציה חשבה שהשליחה נכשלה, או שקובץ ההגדרות לא נשמר): מגרסה 0.18.1 זה עדיין נספר פעם אחת, בגרסאות ישנות יותר זה נספר פעמיים. לא נספרים: התקנות שעדיין בגרסה 0.13.0 ומטה, התקנות שכיבו את הפינג בגרסאות 0.14.0–0.18.0 (עד שיתעדכנו), אפליקציות שלא מחוברות לאינטרנט כל היום, שחקנים שלא סיימו את ההגדרה הראשונית, והרצות פיתוח של המפתחים. אדם אחד עם שני מחשבים נספר פעמיים: אלה התקנות, לא אנשים. מחשב שהשעון שלו מכוון לתאריך שגוי נרשם לפי התאריך הזה. <b>מדינה, דמות והגדרות</b> נספרים פעם אחת לכל התקנה (הערך האחרון שלה) מבין ההתקנות בגרסה 0.18.1 ומעלה, שמזהות את עצמן במזהה אקראי קבוע. <b>שאלות, התקנות חדשות ועדכונים</b> מגיעים מנתוני השימוש: מכל ההתקנות מגרסה 0.18.1; לפני כן רק מהתקנות שנוצרו בגרסה 0.15.0 ומעלה ולא כיבו אותם. מעט אירועים הולכים לאיבוד כשהאפליקציה נסגרת מיד אחריהם."],
    site_note: ["A <b>visit</b> is one browser tab (a random id kept for the tab, no cookies), so one person with two tabs counts twice. Visitors with Do Not Track are not counted.",
      "<b>ביקור</b> הוא לשונית דפדפן אחת (מזהה אקראי שנשמר ללשונית, בלי עוגיות), כך שאדם אחד עם שתי לשוניות נספר פעמיים. מבקרים עם Do Not Track לא נספרים."],
    // tiles
    visitors_online: ["Visitors online", "מבקרים באתר עכשיו"],
    visitors_online_sub: ["site tabs, last 5 minutes", "לשוניות באתר, 5 הדקות האחרונות"],
    players_online: ["Players online", "שחקנים מחוברים"],
    players_online_sub: ["apps that pinged in the last 11 minutes (before 0.18.1 a restart can count twice)", "אפליקציות ששלחו פינג ב-11 הדקות האחרונות (לפני 0.18.1 הפעלה מחדש עלולה להיספר פעמיים)"],
    players_today: ["Players today", "שחקנים היום"],
    players_today_sub: ["installs that ran today (UTC)", "התקנות שרצו היום (UTC)"],
    players_month: ["Players this month", "שחקנים החודש"],
    players_month_sub: ["installs that ran since the 1st (UTC)", "התקנות שרצו מתחילת החודש (UTC)"],
    players_ever: ["Players ever", "שחקנים מאז ומעולם"],
    players_ever_sub: ["installs that ever ran 0.14.0+", "התקנות שאי פעם הריצו 0.14.0 ומעלה"],
    latest_release: ["Latest release", "הגרסה האחרונה"],
    latest_sub: ["{ago} · {n} downloads (incl. updates)", "{ago} · {n} הורדות (כולל עדכונים)"],
    win_installer: ["Windows installer", "תוכנת התקנה ל-Windows"],
    portable: ["Portable", "גרסה ניידת"],
    win_zip: ["Windows zip", "zip ל-Windows"],
    update_checks: ["Update checks", "בדיקות עדכון"],
    kb_checks: ["Game-data checks", "בדיקות נתוני משחק"],
    kb_downloads: ["Game-data downloads", "הורדות נתוני משחק"],
    new_month: ["New this month", "חדשים החודש"],
    new_month_sub: ["installs whose first ping ever was this month", "התקנות שהפינג הראשון שלהן היה החודש"],
    fresh_installs: ["New installs", "התקנות חדשות"],
    fresh_installs_sub: ["first start after installing, this month", "הפעלה ראשונה אחרי התקנה, החודש"],
    app_updates: ["App updates", "עדכוני אפליקציה"],
    app_updates_sub: ["first start on a new version, this month", "הפעלה ראשונה בגרסה חדשה, החודש"],
    came_back: ["Came back", "חזרו"],
    came_back_sub: ["{a} of {b} installs (0.18.1+, first seen 2+ days ago) ran on 2+ days", "{a} מתוך {b} התקנות (0.18.1+, נראו לראשונה לפני יומיים ויותר) רצו ב-2 ימים או יותר"],
    still_active: ["Still active after a week", "עדיין פעילים אחרי שבוע"],
    still_active_sub: ["{a} of {b} installs (0.18.1+, first seen 8+ days ago) ran in the last 7 UTC days", "{a} מתוך {b} התקנות (0.18.1+, נראו לראשונה לפני 8 ימים ויותר) רצו ב-7 ימי ה-UTC האחרונים"],
    questions_today: ["Questions today", "שאלות היום"],
    questions_today_sub: ["UTC day", "יום UTC"],
    questions: ["Questions", "שאלות"],
    questions_sub: ["30 days · {p} with a screenshot · {n} players asked", "30 יום · {p} עם צילום מסך · {n} שחקנים שאלו"],
    voice: ["Voice questions", "שאלות בקול"],
    days30: ["last 30 days", "30 הימים האחרונים"],
    avg_session: ["Avg. session", "משך שימוש ממוצע"],
    avg_session_sub: ["open to close, {n} sessions (0.18.1+)", "מפתיחה לסגירה, {n} הפעלות (0.18.1+)"],
    minutes: ["{n} min", "{n} דק'"],
    crashes: ["Crashes", "קריסות"],
    crashes_sub: ["{n} installs, last 30 days", "{n} התקנות, 30 הימים האחרונים"],
    kb_updates: ["Game-data updates", "עדכוני נתוני משחק"],
    kb_updates_sub: ["{n} failed, last 30 days", "{n} נכשלו, 30 הימים האחרונים"],
    // charts
    players_per_day: ["Players per day", "שחקנים ביום"],
    players_per_day_sub: ["installs that ran that UTC day", "התקנות שרצו באותו יום (UTC)"],
    players_s: ["Players", "שחקנים"],
    first_pings: ["First ever ping", "פינג ראשון אי פעם"],
    installs_updates_day: ["New installs and updates per day", "התקנות חדשות ועדכונים ביום"],
    new_installs_s: ["New installs", "התקנות חדשות"],
    updates_s: ["Updates", "עדכונים"],
    runs_per_hour: ["Apps running per hour", "אפליקציות פועלות לפי שעה"],
    runs_per_hour_sub: ["last 48 hours (UTC) · before 0.18.1 each restart counts as another app", "48 השעות האחרונות (UTC) · לפני 0.18.1 כל הפעלה מחדש נספרת כאפליקציה נוספת"],
    apps_running: ["Apps running", "אפליקציות פועלות"],
    questions_per_day: ["Questions per day", "שאלות ביום"],
    show_table: ["Show table", "הצגת טבלה"],
    show_chart: ["Show chart", "הצגת גרף"],
    total: ["Total", "סה\"כ"],
    no_data: ["No data yet.", "אין נתונים עדיין."],
    // ranked
    countries: ["Countries", "מדינות"],
    per_install_new: ["installs on 0.18.1+, 30 days", "התקנות 0.18.1+, 30 יום"],
    versions_now: ["Versions running now", "גרסאות שרצות עכשיו"],
    versions_now_sub: ["apps, last 11 minutes", "אפליקציות, 11 הדקות האחרונות"],
    versions_today: ["Versions today", "גרסאות היום"],
    versions_today_sub: ["version at each install's first run today", "הגרסה בהפעלה הראשונה של כל התקנה היום"],
    os: ["Operating system", "מערכת הפעלה"],
    os_sub: ["installs this month", "התקנות החודש"],
    char_level: ["Character level", "רמת הדמות"],
    char_class: ["Class", "מחלקה"],
    char_job: ["Job", "ג'וב"],
    provider: ["AI provider setting", "ספק ה-AI בהגדרות"],
    language: ["App language", "שפת האפליקציה"],
    answered_by: ["Who answered", "מי ענה"],
    answered_by_sub: ["questions, 30 days · instant = local, no AI", "שאלות, 30 יום · instant = מקומי, בלי AI"],
    windows_opened: ["Windows opened", "חלונות שנפתחו"],
    times30: ["times, 30 days", "פעמים, 30 יום"],
    crashes_list: ["Crashes", "קריסות"],
    crash_sub: ["error @ file:line, 30 days", "שגיאה @ קובץ:שורה, 30 יום"],
    kb_fails: ["Game-data update failures", "כישלונות בעדכון נתוני המשחק"],
    reason30: ["reason, 30 days", "סיבה, 30 יום"],
    none_value: ["(none)", "(אין)"],
    unknown_value: ["(unknown)", "(לא ידוע)"],
    // site
    visits_today: ["Visits today", "ביקורים היום"],
    page_views_today: ["Page views today", "צפיות בדפים היום"],
    visits30: ["Visits", "ביקורים"],
    page_views30: ["Page views", "צפיות בדפים"],
    dl_clicks_today: ["Download clicks today", "לחיצות הורדה היום"],
    dl_clicks: ["Download clicks", "לחיצות הורדה"],
    of_visits: ["{p} of visits clicked one, 30 days", "{p} מהביקורים כללו לחיצה, 30 יום"],
    utc_day: ["UTC day", "יום UTC"],
    visits_per_hour: ["Visits per hour", "ביקורים לפי שעה"],
    hours48: ["last 48 hours (UTC)", "48 השעות האחרונות (UTC)"],
    site_visits_s: ["Site visits", "ביקורים באתר"],
    visits_dl_day: ["Visits and download clicks per day", "ביקורים ולחיצות הורדה ביום"],
    visits_s: ["Visits", "ביקורים"],
    dl_clicks_s: ["Download clicks", "לחיצות הורדה"],
    site_countries: ["Countries", "מדינות"],
    site_countries_sub: ["page views, 30 days", "צפיות, 30 יום"],
    referrers: ["Referrers", "מקורות הגעה"],
    pages: ["Pages", "דפים"],
    page_views_sub: ["page views, 30 days", "צפיות, 30 יום"],
    visitor_devices: ["Visitor devices", "מכשירי המבקרים"],
    dl_by_platform: ["Download clicks by platform", "לחיצות הורדה לפי פלטפורמה"],
    clicks30: ["clicks, 30 days", "לחיצות, 30 יום"],
    // github
    stars: ["Stars", "כוכבים"], forks: ["Forks", "Forks"], watchers: ["Watchers", "עוקבים"],
    open_issues: ["Open issues and PRs", "Issues ו-PRs פתוחים"], last_push: ["Last push", "Push אחרון"],
    api_left: ["GitHub API calls left", "קריאות GitHub API שנותרו"],
    api_left_sub: ["of {n} this hour", "מתוך {n} בשעה הזו"], no_token: [" (no token)", " (בלי token)"],
    repo_views: ["Repository page views", "צפיות בדפי המאגר"], repo_clones: ["Repository clones", "שכפולי המאגר"],
    repo_referrers: ["Repository referrers", "מקורות הגעה למאגר"], repo_pages: ["Popular repository pages", "דפים פופולריים במאגר"],
    views14: ["views, 14 days", "צפיות, 14 יום"],
    // monitoring and feed
    check: ["Check", "בדיקה"], status: ["Status", "מצב"], response: ["Response", "זמן תגובה"],
    workflow: ["Workflow", "Workflow"], result: ["Result", "תוצאה"], branch: ["Branch", "ענף"], when: ["When", "מתי"],
    event: ["Event", "אירוע"], who: ["Install / visitor", "התקנה / מבקר"], details: ["Details", "פרטים"],
    nothing24: ["Nothing in the last 24 hours.", "לא היה כלום ב-24 השעות האחרונות."],
    needs_posthog: ["Needs PostHog (see above).", "דרוש PostHog (ראו למעלה)."],
    unavailable: ["Unavailable.", "לא זמין."], no_runs: ["No workflow runs visible.", "לא נראות הרצות."],
    gh_unavailable: ["GitHub data unavailable.", "נתוני GitHub לא זמינים."],
    this_dashboard: ["This dashboard", "הדשבורד הזה"], region: ["region", "אזור"],
    deployment: ["Deployment", "פריסה"], state: ["State", "מצב"], target: ["Target", "יעד"], build: ["Build", "בנייה"],
    answered: ["answered by {x}", "ענה {x}"], lv: ["level {n}", "רמה {n}"],
    updated: ["Updated {t}", "עודכן ב-{t}"], refresh_failed: ["Refresh failed ({s})", "הרענון נכשל ({s})"],
    offline: ["Offline? Refresh failed.", "אין חיבור? הרענון נכשל."],
    some_failed: ["some queries failed:", "חלק מהשאילתות נכשלו:"],
    wrong_password: ["Wrong password.", "סיסמה שגויה."],
    too_many: ["Too many attempts. Try again in 15 minutes.", "יותר מדי ניסיונות. נסו שוב בעוד 15 דקות."],
    signin_failed: ["Sign-in failed ({s}).", "הכניסה נכשלה ({s})."], network_error: ["Network error.", "שגיאת רשת."],
    just_now: ["just now", "עכשיו"], min_ago: ["{n} min ago", "לפני {n} דק'"], h_ago: ["{n} h ago", "לפני {n} שע'"], d_ago: ["{n} d ago", "לפני {n} ימים"], d_ago1: ["1 d ago", "לפני יום"],
    lang_switch: ["עברית", "English"],
  };
  var EVENTS = {
    app_started: ["App started", "האפליקציה הופעלה"], app_updated: ["App updated", "האפליקציה עודכנה"],
    question_asked: ["Question asked", "נשאלה שאלה"], voice_used: ["Voice question", "שאלה בקול"],
    app_closed: ["App closed", "האפליקציה נסגרה"], window_opened: ["Window opened", "נפתח חלון"],
    app_crashed: ["Crash", "קריסה"], kb_updated: ["Game data updated", "נתוני המשחק עודכנו"],
    kb_update_failed: ["Game-data update failed", "עדכון נתוני המשחק נכשל"],
    site_pageview: ["Site visit", "ביקור באתר"], site_download: ["Download click", "לחיצת הורדה"],
  };
  var lang = "en";
  try { lang = localStorage.getItem("mh-admin-lang") === "he" ? "he" : "en"; } catch (e) { /* private mode */ }
  function t(key, vars) {
    var s = (S[key] || [key, key])[lang === "he" ? 1 : 0];
    if (vars) for (var k in vars) s = s.split("{" + k + "}").join(vars[k]);
    return s;
  }
  function applyLang() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
    document.title = t("title");
    document.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    document.querySelectorAll("[data-i18n-html]").forEach(function (el) { el.innerHTML = t(el.getAttribute("data-i18n-html")); });
    document.querySelectorAll(".lang-btn").forEach(function (b) { b.textContent = t("lang_switch"); });
  }
  function switchLang() {
    lang = lang === "he" ? "en" : "he";
    try { localStorage.setItem("mh-admin-lang", lang); } catch (e) { /* private mode */ }
    applyLang();
    if (data) render(data);
  }

  /* ---------------------------------------------------------------- helpers */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(n) { return n == null ? "–" : n >= 100000 ? compact.format(n) : nf.format(n); }
  function ago(time) {
    if (!time) return "–";
    var s = (Date.now() - new Date(time).getTime()) / 1000;
    if (s < 60) return t("just_now");
    if (s < 3600) return t("min_ago", { n: Math.round(s / 60) });
    if (s < 86400) return t("h_ago", { n: Math.round(s / 3600) });
    var days = Math.round(s / 86400);
    return days === 1 ? t("d_ago1") : t("d_ago", { n: days });
  }
  function loc() { return lang === "he" ? "he" : "en"; }
  /* a UTC day ("2026-10-12"): shown as that day, not shifted by the browser's time zone */
  function dateShort(d) {
    return new Date(String(d).slice(0, 10) + "T12:00:00Z").toLocaleDateString(loc(), { month: "short", day: "numeric", timeZone: "UTC" });
  }
  function hourShort(d) {
    return new Date(d).toLocaleString(loc(), { weekday: "short", hour: "numeric" });
  }
  function pct(a, b) { return b && a != null ? Math.round((a / b) * 100) + "%" : "–"; }
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function api(path, opts) {
    opts = opts || {};
    opts.credentials = "same-origin";
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (body) { return { status: r.status, body: body }; });
    });
  }

  function tile(label, value, sub, cls) {
    var na = value == null || value === "–";
    return '<div class="tile ' + (cls || "") + '"><div class="label">' + esc(label) + '</div>' +
      '<div class="value' + (na ? " na" : "") + '">' + (na ? "–" : esc(value)) + "</div>" +
      (sub ? '<div class="sub">' + esc(sub) + "</div>" : "") + "</div>";
  }

  function empty(html) { return '<p class="empty">' + html + "</p>"; }
  function note(key) {
    return '<details class="card how"><summary>' + esc(t("how_counted")) + '</summary><p class="note">' + t(key) + "</p></details>";
  }

  /* ---------------------------------------------------------------- tooltip */

  var tip = $("tip");
  function showTip(ev, title, rows) {
    tip.innerHTML = '<div class="t">' + esc(title) + "</div>" + rows.map(function (r) {
      return '<div class="r"><span>' + (r.color ? '<i style="background:' + r.color + '"></i>' : "") + esc(r.name) +
        "</span><b>" + esc(fmt(r.value)) + "</b></div>";
    }).join("");
    tip.hidden = false;
    var x = ev.clientX + 14, y = ev.clientY + 14;
    var w = tip.offsetWidth, h = tip.offsetHeight;
    if (x + w > innerWidth - 8) x = ev.clientX - w - 14;
    if (y + h > innerHeight - 8) y = ev.clientY - h - 14;
    tip.style.left = Math.max(8, x) + "px";
    tip.style.top = Math.max(8, y) + "px";
  }
  function hideTip() { tip.hidden = true; }

  /* ---------------------------------------------------------------- charts
     series: [{ name, color: "--s1", values: [...] }], labels: [...] (x categories) */

  var NS = "http://www.w3.org/2000/svg";
  function niceMax(v) {
    if (v <= 4) return 4;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var steps = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] * p >= v) return steps[i] * p;
    return 10 * p;
  }
  function svgEl(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function frame(el, labels, maxVal, fmtLabel) {
    var W = Math.max(280, el.clientWidth), H = 210;
    var m = { t: 10, r: 8, b: 26, l: 40 };
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, role: "img" });
    var max = niceMax(maxVal || 1);
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var g = svgEl("g", { class: "grid" }, svg);
    for (var i = 0; i <= 4; i++) {
      var y = m.t + ih - (ih * i) / 4;
      if (i > 0) svgEl("line", { x1: m.l, x2: W - m.r, y1: y, y2: y }, g);
      var tx = svgEl("text", { x: m.l - 6, y: y + 4, "text-anchor": "end" }, svg);
      tx.textContent = compact.format((max * i) / 4);
    }
    svgEl("line", { class: "baseline", x1: m.l, x2: W - m.r, y1: m.t + ih, y2: m.t + ih }, svg);
    /* x labels: as many as fit without colliding */
    var every = Math.max(1, Math.ceil(labels.length / Math.floor(iw / 64)));
    var band = iw / labels.length;
    labels.forEach(function (lab, j) {
      if (j % every) return;
      var tx2 = svgEl("text", { x: m.l + band * j + band / 2, y: H - 8, "text-anchor": "middle" }, svg);
      tx2.textContent = fmtLabel ? fmtLabel(lab) : lab;
    });
    return { svg: svg, W: W, H: H, m: m, iw: iw, ih: ih, max: max, band: band };
  }

  function legend(series) {
    if (series.length < 2) return "";
    return '<div class="legend">' + series.map(function (s) {
      return '<span style="--c:var(' + s.color + ')">' + esc(s.name) + "</span>";
    }).join("") + "</div>";
  }

  function lineChart(el, labels, series, fmtLabel) {
    var max = 0;
    series.forEach(function (s) { s.values.forEach(function (v) { max = Math.max(max, v); }); });
    var f = frame(el, labels, max, fmtLabel);
    var x = function (j) { return f.m.l + f.band * j + f.band / 2; };
    var y = function (v) { return f.m.t + f.ih - (f.ih * v) / f.max; };
    series.forEach(function (s) {
      var d = s.values.map(function (v, j) { return (j ? "L" : "M") + x(j).toFixed(1) + " " + y(v).toFixed(1); }).join("");
      svgEl("path", { d: d, class: "line", stroke: "var(" + s.color + ")" }, f.svg);
      var last = s.values.length - 1;
      if (last >= 0) svgEl("circle", { cx: x(last), cy: y(s.values[last]), r: 4, class: "dot", fill: "var(" + s.color + ")" }, f.svg);
    });
    var cross = svgEl("line", { class: "cross", y1: f.m.t, y2: f.m.t + f.ih, visibility: "hidden" }, f.svg);
    var dots = series.map(function (s) { return svgEl("circle", { r: 4, class: "dot", fill: "var(" + s.color + ")", visibility: "hidden" }, f.svg); });
    var hit = svgEl("rect", { class: "hit", x: f.m.l, y: f.m.t, width: f.iw, height: f.ih }, f.svg);
    function move(ev) {
      var r = f.svg.getBoundingClientRect();
      var px = ((ev.clientX - r.left) / r.width) * f.W;
      var j = Math.min(labels.length - 1, Math.max(0, Math.floor((px - f.m.l) / f.band)));
      cross.setAttribute("x1", x(j)); cross.setAttribute("x2", x(j)); cross.setAttribute("visibility", "visible");
      dots.forEach(function (d, i) {
        d.setAttribute("cx", x(j)); d.setAttribute("cy", y(series[i].values[j])); d.setAttribute("visibility", "visible");
      });
      showTip(ev, fmtLabel ? fmtLabel(labels[j]) : labels[j], series.map(function (s) {
        return { name: s.name, value: s.values[j], color: css(s.color) };
      }));
    }
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerleave", function () {
      hideTip(); cross.setAttribute("visibility", "hidden");
      dots.forEach(function (d) { d.setAttribute("visibility", "hidden"); });
    });
    el.innerHTML = legend(series);
    el.appendChild(f.svg);
  }

  function columnChart(el, labels, series, fmtLabel) {
    var totals = labels.map(function (_, j) { return series.reduce(function (a, s) { return a + s.values[j]; }, 0); });
    var f = frame(el, labels, Math.max.apply(null, totals.concat([0])), fmtLabel);
    var bw = Math.min(24, f.band * 0.7);
    labels.forEach(function (lab, j) {
      var x = f.m.l + f.band * j + (f.band - bw) / 2;
      var base = f.m.t + f.ih;
      var segs = series.filter(function (s) { return s.values[j] > 0; });
      var g = svgEl("g", { class: "bar" }, f.svg);
      segs.forEach(function (s, k) {
        var h = (f.ih * s.values[j]) / f.max;
        var top = k === segs.length - 1;
        var gap = k > 0 ? 2 : 0;   // 2px surface gap between stacked segments
        var y = base - h;
        var hh = Math.max(0, h - gap);
        if (top && hh > 4) {
          var r = 4;
          svgEl("path", {
            d: "M" + x + " " + (y + hh) + "V" + (y + r) + "Q" + x + " " + y + " " + (x + r) + " " + y +
               "H" + (x + bw - r) + "Q" + (x + bw) + " " + y + " " + (x + bw) + " " + (y + r) + "V" + (y + hh) + "Z",
            fill: "var(" + s.color + ")",
          }, g);
        } else {
          svgEl("rect", { x: x, y: y, width: bw, height: hh, fill: "var(" + s.color + ")" }, g);
        }
        base = y;
      });
      /* hit target: the whole column band, taller than the mark */
      var hit = svgEl("rect", { class: "hit", x: f.m.l + f.band * j, y: f.m.t, width: f.band, height: f.ih }, f.svg);
      hit.addEventListener("pointermove", function (ev) {
        g.classList.add("on");
        var rows = series.map(function (s) { return { name: s.name, value: s.values[j], color: css(s.color) }; });
        if (series.length > 1) rows.push({ name: t("total"), value: totals[j] });
        showTip(ev, fmtLabel ? fmtLabel(lab) : lab, rows);
      });
      hit.addEventListener("pointerleave", function () { g.classList.remove("on"); hideTip(); });
    });
    el.innerHTML = legend(series);
    el.appendChild(f.svg);
  }

  /* A chart card with a "Show table" toggle, so no number is only readable from the drawing. */
  var charts = [];
  function chartCard(container, title, sub, kind, labels, series, fmtLabel) {
    var card = document.createElement("div");
    card.className = "card";
    card.innerHTML = '<div class="card-head"><h3>' + esc(title) + "</h3>" +
      '<span class="muted small">' + esc(sub || "") + ' <button class="link" type="button">' + esc(t("show_table")) + '</button></span></div>' +
      '<div class="chart"></div>';
    container.appendChild(card);
    var el = card.querySelector(".chart");
    var btn = card.querySelector("button");
    var spec = { el: el, kind: kind, labels: labels, series: series, fmtLabel: fmtLabel, table: false };
    btn.addEventListener("click", function () {
      spec.table = !spec.table;
      btn.textContent = t(spec.table ? "show_chart" : "show_table");
      draw(spec);
    });
    charts.push(spec);
    draw(spec);
  }
  function draw(spec) {
    if (spec.table) {
      spec.el.innerHTML = '<div class="tbl-wrap"><table><thead><tr><th></th>' +
        spec.series.map(function (s) { return '<th class="num">' + esc(s.name) + "</th>"; }).join("") +
        "</tr></thead><tbody>" + spec.labels.map(function (l, j) {
          return "<tr><td>" + esc(spec.fmtLabel ? spec.fmtLabel(l) : l) + "</td>" +
            spec.series.map(function (s) { return '<td class="num">' + fmt(s.values[j]) + "</td>"; }).join("") + "</tr>";
        }).join("") + "</tbody></table></div>";
      return;
    }
    if (!spec.labels.length) { spec.el.innerHTML = empty(t("no_data")); return; }
    (spec.kind === "line" ? lineChart : columnChart)(spec.el, spec.labels, spec.series, spec.fmtLabel);
  }
  var resizeT = null;
  addEventListener("resize", function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { charts.forEach(function (c) { if (!c.table) draw(c); }); }, 150);
  });

  /* empty value = the install has none (no character yet...); kept as its own row, so the rows add up */
  function ranked(title, items, sub, emptyKey) {
    var html = '<div class="card"><div class="card-head"><h3>' + esc(title) + "</h3>" +
      (sub ? '<span class="muted small">' + esc(sub) + "</span>" : "") + "</div>";
    if (!items || !items.length) return html + empty(t("no_data")) + "</div>";
    var max = Math.max.apply(null, items.map(function (it) { return it.count; })) || 1;
    return html + '<ul class="bars">' + items.map(function (it) {
      var name = it.value === "" || it.value === "null" ? t(emptyKey || "unknown_value") : it.value;
      return '<li><span class="name" dir="auto" title="' + esc(name) + '">' + esc(name) + '</span><span class="n">' + fmt(it.count) +
        '</span><span class="track"><span class="fill" style="display:block;width:' + ((it.count / max) * 100).toFixed(1) + '%"></span></span></li>';
    }).join("") + "</ul></div>";
  }

  /* fill gaps so a day with no events shows as 0, not as a skipped point (UTC days) */
  function lastDays(rows, n, key) {
    var map = {};
    rows.forEach(function (r) { map[r[key]] = r; });
    var out = [];
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      out.push(map[d] || { day: d });
    }
    return out;
  }
  /* the last 48 whole UTC hours, an hour with no events as 0 (rows' hour: "2026-10-12T14:00:00Z") */
  function last48(rows) {
    var map = {};
    rows.forEach(function (r) { map[String(r.hour).slice(0, 13)] = r; });
    var h0 = new Date(); h0.setUTCMinutes(0, 0, 0);
    var out = [];
    for (var i = 47; i >= 0; i--) {
      var iso = new Date(h0.getTime() - i * 3600000).toISOString();
      out.push(map[iso.slice(0, 13)] || { hour: iso });
    }
    return out;
  }
  var val = function (rows, k) { return rows.map(function (r) { return r[k] || 0; }); };

  /* ---------------------------------------------------------------- sections */

  function setupHint(what) {
    var he = lang === "he";
    return {
      github: he ? "כדי לראות צפיות, שכפולים ומקורות הגעה למאגר, ולהסיר את מגבלת 60 הקריאות בשעה, יש להגדיר <code>GITHUB_TOKEN</code> (token מסוג fine-grained עם הרשאת קריאה ל-Administration או ל-Traffic של המאגר)."
        : "Set <code>GITHUB_TOKEN</code> (a fine-grained token with read access to the repository's Administration or Traffic) to see repository views, clones and referrers, and to lift the 60 calls/hour limit.",
      posthog: he ? "כדי לקרוא את נתוני האפליקציה והאתר יש להגדיר ב-Vercel את <code>POSTHOG_PERSONAL_API_KEY</code> (הרשאה: query:read) ואת <code>POSTHOG_PROJECT_ID</code>."
        : "Set <code>POSTHOG_PERSONAL_API_KEY</code> (scope: query:read) and <code>POSTHOG_PROJECT_ID</code> in Vercel to read app and site stats. US cloud is the default; for EU set <code>POSTHOG_HOST</code> and <code>POSTHOG_INGEST_HOST</code>.",
      site: he ? "כדי להתחיל לספור ביקורים באתר יש להגדיר ב-Vercel את <code>POSTHOG_PROJECT_KEY</code> (מפתח ה-phc_ של הפרויקט). עד אז לא נרשם כלום."
        : "Set <code>POSTHOG_PROJECT_KEY</code> (the project's phc_ key) in Vercel to start counting site visits. Nothing is recorded until then.",
      vercel: he ? "כדי לראות את רשימת הפריסות יש להגדיר את <code>VERCEL_API_TOKEN</code> ואת <code>VERCEL_PROJECT</code> (ו-<code>VERCEL_TEAM_ID</code> לפרויקט של צוות)."
        : "Set <code>VERCEL_API_TOKEN</code> and <code>VERCEL_PROJECT</code> (project id or name; add <code>VERCEL_TEAM_ID</code> for a team project) to list deployments.",
    }[what];
  }

  function renderNotices(d) {
    var out = [];
    ["github", "uptime", "posthog", "vercel"].forEach(function (k) {
      var s = d[k];
      if (s && s.error) out.push('<div class="notice err"><b>' + esc(k) + ":</b> " + esc(s.error) + "</div>");
    });
    if (d.posthog && d.posthog.errors && d.posthog.errors.length) {
      out.push('<div class="notice err"><b>PostHog:</b> ' + esc(t("some_failed")) + " " + esc(d.posthog.errors.join("; ")) + "</div>");
    }
    $("notices").innerHTML = out.join("");
  }

  function renderNow(d) {
    var ph = d.posthog || {}, p = ph.players || {}, st = ph.site || {}, gh = d.github || {};
    var latest = (gh.releases || []).find(function (r) { return !r.prerelease; });
    var latestDl = latest ? latest.counts.windows + latest.counts.mac + latest.counts.portable : null;
    var on = ph.configured && ph.players;
    $("now-tiles").innerHTML = [
      tile(t("players_online"), on ? fmt(p.online) : null, t("players_online_sub"), "live"),
      tile(t("players_today"), on ? fmt(p.today) : null, t("players_today_sub")),
      tile(t("players_month"), on ? fmt(p.month) : null, t("players_month_sub")),
      tile(t("players_ever"), on ? fmt(p.ever) : null, t("players_ever_sub")),
      tile(t("visitors_online"), ph.configured && ph.siteKeySet && ph.site ? fmt(st.online) : null, t("visitors_online_sub"), "live"),
      tile(t("latest_release"), latest ? latest.tag : null, latest ? t("latest_sub", { ago: ago(latest.published), n: fmt(latestDl) }) : ""),
    ].join("");
  }

  function renderDownloads(d) {
    var gh = d.github || {};
    var host = $("dl-chart-host");
    host.innerHTML = "";
    if (!gh.totals) { $("dl-tiles").innerHTML = ""; host.innerHTML = '<div class="card">' + empty(t("gh_unavailable")) + "</div>"; return; }
    var tt = gh.totals;
    $("dl-tiles").innerHTML = [
      tile(t("win_installer"), fmt(tt.windows), "MapleHelper-Setup.exe"),
      tile("macOS", fmt(tt.mac), "MapleHelper-macOS.dmg"),
      tile(t("portable"), fmt(tt.portable), t("win_zip")),
      tile(t("update_checks"), fmt(tt.updateChecks), "SHA256SUMS.txt"),
    ].join("");
    var rel = gh.releases.slice(0, 24).reverse();
    chartCard(host, lang === "he" ? "הורדות לפי גרסה" : "Downloads per release", lang === "he" ? rel.length + " הגרסאות האחרונות" : rel.length + " most recent releases", "column",
      rel.map(function (r) { return r.tag; }),
      [
        { name: "Windows", color: "--s1", values: rel.map(function (r) { return r.counts.windows; }) },
        { name: "macOS", color: "--s2", values: rel.map(function (r) { return r.counts.mac; }) },
        { name: t("portable"), color: "--s3", values: rel.map(function (r) { return r.counts.portable; }) },
      ]);
    chartCard(host, lang === "he" ? "בדיקות עדכון, לפי גרסה" : "Update checks, per release", "SHA256SUMS.txt", "column",
      rel.map(function (r) { return r.tag; }),
      [{ name: t("update_checks"), color: "--s1", values: rel.map(function (r) { return r.counts.updateChecks; }) }]);
  }

  function renderApp(d) {
    var box = $("app-body"), ph = d.posthog || {};
    box.innerHTML = "";
    if (!ph.configured) { box.innerHTML = '<div class="card">' + empty(setupHint("posthog")) + "</div>"; return; }
    var p = ph.players || {}, u = ph.usage || {}, ret = ph.retention || {};
    box.insertAdjacentHTML("beforeend", note("players_note") + '<div class="tiles">' + [
      tile(t("players_today"), fmt(p.today), t("players_today_sub")),
      tile(t("players_month"), fmt(p.month), t("players_month_sub")),
      tile(t("players_ever"), fmt(p.ever), t("players_ever_sub")),
      tile(t("fresh_installs"), fmt(u.freshInstallsMonth), t("fresh_installs_sub")),
      tile(t("app_updates"), fmt(u.updatesMonth), t("app_updates_sub")),
      tile(t("came_back"), pct(ret.cameBack, ret.eligible), t("came_back_sub", { a: fmt(ret.cameBack), b: fmt(ret.eligible) })),
      tile(t("still_active"), pct(ret.active7, ret.eligible7), t("still_active_sub", { a: fmt(ret.active7), b: fmt(ret.eligible7) })),
      tile(t("questions_today"), fmt(u.questionsToday), t("questions_today_sub")),
      tile(t("questions"), fmt(u.questions30d), t("questions_sub", { p: pct(u.questionsWithScreenshot30d, u.questions30d), n: fmt(u.askers30d) })),
      tile(t("voice"), fmt(u.voice30d), t("days30")),
      tile(t("avg_session"), u.avgSessionMin != null ? t("minutes", { n: u.avgSessionMin }) : "–", t("avg_session_sub", { n: fmt(u.sessions30d) })),
      tile(t("crashes"), fmt(u.crashes30d), t("crashes_sub", { n: fmt(u.crashedInstalls30d) })),
      tile(t("kb_updates"), fmt(u.kbUpdates30d), t("kb_updates_sub", { n: fmt(u.kbFails30d) })),
    ].join("") + "</div>");
    var grid = document.createElement("div");
    grid.className = "grid2";
    box.appendChild(grid);
    var days = lastDays(ph.daily || [], 30, "day");
    var labels = days.map(function (r) { return r.day; });
    chartCard(grid, t("players_per_day"), t("players_per_day_sub"), "line", labels,
      [{ name: t("players_s"), color: "--s1", values: val(days, "players") }], dateShort);
    chartCard(grid, t("installs_updates_day"), "", "column", labels,
      [{ name: t("new_installs_s"), color: "--s1", values: val(days, "installs") },
       { name: t("updates_s"), color: "--s2", values: val(days, "updates") }], dateShort);
    var hours = last48(ph.hourly || []);
    chartCard(grid, t("runs_per_hour"), t("runs_per_hour_sub"), "line", hours.map(function (r) { return r.hour; }),
      [{ name: t("apps_running"), color: "--s1", values: val(hours, "appRuns") }], hourShort);
    chartCard(grid, t("questions_per_day"), "", "column", labels,
      [{ name: t("questions"), color: "--s1", values: val(days, "questions") }], dateShort);
    var b = ph.breakdowns || {};
    box.insertAdjacentHTML("beforeend", '<div class="grid3">' +
      ranked(t("versions_now"), b.version_now, t("versions_now_sub")) +
      ranked(t("versions_today"), b.version_today, t("versions_today_sub")) +
      ranked(t("os"), b.os_month, t("os_sub")) +
      ranked(t("countries"), b.country, t("per_install_new")) +
      ranked(t("char_level"), b.char_level, t("per_install_new"), "none_value") +
      ranked(t("char_class"), b.char_class, t("per_install_new"), "none_value") +
      ranked(t("char_job"), b.char_job, t("per_install_new"), "none_value") +
      ranked(t("provider"), b.provider, t("per_install_new")) +
      ranked(t("language"), b.language, t("per_install_new")) +
      ranked(t("answered_by"), b.answered_by, t("answered_by_sub")) +
      ranked(t("windows_opened"), b.window, t("times30")) +
      ranked(t("crashes_list"), b.crash, t("crash_sub")) +
      ranked(t("kb_fails"), b.kb_fail, t("reason30")) +
      "</div>");
  }

  function renderSite(d) {
    var box = $("site-body"), ph = d.posthog || {};
    box.innerHTML = "";
    if (!ph.configured) { box.innerHTML = '<div class="card">' + empty(setupHint("posthog")) + empty(setupHint("site")) + "</div>"; return; }
    if (!ph.siteKeySet) box.insertAdjacentHTML("beforeend", '<div class="notice">' + setupHint("site") + "</div>");
    var s = ph.site || {};
    box.insertAdjacentHTML("beforeend", note("site_note") + '<div class="tiles">' + [
      tile(t("visits_today"), fmt(s.visitorsToday), t("utc_day")),
      tile(t("page_views_today"), fmt(s.pageviewsToday), t("utc_day")),
      tile(t("visits30"), fmt(s.visitors30d), t("days30")),
      tile(t("page_views30"), fmt(s.pageviews30d), t("days30")),
      tile(t("dl_clicks_today"), fmt(s.downloadsToday), t("utc_day")),
      tile(t("dl_clicks"), fmt(s.downloads30d), t("of_visits", { p: pct(s.downloaders30d, s.visitors30d) })),
    ].join("") + "</div>");
    var grid = document.createElement("div");
    grid.className = "grid2";
    box.appendChild(grid);
    var hours = last48(ph.hourly || []);
    chartCard(grid, t("visits_per_hour"), t("hours48"), "line", hours.map(function (r) { return r.hour; }),
      [{ name: t("site_visits_s"), color: "--s1", values: val(hours, "siteVisitors") }], hourShort);
    var days = lastDays(ph.daily || [], 30, "day");
    chartCard(grid, t("visits_dl_day"), "", "line", days.map(function (r) { return r.day; }),
      [{ name: t("visits_s"), color: "--s1", values: val(days, "visitors") },
       { name: t("dl_clicks_s"), color: "--s2", values: val(days, "downloads") }], dateShort);
    var b = ph.breakdowns || {};
    box.insertAdjacentHTML("beforeend", '<div class="grid3">' +
      ranked(t("site_countries"), b.site_country, t("site_countries_sub")) +
      ranked(t("referrers"), b.site_referrer, t("page_views_sub")) +
      ranked(t("pages"), b.site_page, t("page_views_sub")) +
      ranked(t("visitor_devices"), b.site_visitor_os, t("page_views_sub")) +
      ranked(t("dl_by_platform"), b.site_download_os, t("clicks30")) +
      "</div>");
  }

  function renderGithub(d) {
    var gh = d.github || {};
    var box = $("gh-traffic");
    box.innerHTML = "";
    if (!gh.configured || gh.error) { $("gh-tiles").innerHTML = ""; return; }
    var rl = gh.rateLimit;
    $("gh-tiles").innerHTML = [
      tile(t("stars"), fmt(gh.stars)),
      tile(t("forks"), fmt(gh.forks)),
      tile(t("watchers"), fmt(gh.watchers)),
      tile(t("open_issues"), fmt(gh.openIssues)),
      tile(t("last_push"), ago(gh.pushedAt), gh.repo),
      tile(t("api_left"), rl ? fmt(rl.remaining) : null, rl ? t("api_left_sub", { n: fmt(rl.limit) }) + (gh.tokenUsed ? "" : t("no_token")) : ""),
    ].join("");
    var tr = gh.traffic;
    if (!tr) { box.innerHTML = '<div class="card">' + empty(setupHint("github")) + "</div>"; return; }
    var grid = document.createElement("div");
    grid.className = "grid2";
    box.appendChild(grid);
    var v = (tr.views && tr.views.daily) || [];
    chartCard(grid, t("repo_views"), t("views14"), "line",
      v.map(function (x) { return x.timestamp; }),
      [{ name: t("repo_views"), color: "--s1", values: v.map(function (x) { return x.count; }) },
       { name: lang === "he" ? "מבקרים ייחודיים" : "Unique visitors", color: "--s2", values: v.map(function (x) { return x.uniques; }) }], dateShort);
    var c = (tr.clones && tr.clones.daily) || [];
    chartCard(grid, t("repo_clones"), "", "column",
      c.map(function (x) { return x.timestamp; }),
      [{ name: t("repo_clones"), color: "--s1", values: c.map(function (x) { return x.count; }) }], dateShort);
    box.insertAdjacentHTML("beforeend", '<div class="grid2">' +
      ranked(t("repo_referrers"), (tr.referrers || []).map(function (r) { return { value: r.referrer, count: r.count }; }), t("views14")) +
      ranked(t("repo_pages"), (tr.paths || []).map(function (p) { return { value: p.path, count: p.count }; }), t("views14")) +
      "</div>");
  }

  function pill(state) {
    var s = String(state || "").toLowerCase();
    var cls = /^(ok|ready|success|completed)$/.test(s) ? "good"
      : /^(error|failure|failed|canceled|cancelled|timed_out|down)$/.test(s) ? "bad" : "warn";
    return '<span class="pill ' + cls + '">' + esc(state || "unknown") + "</span>";
  }

  function renderMonitoring(d) {
    var up = d.uptime || {};
    $("uptime").innerHTML = up.checks ? '<div class="tbl-wrap"><table><thead><tr><th>' + t("check") + "</th><th>" + t("status") +
      '</th><th class="num">' + t("response") + "</th></tr></thead><tbody>" +
      up.checks.map(function (c) {
        return '<tr><td><a href="' + esc(c.url) + '" target="_blank" rel="noopener">' + esc(c.name) + "</a></td><td>" +
          pill(c.ok ? "ok" : "down") + ' <span class="muted small">' + esc(c.status || c.error || "") + '</span></td><td class="num">' + fmt(c.ms) + " ms</td></tr>";
      }).join("") + "</tbody></table></div>" : empty(t("unavailable"));

    var runs = (d.github && d.github.workflowRuns) || null;
    $("runs").innerHTML = runs && runs.length ? '<div class="tbl-wrap"><table><thead><tr><th>' + t("workflow") + "</th><th>" + t("result") +
      "</th><th>" + t("branch") + "</th><th>" + t("when") + "</th></tr></thead><tbody>" +
      runs.map(function (r) {
        return '<tr><td class="wrap-cell"><a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.name) + '</a><div class="muted small" dir="auto">' + esc(r.title) +
          "</div></td><td>" + pill(r.conclusion || r.status) + "</td><td>" + esc(r.branch) + "</td><td>" + ago(r.created) + "</td></tr>";
      }).join("") + "</tbody></table></div>" : empty(t("no_runs"));

    var v = d.vercel || {};
    var rt = v.runtime || {};
    var runtime = '<p class="muted small" style="margin:10px 0 0">' + esc(t("this_dashboard")) + ": " + esc(rt.env || "?") +
      (rt.region ? " · " + t("region") + " " + esc(rt.region) : "") + (rt.commit ? " · commit " + esc(rt.commit) : "") + " · Node " + esc(rt.node || "") + "</p>";
    if (!v.configured) { $("deploys").innerHTML = empty(setupHint("vercel")) + runtime; return; }
    if (v.error) { $("deploys").innerHTML = empty(esc(v.error)) + runtime; return; }
    $("deploys").innerHTML = '<div class="tbl-wrap"><table><thead><tr><th>' + t("deployment") + "</th><th>" + t("state") + "</th><th>" + t("target") + "</th><th>" + t("branch") + '</th><th class="num">' + t("build") + "</th><th>" + t("when") + "</th></tr></thead><tbody>" +
      v.deployments.map(function (x) {
        var build = x.ready && x.created ? Math.round((x.ready - x.created) / 1000) + " s" : "–";
        return '<tr><td class="wrap-cell"><a href="' + esc(x.inspector || "https://" + x.url) + '" target="_blank" rel="noopener">' + esc(x.message || x.url) +
          '</a><div class="muted small">' + esc(x.sha || x.url) + "</div></td><td>" + pill(x.state) + "</td><td>" + esc(x.target) + "</td><td>" + esc(x.branch || "") +
          '</td><td class="num">' + build + "</td><td>" + ago(x.created) + "</td></tr>";
      }).join("") + "</tbody></table></div>" + runtime;
  }

  function renderFeed(d) {
    var ph = d.posthog || {};
    if (!ph.configured) { $("feed").innerHTML = empty(t("needs_posthog")); return; }
    var rows = ph.recent || [];
    if (!rows.length) { $("feed").innerHTML = empty(t("nothing24")); return; }
    var clean = function (v) { return v && v !== "null" ? v : ""; };
    $("feed").innerHTML = '<div class="tbl-wrap"><table><thead><tr><th>' + t("when") + "</th><th>" + t("event") + "</th><th>" + t("who") +
      "</th><th>" + t("details") + "</th></tr></thead><tbody>" +
      rows.map(function (r) {
        var det = [clean(r.version) && "v" + r.version, clean(r.os), clean(r.answeredBy) && t("answered", { x: r.answeredBy }),
          clean(r.window), clean(r.error), clean(r.job) && r.job + (clean(r.level) ? " · " + t("lv", { n: r.level }) : ""),
          clean(r.page), clean(r.target), clean(r.country)].filter(Boolean).join(" · ");
        var name = EVENTS[r.event] ? EVENTS[r.event][lang === "he" ? 1 : 0] : r.event;
        return "<tr><td>" + ago(r.at) + "</td><td>" + esc(name) + '</td><td><code>' + esc(r.who) + '</code></td><td><bdi>' + esc(det) + "</bdi></td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  function render(d) {
    data = d;
    charts = [];
    renderNotices(d);
    renderNow(d);
    renderDownloads(d);
    renderApp(d);
    renderSite(d);
    renderGithub(d);
    renderMonitoring(d);
    renderFeed(d);
    /* charts measured their width while their grid was still filling in: draw again at final size */
    charts.forEach(function (c) { if (!c.table) draw(c); });
    $("updated").textContent = t("updated", { t: new Date(d.generatedAt).toLocaleTimeString(loc()) });
  }

  /* ---------------------------------------------------------------- flow */

  /* The server says which: no ADMIN_PASSWORD in this environment, or one under 12 characters. */
  function setupMessage(body) {
    var where = { preview: "Preview", production: "Production", development: "Development" }[body.env] || body.env || "this";
    return body.reason === "too-short"
      ? "Sign-in is off: ADMIN_PASSWORD in the " + where + " environment is shorter than 12 characters. Set a longer one in Vercel and redeploy."
      : "Sign-in is off: this " + where + " deployment has no ADMIN_PASSWORD. In Vercel, add it with " + where + " ticked (12+ characters), then redeploy.";
  }

  function showLogin(msg) {
    clearInterval(timer);
    $("app").hidden = true;
    $("login").hidden = false;
    var err = $("login-error");
    err.hidden = !msg;
    err.textContent = msg || "";
    $("password").focus();
  }

  function load(force) {
    var btn = $("refresh");
    btn.disabled = true;
    return api("/api/admin/stats" + (force ? "?fresh=1" : "")).then(function (r) {
      btn.disabled = false;
      if (r.status === 401) {
        return showLogin(r.body.configured === false ? setupMessage(r.body) : "");
      }
      if (r.status !== 200) { $("updated").textContent = t("refresh_failed", { s: r.status }); return; }
      $("login").hidden = true;
      $("app").hidden = false;
      render(r.body);
      schedule();
    }).catch(function () {
      btn.disabled = false;
      $("updated").textContent = t("offline");
    });
  }

  function schedule() {
    clearInterval(timer);
    if ($("auto").checked) timer = setInterval(function () { if (document.visibilityState === "visible") load(false); }, REFRESH_MS);
  }

  $("login-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var b = ev.submitter || this.querySelector("button[type=submit]");
    b.disabled = true;
    api("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: $("password").value }),
    }).then(function (r) {
      b.disabled = false;
      if (r.status === 200) { $("password").value = ""; return load(false); }
      showLogin({
        "wrong-password": t("wrong_password"),
        "too-many-attempts": t("too_many"),
      }[r.body.error] || (r.body.error === "not-configured" ? setupMessage(r.body) : t("signin_failed", { s: r.status })));
    }).catch(function () { b.disabled = false; showLogin(t("network_error")); });
  });

  $("refresh").addEventListener("click", function () { load(true); });
  $("auto").addEventListener("change", schedule);
  $("logout").addEventListener("click", function () {
    api("/api/admin/logout", { method: "POST" }).then(function () { showLogin(""); });
  });
  document.querySelectorAll(".lang-btn").forEach(function (b) { b.addEventListener("click", switchLang); });

  applyLang();
  load(false);
})();
