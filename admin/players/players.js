/* Maple Helper admin: the clean players page (app 0.18.1 and later only). Talks only to /api/admin/*.
   Hebrew first, English on the switch; the choice is kept per browser. The charts and helpers are the same as
   admin.js's (copied, so each page stays one small script). */
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
    title: ["Maple Helper players (0.18.1+)", "שחקני Maple Helper (0.18.1+)"],
    managers_only: ["Site managers only.", "למנהלי האתר בלבד."],
    password: ["Password", "סיסמה"],
    sign_in: ["Sign in", "כניסה"],
    auto_refresh: ["Auto-refresh", "רענון אוטומטי"],
    refresh: ["Refresh", "רענון"],
    sign_out: ["Sign out", "יציאה"],
    full_dashboard: ["Full dashboard", "הדשבורד המלא"],
    lang_switch: ["עברית", "English"],
    page_title: ["Players", "שחקנים"],
    page_src: ["app 0.18.1 and later only · Israel time", "רק גרסה 0.18.1 ומעלה · שעון ישראל"],
    since: ["Data from {t} (the first 0.18.1 event).", "נתונים מ-{t} (האירוע הראשון של 0.18.1)."],
    how_counted: ["How these are counted", "איך זה נספר"],
    note: ["Only events of Maple Helper 0.18.1 and later. From that version every install sends its events under one lasting random id, the app pings every 10 minutes while it runs, and the stats can't be turned off. So a <b>player</b> here is one install (one computer and Windows/macOS user), counted once however often it restarts: one person with two computers counts twice. Every number is a direct count of distinct installs or of events, with no estimates. <b>Not included:</b> installs still on an older version (they join when they update), the developers' own source runs, and computers that never get online. A few events are lost when the app is closed within seconds of them. Days, weeks and months are in Israel time.",
      "רק אירועים של Maple Helper מגרסה 0.18.1 ומעלה. מהגרסה הזו כל התקנה שולחת את האירועים שלה תחת מזהה אקראי קבוע אחד, האפליקציה שולחת פינג כל 10 דקות כל עוד היא פתוחה, ואי אפשר לכבות את הסטטיסטיקות. לכן <b>שחקן</b> כאן הוא התקנה אחת (מחשב אחד ומשתמש Windows/macOS אחד), שנספרת פעם אחת לא משנה כמה פעמים הופעלה: אדם אחד עם שני מחשבים נספר פעמיים. כל מספר הוא ספירה ישירה של התקנות שונות או של אירועים, בלי הערכות. <b>לא כלולים:</b> התקנות שעדיין בגרסה ישנה יותר (הן נכנסות כשהן מתעדכנות), הרצות פיתוח של המפתחים, ומחשבים שלא מתחברים לאינטרנט. מעט אירועים הולכים לאיבוד כשהאפליקציה נסגרת שניות אחריהם. ימים, שבועות וחודשים לפי שעון ישראל."],
    // tiles
    online: ["Online now", "מחוברים עכשיו"],
    online_sub: ["installs that pinged in the last 11 minutes", "התקנות ששלחו פינג ב-11 הדקות האחרונות"],
    today: ["Today", "היום"],
    today_sub: ["installs active today", "התקנות שהיו פעילות היום"],
    week: ["Last 7 days", "7 הימים האחרונים"],
    week_sub: ["installs active, today and the 6 days before", "התקנות פעילות, היום ו-6 הימים שלפניו"],
    month: ["This month", "החודש"],
    month_sub: ["installs active since the 1st", "התקנות פעילות מתחילת החודש"],
    ever: ["All players", "כל השחקנים"],
    ever_sub: ["installs that ever ran 0.18.1+", "התקנות שאי פעם הריצו 0.18.1 ומעלה"],
    new_installs: ["New installs", "התקנות חדשות"],
    new_installs_sub: ["first start after installing · {n} today", "הפעלה ראשונה אחרי התקנה · {n} היום"],
    updates: ["Updates", "עדכונים"],
    updates_sub: ["first start on a newer version", "הפעלה ראשונה בגרסה חדשה יותר"],
    came_back: ["Came back", "חזרו"],
    came_back_sub: ["{a} of {b} installs first seen before today were active on another day too", "{a} מתוך {b} התקנות שנראו לראשונה לפני היום היו פעילות גם ביום נוסף"],
    active_week: ["Still active after a week", "עדיין פעילים אחרי שבוע"],
    active_week_sub: ["{a} of {b} installs first seen 7+ days ago were active in the last 7 days", "{a} מתוך {b} התקנות שנראו לראשונה לפני 7 ימים ויותר היו פעילות ב-7 הימים האחרונים"],
    questions: ["Questions", "שאלות"],
    questions_sub: ["{n} today · {p} with a screenshot", "{n} היום · {p} עם צילום מסך"],
    askers: ["Players who asked", "שחקנים ששאלו"],
    askers_sub: ["{p} of all players · {q} questions each on average", "{p} מכל השחקנים · {q} שאלות בממוצע לשואל"],
    voice: ["Voice questions", "שאלות בקול"],
    sessions: ["Sessions", "הפעלות"],
    sessions_sub: ["closed sessions · {m} on average · {h} in total", "הפעלות שנסגרו · {m} בממוצע · {h} בסך הכול"],
    minutes: ["{n} min", "{n} דק'"],
    hours: ["{n} h", "{n} שע'"],
    crashes: ["Crashes", "קריסות"],
    crashes_sub: ["{n} installs", "{n} התקנות"],
    kb: ["Game-data updates", "עדכוני נתוני משחק"],
    kb_sub: ["{n} failed", "{n} נכשלו"],
    windows_opened: ["Windows opened", "חלונות שנפתחו"],
    all_time: ["since 0.18.1", "מאז 0.18.1"],
    // charts
    per_day: ["Players per day", "שחקנים ביום"],
    players_s: ["Players", "שחקנים"],
    joins_day: ["Joining per day", "מצטרפים ביום"],
    joins_sub: ["first seen on 0.18.1+ that day", "נראו לראשונה ב-0.18.1+ באותו יום"],
    first_seen_s: ["First seen (new + updated)", "נראו לראשונה (חדשים + מעודכנים)"],
    new_installs_s: ["New installs", "התקנות חדשות"],
    online_hour: ["Online per hour", "מחוברים לפי שעה"],
    hours48: ["last 48 hours", "48 השעות האחרונות"],
    online_s: ["Installs online", "התקנות מחוברות"],
    questions_day: ["Questions per day", "שאלות ביום"],
    show_table: ["Show table", "הצגת טבלה"],
    show_chart: ["Show chart", "הצגת גרף"],
    total: ["Total", "סה\"כ"],
    no_data: ["No data yet.", "אין נתונים עדיין."],
    // lists
    per_install30: ["installs, latest value, last 30 days", "התקנות, הערך האחרון, 30 הימים האחרונים"],
    l_version: ["App version", "גרסת האפליקציה"],
    l_os: ["Operating system", "מערכת הפעלה"],
    l_country: ["Country", "מדינה"],
    l_level: ["Character level", "רמת הדמות"],
    l_class: ["Class", "מחלקה"],
    l_job: ["Job", "ג'וב"],
    l_provider: ["AI provider", "ספק ה-AI"],
    l_language: ["App language", "שפת האפליקציה"],
    l_answered: ["Who answered", "מי ענה"],
    l_answered_sub: ["questions, 30 days · instant = local, no AI", "שאלות, 30 יום · instant = מקומי, בלי AI"],
    l_window: ["Windows opened", "חלונות שנפתחו"],
    times30: ["times, 30 days", "פעמים, 30 יום"],
    l_crash: ["Crashes", "קריסות"],
    l_crash_sub: ["error @ file:line, 30 days", "שגיאה @ קובץ:שורה, 30 יום"],
    l_kb_fail: ["Game-data update failures", "כישלונות בעדכון נתוני המשחק"],
    reason30: ["reason, 30 days", "סיבה, 30 יום"],
    l_updated_from: ["Updated from", "עודכנו מגרסה"],
    updated_from_sub: ["updates, 30 days", "עדכונים, 30 יום"],
    none_value: ["(none)", "(אין)"],
    unknown_value: ["(unknown)", "(לא ידוע)"],
    // feed
    recent: ["Recent activity", "פעילות אחרונה"],
    last24: ["last 24 hours, pings left out", "24 השעות האחרונות, בלי פינגים"],
    when: ["When", "מתי"], event: ["Event", "אירוע"], who: ["Install", "התקנה"], details: ["Details", "פרטים"],
    nothing24: ["Nothing in the last 24 hours.", "לא היה כלום ב-24 השעות האחרונות."],
    answered: ["answered by {x}", "ענה {x}"], lv: ["level {n}", "רמה {n}"],
    // flow
    not_configured: ["PostHog isn't set up in Vercel (POSTHOG_PERSONAL_API_KEY, POSTHOG_PROJECT_ID).", "PostHog לא מוגדר ב-Vercel (POSTHOG_PERSONAL_API_KEY, POSTHOG_PROJECT_ID)."],
    some_failed: ["some queries failed:", "חלק מהשאילתות נכשלו:"],
    updated: ["Updated {t}", "עודכן ב-{t}"], refresh_failed: ["Refresh failed ({s})", "הרענון נכשל ({s})"],
    offline: ["Offline? Refresh failed.", "אין חיבור? הרענון נכשל."],
    wrong_password: ["Wrong password.", "סיסמה שגויה."],
    too_many: ["Too many attempts. Try again in 15 minutes.", "יותר מדי ניסיונות. נסו שוב בעוד 15 דקות."],
    signin_failed: ["Sign-in failed ({s}).", "הכניסה נכשלה ({s})."], network_error: ["Network error.", "שגיאת רשת."],
    signin_off: ["Sign-in is off: ADMIN_PASSWORD isn't set (12+ characters) for this deployment.", "הכניסה כבויה: ADMIN_PASSWORD לא מוגדר (12 תווים ומעלה) בפריסה הזו."],
    just_now: ["just now", "עכשיו"], min_ago: ["{n} min ago", "לפני {n} דק'"], h_ago: ["{n} h ago", "לפני {n} שע'"],
    d_ago: ["{n} d ago", "לפני {n} ימים"], d_ago1: ["1 d ago", "לפני יום"],
  };
  var EVENTS = {
    app_started: ["App started", "האפליקציה הופעלה"], app_updated: ["App updated", "האפליקציה עודכנה"],
    question_asked: ["Question asked", "נשאלה שאלה"], voice_used: ["Voice question", "שאלה בקול"],
    app_closed: ["App closed", "האפליקציה נסגרה"], window_opened: ["Window opened", "נפתח חלון"],
    app_crashed: ["Crash", "קריסה"], kb_updated: ["Game data updated", "נתוני המשחק עודכנו"],
    kb_update_failed: ["Game-data update failed", "עדכון נתוני המשחק נכשל"],
  };
  var lang = "he";
  try { lang = localStorage.getItem("mh-admin-lang") === "en" ? "en" : "he"; } catch (e) { /* private mode */ }
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


  /* ---------------------------------------------------------------- the page */

  /* every day from the first 0.18.1 day to today (Israel time), a day with no events as 0 */
  function israelDay(ms) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  }
  function allDays(rows) {
    if (!rows.length) return [];
    var map = {};
    rows.forEach(function (r) { map[r.day] = r; });
    var out = [], d = rows[0].day, end = israelDay(Date.now());
    while (d <= end && out.length < 400) {
      out.push(map[d] || { day: d });
      d = new Date(Date.parse(d + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
    }
    return out;
  }
  function dur(min) {
    if (min == null) return "–";
    return min >= 120 ? t("hours", { n: Math.round(min / 6) / 10 }) : t("minutes", { n: Math.round(min * 10) / 10 });
  }

  function render(d) {
    data = d;
    charts = [];
    var notices = [];
    if (d.errors && d.errors.length) notices.push('<div class="notice err"><b>PostHog:</b> ' + esc(t("some_failed")) + " " + esc(d.errors.join("; ")) + "</div>");
    $("notices").innerHTML = notices.join("");
    var s = d.summary || {}, r = d.retention || {}, L = d.lists || {};
    $("since").textContent = s.since ? t("since", { t: s.since }) : "";

    $("now-tiles").innerHTML = [
      tile(t("online"), fmt(s.online), t("online_sub"), "live"),
      tile(t("today"), fmt(s.today), t("today_sub")),
      tile(t("week"), fmt(s.week), t("week_sub")),
      tile(t("month"), fmt(s.month), t("month_sub")),
      tile(t("ever"), fmt(s.ever), t("ever_sub")),
    ].join("");

    $("tiles").innerHTML = [
      tile(t("new_installs"), fmt(s.newInstalls), t("new_installs_sub", { n: fmt(s.newInstallsToday) })),
      tile(t("updates"), fmt(s.updates), t("updates_sub")),
      tile(t("came_back"), pct(r.cameBack, r.before), t("came_back_sub", { a: fmt(r.cameBack), b: fmt(r.before) })),
      tile(t("active_week"), pct(r.activeWeek, r.week), t("active_week_sub", { a: fmt(r.activeWeek), b: fmt(r.week) })),
      tile(t("questions"), fmt(s.questions), t("questions_sub", { n: fmt(s.questionsToday), p: pct(s.questionsWithScreenshot, s.questions) })),
      tile(t("askers"), fmt(s.askers), t("askers_sub", { p: pct(s.askers, s.ever), q: s.askers ? Math.round((s.questions / s.askers) * 10) / 10 : "–" })),
      tile(t("voice"), fmt(s.voice), t("all_time")),
      tile(t("sessions"), fmt(s.sessions), t("sessions_sub", { m: s.sessions ? dur(s.sessionMinutes / s.sessions) : "–", h: dur(s.sessionMinutes) })),
      tile(t("windows_opened"), fmt(s.windowsOpened), t("all_time")),
      tile(t("crashes"), fmt(s.crashes), t("crashes_sub", { n: fmt(s.crashedInstalls) })),
      tile(t("kb"), fmt(s.kbUpdates), t("kb_sub", { n: fmt(s.kbFails) })),
    ].join("");

    var grid = $("charts");
    grid.innerHTML = "";
    var days = allDays(d.daily || []);
    var labels = days.map(function (x) { return x.day; });
    chartCard(grid, t("per_day"), "", "line", labels,
      [{ name: t("players_s"), color: "--s1", values: val(days, "players") }], dateShort);
    chartCard(grid, t("joins_day"), t("joins_sub"), "column", labels,
      [{ name: t("first_seen_s"), color: "--s1", values: val(days, "firstSeen") },
       { name: t("new_installs_s"), color: "--s2", values: val(days, "newInstalls") }], dateShort);
    var hours = last48(d.hourly || []);
    chartCard(grid, t("online_hour"), t("hours48"), "line", hours.map(function (x) { return x.hour; }),
      [{ name: t("online_s"), color: "--s1", values: val(hours, "online") }], hourShort);
    chartCard(grid, t("questions_day"), "", "column", labels,
      [{ name: t("questions"), color: "--s1", values: val(days, "questions") }], dateShort);

    $("lists").innerHTML =
      ranked(t("l_country"), L.country, t("per_install30")) +
      ranked(t("l_version"), L.version, t("per_install30")) +
      ranked(t("l_os"), L.os, t("per_install30")) +
      ranked(t("l_level"), L.char_level, t("per_install30"), "none_value") +
      ranked(t("l_class"), L.char_class, t("per_install30"), "none_value") +
      ranked(t("l_job"), L.char_job, t("per_install30"), "none_value") +
      ranked(t("l_provider"), L.provider, t("per_install30")) +
      ranked(t("l_language"), L.language, t("per_install30")) +
      ranked(t("l_answered"), L.answered_by, t("l_answered_sub")) +
      ranked(t("l_window"), L.window, t("times30")) +
      ranked(t("l_updated_from"), L.updated_from, t("updated_from_sub")) +
      ranked(t("l_crash"), L.crash, t("l_crash_sub")) +
      ranked(t("l_kb_fail"), L.kb_fail, t("reason30"));

    var rows = d.recent || [];
    var clean = function (v) { return v && v !== "null" ? v : ""; };
    $("feed").innerHTML = !rows.length ? empty(t("nothing24")) :
      '<div class="tbl-wrap"><table><thead><tr><th>' + t("when") + "</th><th>" + t("event") + "</th><th>" + t("who") +
      "</th><th>" + t("details") + "</th></tr></thead><tbody>" +
      rows.map(function (x) {
        var det = [clean(x.version) && "v" + x.version, clean(x.os), clean(x.answeredBy) && t("answered", { x: x.answeredBy }),
          clean(x.window), clean(x.error), clean(x.minutes) && t("minutes", { n: x.minutes }),
          clean(x.job) && x.job + (clean(x.level) ? " · " + t("lv", { n: x.level }) : ""), clean(x.country)].filter(Boolean).join(" · ");
        var name = EVENTS[x.event] ? EVENTS[x.event][lang === "he" ? 1 : 0] : x.event;
        return "<tr><td>" + ago(x.at) + "</td><td>" + esc(name) + "</td><td><code>" + esc(x.who) + "</code></td><td><bdi>" + esc(det) + "</bdi></td></tr>";
      }).join("") + "</tbody></table></div>";

    charts.forEach(function (c) { if (!c.table) draw(c); });
    $("updated").textContent = t("updated", { t: new Date(d.generatedAt).toLocaleTimeString(loc()) });
  }

  /* ---------------------------------------------------------------- flow */

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
    return api("/api/admin/players" + (force ? "?fresh=1" : "")).then(function (r) {
      btn.disabled = false;
      if (r.status === 401) return showLogin(r.body.configured === false ? t("signin_off") : "");
      if (r.status !== 200) { $("updated").textContent = t("refresh_failed", { s: r.status }); return; }
      $("login").hidden = true;
      $("app").hidden = false;
      if (r.body.configured === false) { $("notices").innerHTML = '<div class="notice err">' + esc(t("not_configured")) + "</div>"; return; }
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
      showLogin({ "wrong-password": t("wrong_password"), "too-many-attempts": t("too_many") }[r.body.error] ||
        (r.body.error === "not-configured" ? t("signin_off") : t("signin_failed", { s: r.status })));
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
