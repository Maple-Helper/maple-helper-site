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
    players_src: ["app 0.18.1 and later only · Israel time", "רק גרסה 0.18.1 ומעלה · שעון ישראל"],
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
    dl_note: ["These are GitHub's raw download counts. The Windows installer count includes in-app updates (every update downloads it again), so it is not a count of people; the release workflow also downloads it about twice per release (more on re-runs). <b>Update downloads started</b> are Windows apps fetching <code>SHA256SUMS.txt</code> as they start downloading an update. Game-data checks and downloads (<code>kb-manifest.json</code>, <code>kb.zip</code>) are not shown: the nightly game-data update uploads those files again, which resets their counts, and the build workflows download them too.",
      "אלה מספרי ההורדות הגולמיים של GitHub. מספר ההורדות של תוכנת ההתקנה ל-Windows כולל גם עדכונים מתוך האפליקציה (כל עדכון מוריד אותה שוב), ולכן הוא לא מספר אנשים; גם תהליך השחרור מוריד אותה בערך פעמיים בכל גרסה (יותר בהרצות חוזרות). <b>הורדות עדכון שהתחילו</b> הן אפליקציות Windows שמורידות את <code>SHA256SUMS.txt</code> כשהן מתחילות להוריד עדכון. בדיקות והורדות של נתוני המשחק (<code>kb-manifest.json</code>, <code>kb.zip</code>) לא מוצגות: העדכון הלילי מעלה את הקבצים האלה מחדש, וזה מאפס את המונים שלהם, וגם תהליכי הבנייה מורידים אותם."],
    how_counted: ["How these are counted", "איך זה נספר"],
    site_note: ["A <b>visit</b> is one browser tab (a random id kept for the tab, no cookies), so one person with two tabs counts twice. Visitors with Do Not Track or Global Privacy Control are not counted.",
      "<b>ביקור</b> הוא לשונית דפדפן אחת (מזהה אקראי שנשמר ללשונית, בלי עוגיות), כך שאדם אחד עם שתי לשוניות נספר פעמיים. מבקרים עם Do Not Track או Global Privacy Control לא נספרים."],
    // tiles
    visitors_online: ["Visitors online", "מבקרים באתר עכשיו"],
    visitors_online_sub: ["site tabs, last 5 minutes", "לשוניות באתר, 5 הדקות האחרונות"],
    latest_release: ["Latest release", "הגרסה האחרונה"],
    latest_sub: ["{ago} · {n} downloads (incl. updates)", "{ago} · {n} הורדות (כולל עדכונים)"],
    win_installer: ["Windows installer", "תוכנת התקנה ל-Windows"],
    portable: ["Portable", "גרסה ניידת"],
    win_zip: ["Windows zip", "zip ל-Windows"],
    update_checks: ["Update downloads started", "הורדות עדכון שהתחילו"],
    days30: ["last 30 days", "30 הימים האחרונים"],
    // charts
    show_table: ["Show table", "הצגת טבלה"],
    show_chart: ["Show chart", "הצגת גרף"],
    total: ["Total", "סה\"כ"],
    no_data: ["No data yet.", "אין נתונים עדיין."],
    // ranked
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
    visits_per_hour: ["Visits per hour", "ביקורים לפי שעה"],
    hours48: ["tabs active in each hour, last 48 hours, Israel time", "לשוניות פעילות בכל שעה, 48 השעות האחרונות, שעון ישראל"],
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
    api_left_sub: ["of {n}, renews at {t}", "מתוך {n}, מתחדש ב-{t}"], no_token: [" (no token)", " (בלי token)"],
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
    answered: ["answered by {x}", "נענתה ע״י {x}"], lv: ["level {n}", "רמה {n}"],
    updated: ["Updated {t}", "עודכן ב-{t}"], refresh_failed: ["Refresh failed ({s})", "הרענון נכשל ({s})"],
    offline: ["Offline? Refresh failed.", "אין חיבור? הרענון נכשל."],
    some_failed: ["some queries failed:", "חלק מהשאילתות נכשלו:"],
    wrong_password: ["Wrong password.", "סיסמה שגויה."],
    too_many: ["Too many attempts. Try again in 15 minutes.", "יותר מדי ניסיונות. נסו שוב בעוד 15 דקות."],
    signin_failed: ["Sign-in failed ({s}).", "הכניסה נכשלה ({s})."], network_error: ["Network error.", "שגיאת רשת."],
    just_now: ["just now", "עכשיו"], min_ago: ["{n} min ago", "לפני {n} דק'"], h_ago: ["{n} h ago", "לפני {n} שע'"], d_ago: ["{n} d ago", "לפני {n} ימים"], d_ago1: ["1 d ago", "לפני יום"],
    lang_switch: ["עברית", "English"],
    feed_part: ["Part of the activity didn't load (see the notice above): what's listed is not everything.", "חלק מהפעילות לא נטען (ראו את ההודעה למעלה): מה שמוצג הוא לא הכול."],
    data_from: ["numbers from {t}", "נתונים מ-{t}"],
    unavailable_q: ["Unavailable: this part failed to load (see the notice above). It is not 0.", "לא זמין: החלק הזה לא נטען (ראו את ההודעה למעלה). זה לא 0."],
    stale: ["PostHog didn't answer in full just now: the players, app and site numbers are the complete ones from {t} (GitHub and monitoring are current). Another try in a minute.", "PostHog לא ענה במלואו הרגע: נתוני השחקנים, האפליקציה והאתר הם הנתונים המלאים מ-{t} (GitHub והניטור עדכניים). ניסיון נוסף בעוד דקה."],
    top50: ["Showing the first 50.", "מוצגים 50 הראשונים."],
    today_so_far: ["today's point is the day so far", "הנקודה של היום היא היום עד עכשיו"],
    since181: ["since 0.18.1", "מאז 0.18.1"],
    loading: ["Loading the numbers from PostHog… the first load takes up to half a minute.", "טוען את הנתונים מ-PostHog… הטעינה הראשונה לוקחת עד חצי דקה."],
    loading_short: ["Loading…", "טוען…"],
    il_day: ["Israel day", "יום לפי שעון ישראל"],
    p_since: ["Data from {t} (the first 0.18.1 event).", "נתונים מ-{t} (האירוע הראשון של 0.18.1)."],
    p_note: ["Only events of Maple Helper 0.18.1 and later. From that version every install sends its events under one lasting random id, the app pings every 10 minutes while it runs, and there is no setting to turn the stats off (only the MAPLEHELPER_NO_TELEMETRY environment variable, or a firewall or ad-blocker that blocks PostHog). So a <b>player</b> here is one install (one computer and Windows/macOS user), counted once however often it restarts: one person with two computers counts twice. Every number is a direct count of distinct installs or of events, with no estimates (the one exception, the \"already installed\" part of the joining chart, is first seen minus new installs). Your own and your testers' installed copies count like any player. <b>Not included:</b> installs still on an older version (they join when they update), players who never finished the first-run setup, the developers' own source runs, and computers that never get online. Events that can't be sent are dropped, not retried, so time offline loses its events, and a crash can lose the last ~30 seconds. If an install's app data is wiped, it comes back as a new install. Times come from the player's computer clock. Days, weeks and months are in Israel time.",
      "רק אירועים של Maple Helper מגרסה 0.18.1 ומעלה. מהגרסה הזו כל התקנה שולחת את האירועים שלה תחת מזהה אקראי קבוע אחד, האפליקציה שולחת פינג כל 10 דקות כל עוד היא פתוחה, ואין הגדרה לכבות את הסטטיסטיקות (רק משתנה הסביבה MAPLEHELPER_NO_TELEMETRY, או חומת אש או חוסם פרסומות שחוסמים את PostHog). לכן <b>שחקן</b> כאן הוא התקנה אחת (מחשב אחד ומשתמש Windows/macOS אחד), שנספרת פעם אחת לא משנה כמה פעמים הופעלה: אדם אחד עם שני מחשבים נספר פעמיים. כל מספר הוא ספירה ישירה של התקנות שונות או של אירועים, בלי הערכות (היוצא מן הכלל, החלק \"התקנות קיימות\" בגרף המצטרפים, הוא נראו לראשונה פחות התקנות חדשות). גם העותקים המותקנים שלך ושל הבודקים נספרים כמו כל שחקן. <b>לא כלולים:</b> התקנות שעדיין בגרסה ישנה יותר (הן נכנסות כשהן מתעדכנות), שחקנים שלא סיימו את ההגדרה הראשונית, הרצות פיתוח של המפתחים, ומחשבים שלא מתחברים לאינטרנט. אירועים שלא הצליחו להישלח נמחקים ולא נשלחים שוב, כך שזמן בלי אינטרנט מאבד את האירועים שלו, וקריסה עלולה לאבד את ~30 השניות האחרונות. אם נתוני האפליקציה של התקנה נמחקים, היא חוזרת כהתקנה חדשה. הזמנים לפי השעון של המחשב של השחקן. ימים, שבועות וחודשים לפי שעון ישראל."],
    // tiles
    p_online: ["Online now", "מחוברים עכשיו"],
    p_online_sub: ["installs that pinged in the last 11 minutes", "התקנות ששלחו פינג ב-11 הדקות האחרונות"],
    p_today: ["Today", "היום"],
    p_today_sub: ["installs that had the app running today", "התקנות שהאפליקציה רצה אצלן היום"],
    p_week: ["Last 7 days", "7 הימים האחרונים"],
    p_week_sub: ["installs with the app running, today and the 6 days before", "התקנות שהאפליקציה רצה אצלן, היום ו-6 הימים שלפניו"],
    p_month: ["This month", "החודש"],
    p_month_sub: ["installs with the app running since the 1st", "התקנות שהאפליקציה רצה אצלן מתחילת החודש"],
    p_ever: ["All players", "כל השחקנים"],
    p_ever_sub: ["installs that ever ran 0.18.1+", "התקנות שאי פעם הריצו 0.18.1 ומעלה"],
    p_new_installs: ["New installs", "התקנות חדשות"],
    p_new_installs_sub: ["first start after the first-run setup, since 0.18.1 · {n} today", "הפעלה ראשונה אחרי ההגדרה הראשונית, מאז 0.18.1 · {n} היום"],
    p_updates: ["Updates", "עדכונים"],
    p_updates_sub: ["starts on a different version than the last run, since 0.18.1", "הפעלות בגרסה שונה מההפעלה הקודמת, מאז 0.18.1"],
    p_came_back: ["Came back", "חזרו"],
    p_came_back_sub: ["{a} of {b} installs first started before today started it on 2+ days", "{a} מתוך {b} התקנות שהופעלו לראשונה לפני היום הופעלו ב-2 ימים או יותר"],
    p_active_week: ["Still active after a week", "עדיין פעילים אחרי שבוע"],
    p_active_week_sub: ["{a} of {b} installs first started 7+ days ago started it in the last 7 days", "{a} מתוך {b} התקנות שהופעלו לראשונה לפני 7 ימים ויותר הופעלו ב-7 הימים האחרונים"],
    p_questions: ["Questions", "שאלות"],
    p_questions_sub: ["since 0.18.1 · {n} today · {p} with a screenshot · {r} retries apart", "מאז 0.18.1 · {n} היום · {p} עם צילום מסך · {r} ניסיונות חוזרים בנפרד"],
    p_askers: ["Players who asked", "שחקנים ששאלו"],
    p_askers_sub: ["{p} of all players · {q} questions each on average", "{p} מכל השחקנים · {q} שאלות בממוצע לשואל"],
    p_voice: ["Voice inputs", "הקלטות קול"],
    p_sessions: ["Sessions", "הפעלות"],
    p_sessions_sub: ["runs that ended with a normal quit, since 0.18.1 · {m} on average · {h} in total", "הפעלות שהסתיימו ביציאה רגילה, מאז 0.18.1 · {m} בממוצע · {h} בסך הכול"],
    p_minutes: ["{n} min", "{n} דק'"],
    p_hours: ["{n} h", "{n} שעות"],
    p_crashes: ["Errors", "שגיאות"],
    p_crashes_sub: ["{n} installs, since 0.18.1", "{n} התקנות, מאז 0.18.1"],
    p_kb: ["Game-data updates", "עדכוני נתוני משחק"],
    p_kb_sub: ["{n} failed, since 0.18.1", "{n} נכשלו, מאז 0.18.1"],
    p_windows_opened: ["Windows opened", "חלונות שנפתחו"],
    p_all_time: ["since 0.18.1", "מאז 0.18.1"],
    // charts
    p_per_day: ["Players per day", "שחקנים ביום"],
    p_players_s: ["Players", "שחקנים"],
    p_joins_day: ["Joining per day", "מצטרפים ביום"],
    p_joins_sub: ["first seen on 0.18.1+ that day", "נראו לראשונה ב-0.18.1+ באותו יום"],
    p_updated_s: ["Already installed (mostly updates)", "התקנות קיימות (רובן עדכונים)"],
    p_new_installs_s: ["New installs", "התקנות חדשות"],
    p_online_hour: ["Online per hour", "מחוברים לפי שעה"],
    p_hours48: ["last 48 hours, Israel time; the last hour is still filling", "48 השעות האחרונות, שעון ישראל; השעה האחרונה עדיין מתמלאת"],
    p_online_s: ["Installs online", "התקנות מחוברות"],
    p_questions_day: ["Questions per day", "שאלות ביום"],
    // lists
    p_per_install30: ["installs, latest value, last 30 days", "התקנות, הערך האחרון, 30 הימים האחרונים"],
    p_l_version: ["App version", "גרסת האפליקציה"],
    p_l_os: ["Operating system", "מערכת הפעלה"],
    p_l_country: ["Country", "מדינה"],
    p_l_level: ["Character level", "רמת הדמות"],
    p_l_class: ["Class", "מחלקה"],
    p_l_job: ["Job", "ג'וב"],
    p_l_provider: ["AI provider", "ספק ה-AI"],
    p_l_language: ["App language", "שפת האפליקציה"],
    p_l_answered: ["Who answered", "מי ענה"],
    p_l_answered_sub: ["questions and retries, 30 days · instant = the app itself, no AI", "שאלות וניסיונות חוזרים, 30 יום · instant = האפליקציה עצמה, בלי AI"],
    p_l_window: ["Windows opened", "חלונות שנפתחו"],
    p_times30: ["times, 30 days", "פעמים, 30 יום"],
    p_l_crash: ["Errors", "שגיאות"],
    p_l_crash_sub: ["error @ file:line, 30 days", "שגיאה @ קובץ:שורה, 30 יום"],
    p_l_kb_fail: ["Game-data update failures", "כישלונות בעדכון נתוני המשחק"],
    p_reason30: ["reason, 30 days", "סיבה, 30 יום"],
    p_l_updated_from: ["Updated from", "עודכנו מגרסה"],
    p_updated_from_sub: ["updates, 30 days", "עדכונים, 30 יום"],
    // feed
    p_answered: ["answered by {x}", "נענתה ע״י {x}"], lv: ["level {n}", "רמה {n}"],
    // flow
    p_updated: ["Updated {t}", "עודכן ב-{t}"], refresh_failed: ["Refresh failed ({s})", "הרענון נכשל ({s})"],
    p_signin_failed: ["Sign-in failed ({s}).", "הכניסה נכשלה ({s})."], network_error: ["Network error.", "שגיאת רשת."],
    p_just_now: ["just now", "עכשיו"], min_ago: ["{n} min ago", "לפני {n} דק'"], h_ago: ["{n} h ago", "לפני {n} שע'"],
    p_d_ago: ["{n} d ago", "לפני {n} ימים"], d_ago1: ["1 d ago", "לפני יום"],
  };
  /* ---------------------------------------------------------------- explanations (the ⓘ of every number)
     [English, Hebrew]: what it is, how it's counted, how to follow it */
  var H = {
    h_online: ["<b>What:</b> how many installs have the app running right now. <b>Counted:</b> distinct installs whose app sent its \"running\" ping in the last 11 minutes (it pings every 10 minutes, also while it sits in the tray). <b>Follow:</b> peaks show when players play; check it at different hours. A sudden drop to 0 for everyone means a problem (the app, PostHog or the network), not players leaving.",
      "<b>מה זה:</b> כמה התקנות מריצות את האפליקציה ממש עכשיו. <b>איך נספר:</b> התקנות שונות ששלחו את פינג \"האפליקציה רצה\" ב-11 הדקות האחרונות (פינג כל 10 דקות, גם כשהאפליקציה רק יושבת ליד השעון). <b>איך לעקוב:</b> השיאים מראים מתי שחקנים משחקים; כדאי להציץ בשעות שונות. ירידה פתאומית ל-0 אצל כולם מעידה על תקלה (באפליקציה, ב-PostHog או ברשת), לא על עזיבת שחקנים."],
    h_today: ["<b>What:</b> installs that had the app running today. <b>Counted:</b> distinct installs with any event since midnight, Israel time (a ping is enough, so an app that started with Windows and sat in the tray counts). <b>Follow:</b> your daily active players (DAU). Compare the same weekday week to week; a rise after a release or a post means it worked.",
      "<b>מה זה:</b> התקנות שהאפליקציה רצה אצלן היום. <b>איך נספר:</b> התקנות שונות עם אירוע כלשהו מחצות, שעון ישראל (מספיק פינג, כך שגם אפליקציה שעלתה עם Windows ונשארה ליד השעון נספרת). <b>איך לעקוב:</b> זה מספר השחקנים היומי (DAU). כדאי להשוות לאותו יום בשבוע הקודם; עלייה אחרי גרסה או פוסט אומרת שזה עבד."],
    h_week: ["<b>What:</b> installs that had the app running in the last 7 days. <b>Counted:</b> distinct installs with any event today or in the 6 days before (Israel time). <b>Follow:</b> your weekly active players (WAU); steadier than the daily number. Today ÷ last 7 days shows how often players come: near 100% = they use it every day.",
      "<b>מה זה:</b> התקנות שהאפליקציה רצה אצלן ב-7 הימים האחרונים. <b>איך נספר:</b> התקנות שונות עם אירוע כלשהו היום או ב-6 הימים שלפניו (שעון ישראל). <b>איך לעקוב:</b> מספר השחקנים השבועי (WAU), יציב יותר מהיומי. היום חלקי 7 הימים מראה כמה בתדירות שחקנים חוזרים: קרוב ל-100% = משתמשים כל יום."],
    h_month: ["<b>What:</b> installs that had the app running this calendar month. <b>Counted:</b> distinct installs with any event since the 1st of the month (Israel time). <b>Follow:</b> monthly active players (MAU). Compare month to month; it restarts from 0 on the 1st.",
      "<b>מה זה:</b> התקנות שהאפליקציה רצה אצלן החודש. <b>איך נספר:</b> התקנות שונות עם אירוע כלשהו מה-1 בחודש (שעון ישראל). <b>איך לעקוב:</b> מספר השחקנים החודשי (MAU). השוו חודש לחודש; ב-1 לחודש הוא מתחיל מ-0."],
    h_ever: ["<b>What:</b> every install that ever ran version 0.18.1 or later. <b>Counted:</b> distinct installs since 0.18.1 came out (12.10.2026). Older installs join when they update (Windows updates itself; macOS players update by hand). <b>Follow:</b> your total reach. It only grows; how fast it grows = new installs + updaters.",
      "<b>מה זה:</b> כל ההתקנות שאי פעם הריצו גרסה 0.18.1 ומעלה. <b>איך נספר:</b> התקנות שונות מאז ש-0.18.1 יצאה (12.10.2026). התקנות ישנות מצטרפות כשהן מתעדכנות (ב-Windows העדכון אוטומטי; ב-Mac מעדכנים ידנית). <b>איך לעקוב:</b> החשיפה הכוללת. המספר רק עולה; קצב העלייה = התקנות חדשות + מתעדכנים."],
    h_new_installs: ["<b>What:</b> new players. <b>Counted:</b> installs whose app started for the first time after finishing the first-run setup (since 0.18.1). A reinstall on the same computer that kept the app's data is not new; a computer whose app data was wiped counts as new. Someone who quit during setup isn't counted until they finish it. <b>Follow:</b> your growth. Comparing with the site's download clicks gives only a rough idea of how many finish installing (clicks also include repeat clicks, reinstalls and visitors who block counting; installs from GitHub skip the site).",
      "<b>מה זה:</b> שחקנים חדשים. <b>איך נספר:</b> התקנות שהאפליקציה שלהן הופעלה לראשונה אחרי סיום ההגדרה הראשונית (מאז 0.18.1). התקנה מחדש באותו מחשב שבה נתוני האפליקציה נשמרו לא נחשבת חדשה; מחשב שנתוני האפליקציה בו נמחקו נחשב חדש. מי שעצר באמצע ההגדרה לא נספר עד שיסיים. <b>איך לעקוב:</b> קצב הצמיחה. השוואה ללחיצות ההורדה באתר נותנת רק מושג גס כמה מסיימים להתקין (בלחיצות יש גם לחיצות חוזרות, התקנות מחדש ומבקרים שחוסמים ספירה; מי שמוריד מ-GitHub לא עובר באתר)."],
    h_updates: ["<b>What:</b> app updates that reached players. <b>Counted:</b> app starts on a different version than the last run (normally an update; a downgrade also counts). Only from 0.18.1 on. <b>Follow:</b> after each release, watch how fast players arrive on it (see also \"App version\" and \"Updated from\").",
      "<b>מה זה:</b> עדכוני אפליקציה שהגיעו לשחקנים. <b>איך נספר:</b> הפעלות בגרסה שונה מההפעלה הקודמת (בדרך כלל עדכון; גם חזרה לגרסה ישנה נספרת). רק מגרסה 0.18.1. <b>איך לעקוב:</b> אחרי כל גרסה, כמה מהר שחקנים מגיעים אליה (ראו גם \"גרסת האפליקציה\" ו\"עודכנו מגרסה\")."],
    h_came_back: ["<b>What:</b> do players come back after the first day? <b>Counted:</b> of the installs whose first start on 0.18.1 or later was before today (for players who updated, that's the update day, not their real first day), the share that started the app on 2 or more different days (a single session that runs past midnight doesn't count as coming back; an app that starts with Windows counts as a start). <b>Follow:</b> the most important health number: low = players try it once and leave. It needs a few days of data to mean something.",
      "<b>מה זה:</b> האם שחקנים חוזרים אחרי היום הראשון? <b>איך נספר:</b> מתוך ההתקנות שההפעלה הראשונה שלהן בגרסה 0.18.1 ומעלה הייתה לפני היום (אצל מי שהתעדכן זה יום העדכון, לא היום הראשון האמיתי), החלק שהפעיל את האפליקציה ב-2 ימים שונים או יותר (הפעלה אחת שנמשכת אחרי חצות לא נחשבת חזרה; אפליקציה שעולה עם Windows נחשבת הפעלה). <b>איך לעקוב:</b> מדד הבריאות החשוב ביותר: נמוך = מנסים פעם אחת ועוזבים. צריך כמה ימים של נתונים כדי שיהיה משמעותי."],
    h_active_week: ["<b>What:</b> do players stay after their first week? <b>Counted:</b> of the installs whose first start on 0.18.1 or later was 7 or more days ago, the share that started the app in the last 7 days. <b>Follow:</b> long-term retention. Shows \"–\" until the first players are a week old (19.10.2026).",
      "<b>מה זה:</b> האם שחקנים נשארים אחרי השבוע הראשון? <b>איך נספר:</b> מתוך ההתקנות שההפעלה הראשונה שלהן בגרסה 0.18.1 ומעלה הייתה לפני 7 ימים ויותר, החלק שהפעיל את האפליקציה ב-7 הימים האחרונים. <b>איך לעקוב:</b> שימור לטווח ארוך. יוצג \"–\" עד שהשחקנים הראשונים יהיו בני שבוע (19.10.2026)."],
    h_questions: ["<b>What:</b> questions players asked the AI. <b>Counted:</b> each question once, when it's sent (a \"Try again\" or \"Ask &lt;AI&gt; anyway\" of the same question is counted apart, as a retry); instant answers from the app's own data count too. <b>Follow:</b> the core use of the app. Many retries = many failed AI answers (limits, sign-in, network) or instant answers that didn't help.",
      "<b>מה זה:</b> שאלות ששחקנים שאלו את ה-AI. <b>איך נספר:</b> כל שאלה פעם אחת, ברגע השליחה (\"נסה שוב\" או \"Ask &lt;AI&gt; anyway\" על אותה שאלה נספרים בנפרד, כניסיון חוזר); גם תשובות מיידיות מהנתונים של האפליקציה נספרות. <b>איך לעקוב:</b> השימוש העיקרי באפליקציה. הרבה ניסיונות חוזרים = הרבה תשובות AI שנכשלו (מגבלות, התחברות, רשת) או תשובות מיידיות שלא עזרו."],
    h_askers: ["<b>What:</b> how many players actually use the chat. <b>Counted:</b> distinct installs that asked at least one question (since 0.18.1), their share of all players, and questions per asking player. <b>Follow:</b> a low share = many players only use the other tools, or don't know they can ask.",
      "<b>מה זה:</b> כמה שחקנים באמת משתמשים בצ'אט. <b>איך נספר:</b> התקנות שונות ששאלו לפחות שאלה אחת (מאז 0.18.1), החלק שלהן מכל השחקנים, ושאלות לשואל. <b>איך לעקוב:</b> אחוז נמוך = הרבה שחקנים משתמשים רק בכלים האחרים, או לא יודעים שאפשר לשאול."],
    h_voice: ["<b>What:</b> use of the microphone. <b>Counted:</b> every time speech was turned into text (also when the text was then not sent). <b>Follow:</b> whether the voice feature is worth investing in.",
      "<b>מה זה:</b> שימוש במיקרופון. <b>איך נספר:</b> כל פעם שדיבור הפך לטקסט (גם אם הטקסט לא נשלח בסוף). <b>איך לעקוב:</b> האם כדאי להשקיע בתכונת הקול."],
    h_sessions: ["<b>What:</b> how long the app stays open. <b>Counted:</b> app runs that ended with a normal quit, with the time from start to quit (including time in the tray; on Windows also computer sleep). Runs that ended in a crash, a forced close or a Windows shutdown aren't counted. <b>Follow:</b> a rough measure of engagement; one long tray session can pull the average up.",
      "<b>מה זה:</b> כמה זמן האפליקציה פתוחה. <b>איך נספר:</b> הפעלות שהסתיימו ביציאה רגילה, עם הזמן מההפעלה ועד היציאה (כולל זמן ליד השעון; ב-Windows גם שינה של המחשב). הפעלות שהסתיימו בקריסה, בסגירה בכוח או בכיבוי Windows לא נספרות. <b>איך לעקוב:</b> מדד גס למעורבות; הפעלה ארוכה אחת ליד השעון יכולה להעלות את הממוצע."],
    h_windows_opened: ["<b>What:</b> use of the app's windows (tools, map, Free Market, guides, settings...). <b>Counted:</b> every time a window was opened (bringing an already open one forward doesn't count; the chat and the in-game bar aren't windows; the What's new window that opens by itself after an update counts too). See the \"Windows opened\" list for which. <b>Follow:</b> which features players use and which nobody opens.",
      "<b>מה זה:</b> שימוש בחלונות של האפליקציה (כלים, מפה, שוק, מדריכים, הגדרות...). <b>איך נספר:</b> כל פתיחה של חלון (הבאת חלון שכבר פתוח לקדמת המסך לא נספרת; הצ'אט והסרגל שמעל המשחק אינם חלונות; גם חלון 'מה חדש' שנפתח מעצמו אחרי עדכון נספר). איזה חלון בדיוק – ברשימה \"חלונות שנפתחו\". <b>איך לעקוב:</b> באילו תכונות משתמשים ואילו אף אחד לא פותח."],
    h_crashes: ["<b>What:</b> errors inside the app. <b>Counted:</b> unexpected program errors (uncaught exceptions), with how many installs had one. Many of them the app survives; a hard crash of the whole program or a freeze isn't counted. <b>Follow:</b> should stay near 0. The \"Errors\" list says where in the code: the top line is the first thing to fix.",
      "<b>מה זה:</b> שגיאות בתוך האפליקציה. <b>איך נספר:</b> שגיאות תוכנה לא צפויות, וכמה התקנות נתקלו בהן. את רובן האפליקציה שורדת; קריסה מוחלטת של כל התוכנה או תקיעה לא נספרות. <b>איך לעקוב:</b> צריך להישאר קרוב ל-0. הרשימה \"שגיאות\" אומרת איפה בקוד: השורה העליונה היא הדבר הראשון לתקן."],
    h_kb: ["<b>What:</b> game-data updates the app downloaded (the nightly NiaMeowDB data). <b>Counted:</b> successful updates, and failed ones: a check or download that failed, including when the app couldn't reach the update server at all (the failure list gives the reason). <b>Follow:</b> failures should be rare; many of them = a problem with the nightly data or the download.",
      "<b>מה זה:</b> עדכוני נתוני המשחק שהאפליקציה הורידה (הנתונים הליליים מ-NiaMeowDB). <b>איך נספר:</b> עדכונים שהצליחו, ועדכונים שנכשלו: בדיקה או הורדה שנכשלו, כולל כשהאפליקציה לא הצליחה להגיע לשרת העדכונים בכלל (ברשימת הכישלונות מופיעה הסיבה). <b>איך לעקוב:</b> כישלונות צריכים להיות נדירים; הרבה כאלה = בעיה בנתונים הליליים או בהורדה."],
    h_per_day: ["<b>What:</b> players per day since 0.18.1. <b>Counted:</b> distinct installs with any event that day (Israel time). <b>Follow:</b> the trend line of the app. Weekends and game events show as bumps; look at the direction over weeks, not single days.",
      "<b>מה זה:</b> שחקנים בכל יום מאז 0.18.1. <b>איך נספר:</b> התקנות שונות עם אירוע כלשהו באותו יום (שעון ישראל). <b>איך לעקוב:</b> קו המגמה של האפליקציה. סופי שבוע ואירועים במשחק נראים כקפיצות; חשוב הכיוון לאורך שבועות, לא יום בודד."],
    h_joins_day: ["<b>What:</b> where new players come from, per day. <b>Counted:</b> installs seen on 0.18.1+ for the first time that day, split into new installs and the rest: mostly installs that updated from an older version, also any whose start event didn't arrive. <b>Follow:</b> the \"updated\" part fades as old installs finish updating; after that, new installs are your real growth.",
      "<b>מה זה:</b> מאיפה מגיעים שחקנים, בכל יום. <b>איך נספר:</b> התקנות שנראו ב-0.18.1+ לראשונה באותו יום, מחולקות להתקנות חדשות ולשאר: בעיקר כאלה שהתעדכנו מגרסה ישנה, וגם כאלה שאירוע ההפעלה שלהן לא הגיע. <b>איך לעקוב:</b> החלק של המתעדכנים ידעך כשההתקנות הישנות יסיימו להתעדכן; מאז ההתקנות החדשות הן הצמיחה האמיתית."],
    h_online_hour: ["<b>What:</b> installs with the app running, hour by hour, last 48 hours (Israel time). <b>Counted:</b> distinct installs that pinged during that hour; the last hour is still filling up. <b>Follow:</b> when players play: the best hours to post news or release an update.",
      "<b>מה זה:</b> התקנות שהאפליקציה רצה אצלן, שעה אחרי שעה, ב-48 השעות האחרונות (שעון ישראל). <b>איך נספר:</b> התקנות שונות ששלחו פינג באותה שעה; השעה האחרונה עדיין מתמלאת. <b>איך לעקוב:</b> מתי שחקנים משחקים: השעות הטובות לפרסם חדשות או לשחרר עדכון."],
    h_questions_day: ["<b>What:</b> questions per day (retries not included). <b>Follow:</b> together with players per day: questions per player shows whether the chat stays useful.",
      "<b>מה זה:</b> שאלות בכל יום (בלי ניסיונות חוזרים). <b>איך לעקוב:</b> ביחד עם שחקנים ביום: שאלות לשחקן מראות אם הצ'אט ממשיך להיות שימושי."],
    h_per_install: ["<b>Counted:</b> each install once, with its value on its latest \"running\" ping of the last 30 days (where the player is now, its current character and settings). Empty = not known: no character set up yet (level, class, job), or a location the IP address doesn't tell (country). <b>Follow:</b> who your players are: which countries to target, which levels and jobs the content should serve.",
      "<b>איך נספר:</b> כל התקנה פעם אחת, עם הערך מהפינג האחרון שלה ב-30 הימים האחרונים (איפה השחקן נמצא עכשיו, הדמות וההגדרות הנוכחיות). ריק = לא ידוע: עוד לא הוגדרה דמות (רמה, מחלקה, ג'וב), או מיקום שכתובת ה-IP לא מגלה (מדינה). <b>איך לעקוב:</b> מי השחקנים: לאילו מדינות לפנות, לאילו רמות וג'ובים התוכן צריך להתאים."],
    h_version: ["<b>What:</b> the app version each player runs now. <b>Follow:</b> after a release, how fast it spreads. Windows updates itself; macOS players who stay on an old version need a reminder.",
      "<b>מה זה:</b> הגרסה שכל שחקן מריץ עכשיו. <b>איך לעקוב:</b> אחרי גרסה, כמה מהר היא מתפשטת. Windows מתעדכן לבד; שחקני Mac שנשארים בגרסה ישנה צריכים תזכורת."],
    h_answered: ["<b>What:</b> which AI each question was sent to (30 days): the provider set at the time, so a question whose answer failed counts too. \"instant\" = answered by the app itself from its game data, with no AI; \"(retry)\" = a Try again / Ask &lt;AI&gt; anyway. <b>Follow:</b> which AI accounts your players use: where to put testing effort.",
      "<b>מה זה:</b> לאיזה AI נשלחה כל שאלה (30 יום): הספק שהיה מוגדר באותו רגע, כך שגם שאלה שהתשובה עליה נכשלה נספרת. \"instant\" = האפליקציה ענתה בעצמה מנתוני המשחק, בלי AI; \"(retry)\" = נסה שוב / Ask &lt;AI&gt; anyway. <b>איך לעקוב:</b> באילו חשבונות AI השחקנים משתמשים: איפה להשקיע בבדיקות."],
    h_window_list: ["<b>What:</b> which windows were opened (30 days). <b>Follow:</b> the features that matter to players; a window nobody opens is a candidate to improve, move or drop.",
      "<b>מה זה:</b> אילו חלונות נפתחו (30 יום). <b>איך לעקוב:</b> התכונות שחשובות לשחקנים; חלון שאף אחד לא פותח הוא מועמד לשיפור, להעברה או להסרה."],
    h_updated_from: ["<b>What:</b> the version players updated from (30 days). <b>Follow:</b> shows how old the installs out there were; many from a very old version = the in-app update reaches them only now.",
      "<b>מה זה:</b> הגרסה שממנה שחקנים התעדכנו (30 יום). <b>איך לעקוב:</b> מראה כמה ישנות היו ההתקנות בשטח; הרבה מגרסה ישנה מאוד = העדכון מתוך האפליקציה מגיע אליהן רק עכשיו."],
    h_crash_list: ["<b>What:</b> where the errors happened: the error type @ file:line in the app's code (30 days). Never the error's message, which could hold a player's text. <b>Follow:</b> fix from the top down.",
      "<b>מה זה:</b> איפה קרו השגיאות: סוג השגיאה @ קובץ:שורה בקוד האפליקציה (30 יום). אף פעם לא הודעת השגיאה, שעלולה להכיל טקסט של שחקן. <b>איך לעקוב:</b> מתקנים מלמעלה למטה."],
    h_kb_fail: ["<b>What:</b> why game-data updates failed (30 days). <b>Follow:</b> \"didn't download\" is usually the player's network; checksum or load errors point at the data itself.",
      "<b>מה זה:</b> למה עדכוני נתוני המשחק נכשלו (30 יום). <b>איך לעקוב:</b> \"didn't download\" הוא בדרך כלל הרשת של השחקן; שגיאות checksum או טעינה מצביעות על בעיה בנתונים עצמם."],
    // downloads
    h_dl_win: ["<b>What:</b> downloads of the Windows installer, all versions, as GitHub counts them. Every in-app update downloads it again, and the release workflow downloads it about twice per release, so this is not a count of people. <b>Follow:</b> use \"New installs\" and \"All players\" for people; this one only for comparing releases.",
      "<b>מה זה:</b> הורדות של תוכנת ההתקנה ל-Windows, בכל הגרסאות, כפי ש-GitHub סופר. כל עדכון מתוך האפליקציה מוריד אותה שוב, ותהליך השחרור מוריד אותה בערך פעמיים בכל גרסה, ולכן זה לא מספר אנשים. <b>איך לעקוב:</b> לאנשים – \"התקנות חדשות\" ו\"כל השחקנים\"; את זה רק להשוואה בין גרסאות."],
    h_dl_mac: ["<b>What:</b> downloads of the macOS app (.dmg), all versions. On macOS updates are downloaded by hand, so this includes updates too, plus at least one download per release by the release workflow. <b>Follow:</b> interest from Mac players.",
      "<b>מה זה:</b> הורדות של אפליקציית ה-Mac (.dmg), בכל הגרסאות. ב-Mac מורידים עדכונים ידנית, ולכן גם עדכונים נכללים, וגם לפחות הורדה אחת בכל גרסה של תהליך השחרור. <b>איך לעקוב:</b> העניין משחקני Mac."],
    h_dl_portable: ["<b>What:</b> downloads of the portable Windows zip (no installer, no self-update), all versions.",
      "<b>מה זה:</b> הורדות של גרסת ה-zip הניידת ל-Windows (בלי התקנה ובלי עדכון עצמי), בכל הגרסאות."],
    h_dl_checks: ["<b>What:</b> Windows apps that started downloading an update: each one fetches the checksum file (SHA256SUMS.txt) first, also on a retry or when it re-checks an update it already downloaded; plus the release workflow's own checks. <b>Follow:</b> roughly how many self-updates were started per release.",
      "<b>מה זה:</b> אפליקציות Windows שהתחילו להוריד עדכון: כל אחת מורידה קודם את קובץ הבדיקה (SHA256SUMS.txt), גם בניסיון חוזר או כשהיא בודקת שוב עדכון שכבר הורידה; ועוד הבדיקות של תהליך השחרור עצמו. <b>איך לעקוב:</b> בערך כמה עדכונים עצמיים התחילו בכל גרסה."],
    h_latest: ["<b>What:</b> the newest released version, how long ago, and its downloads (Windows + macOS + portable, updates included).",
      "<b>מה זה:</b> הגרסה האחרונה ששוחררה, לפני כמה זמן, וההורדות שלה (Windows + Mac + ניידת, כולל עדכונים)."],
    // site
    h_site_online: ["<b>What:</b> browser tabs with maplehelper.app in view in the last 5 minutes (a page pings once a minute while it's visible, up to 30 times per page).",
      "<b>מה זה:</b> לשוניות דפדפן שבהן האתר maplehelper.app מוצג, ב-5 הדקות האחרונות (דף שולח פינג פעם בדקה כשהוא גלוי, עד 30 פעמים לכל דף)."],
    h_site_visits: ["<b>What:</b> visits to the site. <b>Counted:</b> one visit = one browser tab (no cookies: one person with two tabs counts twice; visitors with Do Not Track or Global Privacy Control aren't counted). <b>Follow:</b> how many people reach the site; a jump after a post shows the post worked.",
      "<b>מה זה:</b> ביקורים באתר. <b>איך נספר:</b> ביקור אחד = לשונית דפדפן אחת (בלי עוגיות: אדם עם שתי לשוניות נספר פעמיים; מבקרים עם Do Not Track או Global Privacy Control לא נספרים). <b>איך לעקוב:</b> כמה אנשים מגיעים לאתר; קפיצה אחרי פוסט אומרת שהפוסט עבד."],
    h_site_views: ["<b>What:</b> pages viewed on the site (a visit that opens the Hebrew page too counts 2).",
      "<b>מה זה:</b> צפיות בדפים באתר (ביקור שפותח גם את הדף בעברית נספר 2)."],
    h_site_clicks: ["<b>What:</b> clicks on the site's download buttons, and the share of visits that clicked one. <b>Follow:</b> how convincing the site is; next to \"New installs\" it gives a rough idea of how many finish installing.",
      "<b>מה זה:</b> לחיצות על כפתורי ההורדה באתר, והחלק מהביקורים שכללו לחיצה. <b>איך לעקוב:</b> כמה האתר משכנע; לצד \"התקנות חדשות\" זה נותן מושג גס כמה מסיימים להתקין."],
    h_site_lists: ["<b>What:</b> where site visitors come from (country, referring site), which pages they view and on which device, last 30 days. <b>Follow:</b> \"(direct)\" = typed or a link with no referrer; \"(internal)\" = moving between the site's own pages; the other referrers show which posts and groups bring people.",
      "<b>מה זה:</b> מאיפה מגיעים המבקרים באתר (מדינה, אתר מפנה), באילו דפים הם צופים ובאיזה מכשיר, ב-30 הימים האחרונים. <b>איך לעקוב:</b> \"(direct)\" = הקלדה או קישור בלי מקור; \"(internal)\" = מעבר בין הדפים של האתר עצמו; שאר המקורות מראים אילו פוסטים וקבוצות מביאים אנשים."],
    // github and monitoring
    h_gh: ["<b>What:</b> the public GitHub repository: stars (people who bookmarked it), forks, watchers, open issues and pull requests (one number for both), and the last push. <b>Follow:</b> open issues may be player reports waiting for an answer.",
      "<b>מה זה:</b> המאגר הציבורי ב-GitHub: כוכבים (אנשים שסימנו אותו), forks, עוקבים, Issues ו-PRs פתוחים (מספר אחד לשניהם), וה-push האחרון. <b>איך לעקוב:</b> Issues פתוחים יכולים להיות דיווחים של שחקנים שמחכים לתשובה."],
    h_monitoring: ["<b>What:</b> live checks that the site answers and that the latest release has each download file fully uploaded (checked through GitHub's API, never by downloading, which would add to the download counts), the latest GitHub Actions runs (builds, releases, the nightly game-data update) and site deployments. <b>Follow:</b> anything red here needs attention: a failed release or nightly update, or a broken download link.",
      "<b>מה זה:</b> בדיקות חיות שהאתר עונה ושבגרסה האחרונה כל קובץ הורדה הועלה במלואו (נבדק דרך ה-API של GitHub, אף פעם לא בהורדה, שהייתה מוסיפה למספרי ההורדות), ההרצות האחרונות של GitHub Actions (בנייה, גרסאות, עדכון נתוני המשחק הלילי) ופריסות האתר. <b>איך לעקוב:</b> כל דבר אדום כאן דורש טיפול: גרסה או עדכון לילי שנכשלו, או קישור הורדה שבור."],
    h_feed: ["<b>What:</b> the latest app and site events of the last 24 hours (pings left out), with the first characters of the install or visitor id, so you can follow one install.",
      "<b>מה זה:</b> האירועים האחרונים של האפליקציה והאתר ב-24 השעות האחרונות (בלי פינגים), עם תחילת מזהה ההתקנה או המבקר, כך שאפשר לעקוב אחרי התקנה אחת."],
    guide: ["Guide to every number", "מדריך לכל מספר בדשבורד"],
    guide_intro: ["Every number on this page, what it means, how it's counted and how to follow it. The same text opens from the ⓘ next to each number.",
      "כל מספר בדשבורד: מה הוא אומר, איך הוא נספר ואיך לעקוב אחריו. אותו הסבר נפתח גם מה-ⓘ שליד כל מספר."],
    what_is: ["What is this?", "מה זה?"],
  };
  var EVENTS = {
    app_started: ["App started", "האפליקציה הופעלה"], app_updated: ["App updated", "האפליקציה עודכנה"],
    question_asked: ["Question asked", "נשאלה שאלה"], voice_used: ["Voice input", "הקלטה קולית"],
    app_closed: ["App closed", "האפליקציה נסגרה"], window_opened: ["Window opened", "נפתח חלון"],
    app_crashed: ["Error", "שגיאה"], kb_updated: ["Game data updated", "נתוני המשחק עודכנו"],
    kb_update_failed: ["Game-data update failed", "עדכון נתוני המשחק נכשל"],
    site_pageview: ["Site visit", "ביקור באתר"], site_download: ["Download click", "לחיצת הורדה"],
  };
  var lang = "he";
  try { lang = localStorage.getItem("mh-admin-lang") === "en" ? "en" : "he"; } catch (e) { /* private mode */ }
  function t(key, vars) {
    var s = (S[key] || H[key] || [key, key])[lang === "he" ? 1 : 0];
    if (vars) for (var k in vars) s = s.split("{" + k + "}").join(vars[k]);
    return s;
  }
  function applyLang() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
    document.title = t("title");
    document.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    document.querySelectorAll("[data-i18n-html]").forEach(function (el) { el.innerHTML = t(el.getAttribute("data-i18n-html")); });
    document.querySelectorAll(".lang-btn").forEach(function (b) { b.textContent = t("lang_switch"); b.lang = lang === "he" ? "en" : "he"; });
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
  function ilOffset(ms) {
    var x = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", timeZoneName: "shortOffset" }).formatToParts(new Date(ms));
    return (x.filter(function (p) { return p.type === "timeZoneName"; })[0] || {}).value || "";
  }
  function hourShort(d) {      // an hour, shown in Israel time whatever the browser's time zone
    var ms = new Date(d).getTime();
    var opts = { timeZone: "Asia/Jerusalem", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
    var off = ilOffset(ms);
    if (off !== ilOffset(ms - 3600000) || off !== ilOffset(ms + 3600000)) opts.timeZoneName = "shortOffset";
    return new Date(ms).toLocaleString(loc(), opts);
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

  /* the ⓘ of a number: opens its explanation in place; every one shown also goes into the guide at the bottom */
  var guide = [];
  function help(key, title) {
    if (!key) return "";
    var g = guide.filter(function (x) { return x.key === key; })[0];
    if (!g) guide.push({ key: key, titles: [title] });
    else if (g.titles.indexOf(title) < 0) g.titles.push(title);
    return '<details class="help"><summary aria-label="' + esc(t("what_is") + " " + title) + '" title="' + esc(t("what_is")) +
      '">ⓘ</summary><div class="help-text">' + t(key) + "</div></details>";
  }

  function tile(label, value, sub, cls, helpKey) {
    var na = value == null || value === "–";
    return '<div class="tile ' + (cls || "") + '"><div class="label">' + esc(label) + help(helpKey, label) + '</div>' +
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
  function chartCard(container, title, sub, kind, labels, series, fmtLabel, helpKey) {
    var card = document.createElement("div");
    card.className = "card";
    card.innerHTML = '<div class="card-head"><h3>' + esc(title) + help(helpKey, title) + "</h3>" +
      '<span class="muted small">' + esc(sub || "") + ' <button class="link" type="button" aria-pressed="false" aria-label="' +
      esc(title + ": " + t("show_table")) + '">' + esc(t("show_table")) + '</button></span></div>' +
      '<div class="chart" aria-label="' + esc(title) + '"></div>';
    container.appendChild(card);
    var el = card.querySelector(".chart");
    var btn = card.querySelector("button");
    var spec = { el: el, kind: kind, labels: labels, series: series, fmtLabel: fmtLabel, table: false };
    btn.addEventListener("click", function () {
      spec.table = !spec.table;
      btn.textContent = t(spec.table ? "show_chart" : "show_table");
      btn.setAttribute("aria-pressed", spec.table ? "true" : "false");
      draw(spec);
    });
    charts.push(spec);
    draw(spec);
  }
  function draw(spec) {
    if (spec.labels == null) { spec.el.innerHTML = empty(esc(t("unavailable_q"))); return; }
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
  function ranked(title, items, sub, emptyKey, helpKey, names) {
    var html = '<div class="card"><div class="card-head"><h3>' + esc(title) + help(helpKey, title) + "</h3>" +
      (sub ? '<span class="muted small">' + esc(sub) + "</span>" : "") + "</div>";
    if (items === null) return html + empty(esc(t("unavailable_q"))) + "</div>";
    if (!items || !items.length) return html + empty(t("no_data")) + "</div>";
    var max = Math.max.apply(null, items.map(function (it) { return it.count; })) || 1;
    return html + '<ul class="bars">' + items.map(function (it) {
      var name = it.value === "" || it.value === "null" ? t(emptyKey || "unknown_value") : names ? names(it.value) : it.value;
      return '<li><span class="name" dir="auto" title="' + esc(name) + '">' + esc(name) + '</span><span class="n">' + fmt(it.count) +
        '</span><span class="track"><span class="fill" style="display:block;width:' + ((it.count / max) * 100).toFixed(1) + '%"></span></span></li>';
    }).join("") + "</ul>" + (items.length >= 50 ? '<p class="muted small">' + esc(t("top50")) + "</p>" : "") + "</div>";
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
    var h0 = new Date(snapAt); h0.setUTCMinutes(0, 0, 0);
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
    if (d.staleSince) {
      out.push('<div class="notice">' + esc(t("stale", { t: new Date(d.staleSince).toLocaleTimeString(loc(), { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) })) + "</div>");
    }
    if (d.posthog && d.posthog.errors && d.posthog.errors.length) {
      out.push('<div class="notice err"><b>PostHog:</b> ' + esc(t("some_failed")) + " " + esc(d.posthog.errors.join("; ")) + "</div>");
    }
    $("notices").innerHTML = out.join("");
  }

  /* every day from `first` to today (Israel time), a day with no row as 0 */
  function israelDay(ms) {
    var p = {};
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    return p.year + "-" + p.month + "-" + p.day;
  }
  var snapAt = Date.now();      // the snapshot's time (render() sets it): charts end there, not at the browser's now
  function daysFrom(first, rows) {
    var map = {};
    rows.forEach(function (r) { map[r.day] = r; });
    var out = [], d = first, end = israelDay(snapAt);
    while (d && d <= end && out.length < 400) {
      out.push(map[d] || { day: d });
      d = new Date(Date.parse(d + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
    }
    return out;
  }
  var WINDOWS = {
    tools: ["Tools", "כלים"], map: ["Map", "מפה"], market: ["Free Market", "שוק"], item: ["Item details", "פרטי פריט"],
    guides: ["Guides", "מדריכים"], news: ["News", "חדשות"], patch_notes: ["Game-data changes", "שינויים בנתוני המשחק"],
    settings: ["Settings", "הגדרות"], whats_new: ["What's new", "מה חדש"], history: ["History", "היסטוריה"],
    wishlist: ["Wishlist", "רשימת משאלות"],
  };
  function windowName(id) {
    var w = WINDOWS[String(id || "").split(":")[0]];
    return w ? w[lang === "he" ? 1 : 0] : id;
  }
  function dur(min) {
    if (min == null) return "–";
    return min >= 120 ? t("p_hours", { n: Math.round(min / 6) / 10 }) : t("p_minutes", { n: Math.round(min * 10) / 10 });
  }

  function renderNow(d) {
    var ph = d.posthog || {}, a = ph.app || {}, s = a.summary || {}, st = ph.site || {}, gh = d.github || {};
    var latest = (gh.releases || []).find(function (r) { return !r.prerelease; });
    var latestDl = latest ? latest.counts.windows + latest.counts.mac + latest.counts.portable : null;
    var on = ph.configured && a.summary;
    $("now-tiles").innerHTML = [
      tile(t("p_online"), on ? fmt(s.online) : null, t("p_online_sub"), "live", "h_online"),
      tile(t("p_today"), on ? fmt(s.today) : null, t("p_today_sub"), "", "h_today"),
      tile(t("p_week"), on ? fmt(s.week) : null, t("p_week_sub"), "", "h_week"),
      tile(t("p_ever"), on ? fmt(s.ever) : null, t("p_ever_sub"), "", "h_ever"),
      tile(t("visitors_online"), ph.configured && ph.siteKeySet && ph.site ? fmt(st.online) : null, t("visitors_online_sub"), "live", "h_site_online"),
      tile(t("latest_release"), latest ? latest.tag : null, latest ? t("latest_sub", { ago: ago(latest.published), n: fmt(latestDl) }) : "", "", "h_latest"),
    ].join("");
  }

  function renderDownloads(d) {
    var gh = d.github || {};
    var host = $("dl-chart-host");
    host.innerHTML = "";
    if (!gh.totals) { $("dl-tiles").innerHTML = ""; host.innerHTML = '<div class="card">' + empty(t("gh_unavailable")) + "</div>"; return; }
    var tt = gh.totals;
    $("dl-tiles").innerHTML = [
      tile(t("win_installer"), fmt(tt.windows), "MapleHelper-Setup.exe", "", "h_dl_win"),
      tile("macOS", fmt(tt.mac), "MapleHelper-macOS.dmg", "", "h_dl_mac"),
      tile(t("portable"), fmt(tt.portable), t("win_zip"), "", "h_dl_portable"),
      tile(t("update_checks"), fmt(tt.updateChecks), "SHA256SUMS.txt", "", "h_dl_checks"),
    ].join("");
    var rel = gh.releases.slice(0, 24).reverse();
    chartCard(host, lang === "he" ? "הורדות לפי גרסה" : "Downloads per release", lang === "he" ? rel.length + " הגרסאות האחרונות" : rel.length + " most recent releases", "column",
      rel.map(function (r) { return r.tag; }),
      [
        { name: "Windows", color: "--s1", values: rel.map(function (r) { return r.counts.windows; }) },
        { name: "macOS", color: "--s2", values: rel.map(function (r) { return r.counts.mac; }) },
        { name: t("portable"), color: "--s3", values: rel.map(function (r) { return r.counts.portable; }) },
      ], null, "h_dl_win");
    chartCard(host, lang === "he" ? "בדיקות עדכון, לפי גרסה" : "Update checks, per release", "SHA256SUMS.txt", "column",
      rel.map(function (r) { return r.tag; }),
      [{ name: t("update_checks"), color: "--s1", values: rel.map(function (r) { return r.counts.updateChecks; }) }], null, "h_dl_checks");
  }

  function renderApp(d) {
    var box = $("app-body"), ph = d.posthog || {};
    box.innerHTML = "";
    if (!ph.configured) { box.innerHTML = '<div class="card">' + empty(setupHint("posthog")) + "</div>"; return; }
    if (ph.error) { box.innerHTML = '<div class="card">' + empty(esc(t("unavailable_q"))) + "</div>"; return; }
    var a = ph.app || {}, s = a.summary || {}, r = a.retention || {}, L = a.lists || {};
    var failed = a.failed || [];
    var listOf = function (part, key) { return failed.indexOf(part) >= 0 ? null : L[key]; };
    box.insertAdjacentHTML("beforeend",
      (s.since ? '<p class="note">' + esc(t("p_since", { t: s.since })) + "</p>" : "") + note("p_note") +
      '<div class="tiles">' + [
        tile(t("p_month"), fmt(s.month), t("p_month_sub"), "", "h_month"),
        tile(t("p_new_installs"), fmt(s.newInstalls), t("p_new_installs_sub", { n: fmt(s.newInstallsToday) }), "", "h_new_installs"),
        tile(t("p_updates"), fmt(s.updates), t("p_updates_sub"), "", "h_updates"),
        tile(t("p_came_back"), pct(r.cameBack, r.before), t("p_came_back_sub", { a: fmt(r.cameBack), b: fmt(r.before) }), "", "h_came_back"),
        tile(t("p_active_week"), pct(r.activeWeek, r.week), t("p_active_week_sub", { a: fmt(r.activeWeek), b: fmt(r.week) }), "", "h_active_week"),
        tile(t("p_questions"), fmt(s.questions), t("p_questions_sub", { n: fmt(s.questionsToday), p: pct(s.questionsWithScreenshot, s.questions), r: fmt(s.retries) }), "", "h_questions"),
        tile(t("p_askers"), fmt(s.askers), t("p_askers_sub", { p: pct(s.askers, s.ever), q: s.askers ? Math.round((s.questions / s.askers) * 10) / 10 : "–" }), "", "h_askers"),
        tile(t("p_voice"), fmt(s.voice), t("p_all_time"), "", "h_voice"),
        tile(t("p_sessions"), fmt(s.sessions), t("p_sessions_sub", { m: s.sessions ? dur(s.sessionMinutes / s.sessions) : "–", h: dur(s.sessionMinutes) }), "", "h_sessions"),
        tile(t("p_windows_opened"), fmt(s.windowsOpened), t("p_all_time"), "", "h_windows_opened"),
        tile(t("p_crashes"), fmt(s.crashes), t("p_crashes_sub", { n: fmt(s.crashedInstalls) }), "", "h_crashes"),
        tile(t("p_kb"), fmt(s.kbUpdates), t("p_kb_sub", { n: fmt(s.kbFails) }), "", "h_kb"),
      ].join("") + "</div>");
    var grid = document.createElement("div");
    grid.className = "grid2";
    box.appendChild(grid);
    var daily = a.daily || [];
    var days = daysFrom(daily.length ? daily[0].day : null, daily);
    var labels = a.daily ? days.map(function (x) { return x.day; }) : null;
    var joinLabels = a.daily && days.every(function (x) { return x.firstSeen !== null; }) ? labels : null;
    chartCard(grid, t("p_per_day"), t("today_so_far"), "line", labels,
      [{ name: t("p_players_s"), color: "--s1", values: val(days, "players") }], dateShort, "h_per_day");
    /* first seen = new installs + installs that came over by updating: stacked as those two parts, never both whole */
    chartCard(grid, t("p_joins_day"), t("p_joins_sub"), "column", joinLabels,
      [{ name: t("p_new_installs_s"), color: "--s1", values: val(days, "newInstalls") },
       { name: t("p_updated_s"), color: "--s2", values: days.map(function (x) { return Math.max(0, (x.firstSeen || 0) - (x.newInstalls || 0)); }) }],
      dateShort, "h_joins_day");
    var hours = last48(a.hourly || []);
    chartCard(grid, t("p_online_hour"), t("p_hours48"), "line", a.hourly ? hours.map(function (x) { return x.hour; }) : null,
      [{ name: t("p_online_s"), color: "--s1", values: val(hours, "online") }], hourShort, "h_online_hour");
    chartCard(grid, t("p_questions_day"), t("today_so_far"), "column", labels,
      [{ name: t("p_questions"), color: "--s1", values: val(days, "questions") }], dateShort, "h_questions_day");
    box.insertAdjacentHTML("beforeend", '<div class="grid3">' +
      ranked(t("p_l_country"), listOf("per_install", "country"), t("p_per_install30"), null, "h_per_install") +
      ranked(t("p_l_version"), listOf("per_install", "version"), t("p_per_install30"), null, "h_version") +
      ranked(t("p_l_os"), listOf("per_install", "os"), t("p_per_install30"), null, "h_per_install") +
      ranked(t("p_l_level"), listOf("per_install", "char_level"), t("p_per_install30"), "none_value", "h_per_install") +
      ranked(t("p_l_class"), listOf("per_install", "char_class"), t("p_per_install30"), "none_value", "h_per_install") +
      ranked(t("p_l_job"), listOf("per_install", "char_job"), t("p_per_install30"), "none_value", "h_per_install") +
      ranked(t("p_l_provider"), listOf("per_install", "provider"), t("p_per_install30"), null, "h_per_install") +
      ranked(t("p_l_language"), listOf("per_install", "language"), t("p_per_install30"), null, "h_per_install") +
      ranked(t("p_l_answered"), listOf("per_event", "answered_by"), t("p_l_answered_sub"), null, "h_answered") +
      ranked(t("p_l_window"), listOf("per_event", "window"), t("p_times30"), null, "h_window_list", windowName) +
      ranked(t("p_l_updated_from"), listOf("per_event", "updated_from"), t("p_updated_from_sub"), null, "h_updated_from") +
      ranked(t("p_l_crash"), listOf("per_event", "crash"), t("p_l_crash_sub"), null, "h_crash_list") +
      ranked(t("p_l_kb_fail"), listOf("per_event", "kb_fail"), t("p_reason30"), null, "h_kb_fail") +
      "</div>");
  }

  function renderSite(d) {
    var box = $("site-body"), ph = d.posthog || {};
    box.innerHTML = "";
    if (!ph.configured) { box.innerHTML = '<div class="card">' + empty(setupHint("posthog")) + empty(setupHint("site")) + "</div>"; return; }
    if (!ph.siteKeySet) box.insertAdjacentHTML("beforeend", '<div class="notice">' + setupHint("site") + "</div>");
    var s = ph.site || {};
    box.insertAdjacentHTML("beforeend", note("site_note") + '<div class="tiles">' + [
      tile(t("visits_today"), fmt(s.visitorsToday), t("il_day"), "", "h_site_visits"),
      tile(t("page_views_today"), fmt(s.pageviewsToday), t("il_day"), "", "h_site_views"),
      tile(t("visits30"), fmt(s.visitors30d), t("days30"), "", "h_site_visits"),
      tile(t("page_views30"), fmt(s.pageviews30d), t("days30"), "", "h_site_views"),
      tile(t("dl_clicks_today"), fmt(s.downloadsToday), t("il_day"), "", "h_site_clicks"),
      tile(t("dl_clicks"), fmt(s.downloads30d), t("of_visits", { p: pct(s.downloaders30d, s.visitors30d) }), "", "h_site_clicks"),
    ].join("") + "</div>");
    var grid = document.createElement("div");
    grid.className = "grid2";
    box.appendChild(grid);
    var hours = last48(ph.siteHourly || []);
    chartCard(grid, t("visits_per_hour"), t("hours48"), "line", ph.siteHourly ? hours.map(function (r) { return r.hour; }) : null,
      [{ name: t("site_visits_s"), color: "--s1", values: val(hours, "visitors") }], hourShort, "h_site_visits");
    var sd = ph.siteDaily || [];
    var days = daysFrom(new Date(Date.parse(israelDay(snapAt) + "T12:00:00Z") - 29 * 86400000).toISOString().slice(0, 10), sd);
    chartCard(grid, t("visits_dl_day"), t("today_so_far"), "line", ph.siteDaily ? days.map(function (r) { return r.day; }) : null,
      [{ name: t("visits_s"), color: "--s1", values: val(days, "visitors") },
       { name: t("dl_clicks_s"), color: "--s2", values: val(days, "downloads") }], dateShort, "h_site_clicks");
    var b = ph.siteLists || { site_country: null, site_referrer: null, site_page: null, site_visitor_os: null, site_download_os: null };
    box.insertAdjacentHTML("beforeend", '<div class="grid3">' +
      ranked(t("site_countries"), b.site_country, t("site_countries_sub"), null, "h_site_lists") +
      ranked(t("referrers"), b.site_referrer, t("page_views_sub"), null, "h_site_lists") +
      ranked(t("pages"), b.site_page, t("page_views_sub"), null, "h_site_lists") +
      ranked(t("visitor_devices"), b.site_visitor_os, t("page_views_sub"), null, "h_site_lists") +
      ranked(t("dl_by_platform"), b.site_download_os, t("clicks30"), null, "h_site_clicks") +
      "</div>");
  }

  function renderGithub(d) {
    var gh = d.github || {};
    var box = $("gh-traffic");
    box.innerHTML = "";
    if (!gh.configured || gh.error) { $("gh-tiles").innerHTML = ""; return; }
    var rl = gh.rateLimit;
    $("gh-tiles").innerHTML = [
      tile(t("stars"), fmt(gh.stars), "", "", "h_gh"),
      tile(t("forks"), fmt(gh.forks)),
      tile(t("watchers"), fmt(gh.watchers)),
      tile(t("open_issues"), fmt(gh.openIssues)),
      tile(t("last_push"), ago(gh.pushedAt), gh.repo),
      tile(t("api_left"), rl ? fmt(rl.remaining) : null, rl ? t("api_left_sub", { n: fmt(rl.limit), t: rl.reset ? new Date(rl.reset * 1000).toLocaleTimeString(loc(), { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "–" }) + (gh.tokenUsed ? "" : t("no_token")) : ""),
    ].join("");
    var tr = gh.traffic;
    if (!tr) { box.innerHTML = '<div class="card">' + empty(setupHint("github")) + "</div>"; return; }
    var grid = document.createElement("div");
    grid.className = "grid2";
    box.appendChild(grid);
    var v = (tr.views && tr.views.daily) || [];
    chartCard(grid, t("repo_views"), t("views14"), "line",
      tr.views ? v.map(function (x) { return x.timestamp; }) : null,
      [{ name: t("repo_views"), color: "--s1", values: v.map(function (x) { return x.count; }) },
       { name: lang === "he" ? "מבקרים ייחודיים" : "Unique visitors", color: "--s2", values: v.map(function (x) { return x.uniques; }) }], dateShort);
    var c = (tr.clones && tr.clones.daily) || [];
    chartCard(grid, t("repo_clones"), "", "column",
      tr.clones ? c.map(function (x) { return x.timestamp; }) : null,
      [{ name: t("repo_clones"), color: "--s1", values: c.map(function (x) { return x.count; }) }], dateShort);
    box.insertAdjacentHTML("beforeend", '<div class="grid2">' +
      ranked(t("repo_referrers"), tr.referrers ? tr.referrers.map(function (r) { return { value: r.referrer, count: r.count }; }) : null, t("views14")) +
      ranked(t("repo_pages"), tr.paths ? tr.paths.map(function (p) { return { value: p.path, count: p.count }; }) : null, t("views14")) +
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
          pill(c.ok ? "ok" : "down") + ' <span class="muted small">' + esc(c.status || c.error || "") + '</span></td><td class="num">' + (typeof c.status === "number" ? fmt(c.ms) + " ms" : "–") + "</td></tr>";
      }).join("") + "</tbody></table></div>" : empty(t("unavailable"));

    var runs = (d.github && d.github.workflowRuns) || null;
    $("runs").innerHTML = d.github && d.github.configured && !d.github.error && runs === null ? empty(esc(t("unavailable_q"))) : runs && runs.length ? '<div class="tbl-wrap"><table><thead><tr><th>' + t("workflow") + "</th><th>" + t("result") +
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
    var clean = function (v) { return v && v !== "null" ? v : ""; };
    if (ph.error) { $("feed").innerHTML = empty(esc(t("unavailable_q"))); return; }
    var missing = (ph.app && ph.app.recent === null) || ph.siteRecent === null;
    var rows = ((ph.app && ph.app.recent) || []).concat(ph.siteRecent || []);
    rows.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    rows = rows.slice(0, 50);
    var part = missing ? empty(esc(t("feed_part"))) : "";
    if (!rows.length) { $("feed").innerHTML = part || empty(t("nothing24")); return; }
    $("feed").innerHTML = '<div class="tbl-wrap"><table><thead><tr><th>' + t("when") + "</th><th>" + t("event") + "</th><th>" + t("who") +
      "</th><th>" + t("details") + "</th></tr></thead><tbody>" +
      rows.map(function (r) {
        var det = [clean(r.version) && "v" + r.version, clean(r.os), clean(r.answeredBy) && t("answered", { x: r.answeredBy }),
          clean(r.window) && windowName(r.window), clean(r.error), clean(r.minutes) && t("p_minutes", { n: Math.round(Number(r.minutes) * 10) / 10 }),
          clean(r.job) && r.job + (clean(r.level) ? " · " + t("lv", { n: r.level }) : ""),
          clean(r.page), clean(r.target), clean(r.country)].filter(Boolean).join(" · ");
        var name = EVENTS[r.event] ? EVENTS[r.event][lang === "he" ? 1 : 0] : r.event;
        return "<tr><td>" + ago(r.at) + "</td><td>" + esc(name) + '</td><td><code>' + esc(r.who) + '</code></td><td><bdi>' + esc(det) + "</bdi></td></tr>";
      }).join("") + "</tbody></table></div>" + part;
  }

  function renderGuide() {
    var extra = [{ key: "h_monitoring", titles: [t("monitoring")] }, { key: "h_feed", titles: [t("recent")] }];
    $("guide").innerHTML = '<p class="note">' + esc(t("guide_intro")) + "</p>" + guide.concat(extra).map(function (g) {
      return '<div class="guide-item"><h3>' + esc(g.titles.join(" · ")) + '</h3><p class="note">' + t(g.key) + "</p></div>";
    }).join("");
  }

  function render(d) {
    hideTip();
    data = d;
    snapAt = d.generatedAt ? new Date(d.generatedAt).getTime() : Date.now();
    charts = [];
    guide = [];
    renderNotices(d);
    renderNow(d);
    renderDownloads(d);
    renderApp(d);
    renderSite(d);
    renderGithub(d);
    renderMonitoring(d);
    renderFeed(d);
    renderGuide();
    /* charts measured their width while their grid was still filling in: draw again at final size */
    charts.forEach(function (c) { if (!c.table) draw(c); });
    $("updated").textContent = t("updated", { t: new Date(d.generatedAt).toLocaleTimeString(loc(), { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) });
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

  var loadSeq = 0;
  function load(force) {
    var seq = ++loadSeq;
    var btn = $("refresh");
    btn.disabled = true;
    /* the first load reads PostHog fresh (~20 s): say so at once instead of an empty page */
    if ($("app").hidden && $("login").hidden) {
      $("app").hidden = false;
      $("notices").innerHTML = '<div class="notice loading">' + esc(t("loading")) + "</div>";
    }
    $("updated").textContent = t("loading_short");
    return api("/api/admin/stats" + (force ? "?fresh=1" : "")).then(function (r) {
      if (seq !== loadSeq) return;            // a newer load is on its way: this answer is older
      btn.disabled = false;
      if (r.status === 401) {
        return showLogin(r.body.configured === false ? setupMessage(r.body) : "");
      }
      if (r.status !== 200) { failed(t("refresh_failed", { s: r.status })); return; }
      $("login").hidden = true;
      $("app").hidden = false;
      render(r.body);
      schedule();
    }).catch(function () {
      btn.disabled = false;
      failed(t("offline"));
    });
  }

  /* the first load failed: no page behind it yet, so say it on the page itself */
  function failed(msg) {
    $("updated").textContent = data && data.generatedAt
      ? msg + " · " + t("data_from", { t: new Date(data.generatedAt).toLocaleTimeString(loc(), { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) })
      : msg;
    if ($("app").hidden && $("login").hidden) {
      $("app").hidden = false;
      $("notices").innerHTML = '<div class="notice err">' + esc(msg) + "</div>";
    }
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
      if (r.status === 200) { $("password").value = ""; $("login").hidden = true; return load(false); }
      showLogin({
        "wrong-password": t("wrong_password"),
        "too-many-attempts": t("too_many"),
      }[r.body.error] || (r.body.error === "not-configured" ? setupMessage(r.body) : t("signin_failed", { s: r.status })));
    }).catch(function () { b.disabled = false; showLogin(t("network_error")); });
  });

  $("refresh").addEventListener("click", function () { load(true); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && data && Date.now() - snapAt > REFRESH_MS && $("auto").checked) load(false);
  });
  $("auto").addEventListener("change", schedule);
  $("logout").addEventListener("click", function () {
    var done = function () {
      data = null;
      ["notices", "now-tiles", "dl-tiles", "dl-chart-host", "app-body", "site-body", "gh-tiles", "gh-traffic", "uptime", "runs", "deploys", "feed", "guide"]
        .forEach(function (id) { if ($(id)) $(id).innerHTML = ""; });
      showLogin("");
    };
    api("/api/admin/logout", { method: "POST" }).then(done, done);
  });
  document.querySelectorAll(".lang-btn").forEach(function (b) { b.addEventListener("click", switchLang); });

  applyLang();
  load(false);
})();
