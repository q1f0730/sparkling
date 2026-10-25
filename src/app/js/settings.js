/* ---------------------------------------------------------------------------
   Settings (iOS Settings model: grouped inset lists, push sub-pages, swipe back)
   Styled with type direction B tokens (--b-*).
   --------------------------------------------------------------------------- */
const APP_VERSION = "0.4.0";
const SETTINGS_PAGES = ["notifications", "language", "appearance", "planning", "import", "about", "qloo"];
let settingsDepth = 0;

const stIcons = {
  chev: '<svg class="st-chev" viewBox="0 0 8 14" aria-hidden="true"><path d="M1.5 1.5L6.5 7l-5 5.5"/></svg>',
  check: '<svg class="st-check" viewBox="0 0 16 12" aria-hidden="true"><path d="M1.5 6.5l4.2 4L14.5 1.5"/></svg>',
};
function stIcon(bg, glyph){ return '<span class="st-ico" style="background:' + bg + '" aria-hidden="true">' + glyph + "</span>"; }
const STI = {
  bell: stIcon("var(--b-clay-ink)", '<svg viewBox="0 0 20 20"><path d="M10 3a4.5 4.5 0 0 0-4.5 4.5c0 4-1.5 5.5-1.5 5.5h12s-1.5-1.5-1.5-5.5A4.5 4.5 0 0 0 10 3zM8.3 15.5a1.8 1.8 0 0 0 3.4 0"/></svg>'),
  globe: stIcon("#5a73b5", '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6.5"/><path d="M3.5 10h13M10 3.5c2 2 2.8 4.2 2.8 6.5S12 14.5 10 16.5M10 3.5C8 5.5 7.2 7.7 7.2 10S8 14.5 10 16.5"/></svg>'),
  sun: stIcon("var(--b-butter-ink)", '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="3.2"/><path d="M10 2.8v1.8M10 15.4v1.8M2.8 10h1.8M15.4 10h1.8M4.9 4.9l1.3 1.3M13.8 13.8l1.3 1.3M4.9 15.1l1.3-1.3M13.8 6.2l1.3-1.3"/></svg>'),
  text: stIcon("#7b6f5c", '<svg viewBox="0 0 20 20"><path d="M4 15l3.5-9 3.5 9M5.3 12h4.4M12.5 15l2.2-5.6 2.3 5.6M13.3 13.2h2.8"/></svg>'),
  map: stIcon("var(--b-sage-ink)", '<svg viewBox="0 0 20 20"><path d="M10 17s-5-4.6-5-8.5a5 5 0 0 1 10 0C15 12.4 10 17 10 17z"/><circle cx="10" cy="8.5" r="1.8"/></svg>'),
  film: stIcon("#e8590c", '<svg viewBox="0 0 20 20"><rect x="3.5" y="4.5" width="13" height="11" rx="2"/><path d="M7 4.5v11M13 4.5v11M3.5 8h3.5M3.5 12h3.5M13 8h3.5M13 12h3.5"/></svg>'),
  down: stIcon("#5a73b5", '<svg viewBox="0 0 20 20"><path d="M10 3.5v9M6.5 9l3.5 3.5L13.5 9M4.5 16h11"/></svg>'),
  info: stIcon("#8a8170", '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6.5"/><path d="M10 9v4.5M10 6.6v.2"/></svg>'),
  spark: stIcon("var(--b-sage-ink)", '<svg viewBox="0 0 20 20"><path d="M10 3l1.6 5.4L17 10l-5.4 1.6L10 17l-1.6-5.4L3 10l5.4-1.6z"/></svg>'),
  code: stIcon("#2a2620", '<svg viewBox="0 0 20 20"><path d="M7.5 6L3.5 10l4 4M12.5 6l4 4-4 4"/></svg>'),
};

function stRow(o){
  const tag = o.nav ? "button" : (o.href ? "a" : "div");
  const attrs = (o.nav ? ' type="button" data-st-nav="' + attr(o.nav) + '"' : "") +
    (o.href ? ' href="' + attr(o.href) + '"' + (o.download ? " download" : "") + (o.external ? ' target="_blank" rel="noopener noreferrer"' : "") : "") +
    (o.action ? ' type="button" data-st-action="' + attr(o.action) + '"' : "") +
    (o.disabled ? ' aria-disabled="true"' : "");
  const realTag = o.action ? "button" : tag;
  return "<" + realTag + ' class="st-row' + (o.danger ? " danger" : "") + (o.center ? " center" : "") + (o.disabled ? " disabled" : "") + (o.sub ? " has-sub" : "") + '"' + attrs + ">" +
    (o.icon || "") +
    '<span class="st-row-main"><span class="st-label">' + esc(o.label) + "</span>" + (o.sub ? '<span class="st-sub">' + esc(o.sub) + "</span>" : "") + "</span>" +
    (o.value != null ? '<span class="st-value"' + (o.valueNoTr ? ' translate="no"' : "") + ">" + esc(o.value) + "</span>" : "") +
    (o.control || "") +
    (o.nav || (o.href && o.chev !== false) ? stIcons.chev : "") +
    (o.checked ? stIcons.check : "") +
  "</" + realTag + ">";
}
function stToggle(key, on, disabled){
  return '<label class="st-switch' + (disabled ? " disabled" : "") + '"><input type="checkbox" role="switch" data-st-toggle="' + attr(key) + '"' + (on ? " checked" : "") + (disabled ? " disabled" : "") + '><span class="st-knob" aria-hidden="true"></span></label>';
}
function stTime(key, value, disabled){
  return '<input class="st-time" type="time" data-st-time="' + attr(key) + '" value="' + attr(value) + '"' + (disabled ? " disabled" : "") + ">";
}
function stGroup(header, rows, footer){
  return '<section class="st-group">' +
    (header ? '<h2 class="st-group-h">' + esc(header) + "</h2>" : "") +
    '<div class="st-list">' + rows.join("") + "</div>" +
    (footer ? '<p class="st-group-f">' + footer + "</p>" : "") +
  "</section>";
}

function settingsTitle(page){
  return { "": "Settings", notifications: "Notifications", language: "Language", appearance: "Appearance", planning: "Planning defaults", import: "Import", about: "About", qloo: "How Sparkling uses Qloo" }[page || ""];
}

function renderSettings(page){
  beginView();
  page = SETTINGS_PAGES.includes(page) ? page : "";
  const parent = page === "qloo" ? "#/settings/about" : (page ? "#/settings" : (state.lastMain || "#/notes"));
  setShell({ title: t(settingsTitle(page)), back: parent, tabs: false });
  const newDepth = page ? (page === "qloo" ? 2 : 1) : 0;
  const dir = newDepth > settingsDepth ? "push" : (newDepth < settingsDepth ? "pop" : "");
  settingsDepth = newDepth;
  view.style.transform = "";
  view.className = "view no-tabs st-view" + (dir ? " st-" + dir : "");

  const u = state.user || {};
  let html = "";
  if (!page) html = settingsRootHTML(u);
  else if (page === "notifications") html = notificationsHTML();
  else if (page === "language") html = languageHTML();
  else if (page === "appearance") html = appearanceHTML();
  else if (page === "planning") html = planningHTML(u);
  else if (page === "import") html = '<div class="st-pad">' + importBlockHTML(t("Start from your Letterboxd export. Titles with dates become footprints; anything less certain waits in the inbox.")) + "</div>";
  else if (page === "about") html = aboutHTML();
  else if (page === "qloo") html = qlooHTML();
  view.innerHTML = '<div class="st">' + html + "</div>";
  translateNode(view);

  if (page === "qloo") wireQlooLive(view);
  if (page === "import") wireImport(view.querySelector("[data-import-block]"), {});
  if (page === "planning") wirePlanning(view);

  on(view, "click", function(e){
    const nav = e.target.closest("[data-st-nav]");
    if (nav) { go(nav.getAttribute("data-st-nav")); return; }
    const act = e.target.closest("[data-st-action]");
    if (act) { settingsAction(act.getAttribute("data-st-action"), act); return; }
    const pick = e.target.closest("[data-st-pick]");
    if (pick) { settingsPick(pick.getAttribute("data-st-pick"), pick.getAttribute("data-value"), page); return; }
  });
  on(view, "change", function(e){
    const tg = e.target.closest("[data-st-toggle]");
    if (tg) { settingsToggle(tg.getAttribute("data-st-toggle"), tg.checked, tg); return; }
    const tm = e.target.closest("[data-st-time]");
    if (tm) { prefs.notif[tm.getAttribute("data-st-time")] = tm.value || prefs.notif[tm.getAttribute("data-st-time")]; savePrefs(); }
  });
  if (page) wireSwipeBack(parent);
}

function settingsRootHTML(u){
  const langName = LANG === "zh" ? "简体中文" : "English";
  const appName = t({ system: "System", light: "Light", paper: "Paper" }[prefs.appearance]);
  const sizeName = t(["Small", "Default", "Large"][prefs.textSize]);
  const n = prefs.notif;
  const notifOn = n.master && notifPermission() === "granted";
  const notifValue = LANG === "zh" ? (notifOn ? "已开启" : "已关闭") : (notifOn ? "On" : "Off");
  const defaults = [u.area, u.when, u.budget ? "under $" + u.budget : ""].filter(Boolean);
  return '<header class="r7-mast r7-st-mast">' +
      '<p class="r7-eyebrow"><span>' + esc(t("Settings")) + '</span><span class="r7-sep" aria-hidden="true"></span><span>v' + esc(APP_VERSION) + '</span></p>' +
      '<div class="st-profile r7-st-profile">' +
        '<span class="st-avatar" aria-hidden="true">Q</span>' +
        '<span class="st-profile-main"><span class="st-profile-name" translate="no">Q1f730</span><span class="st-sub">' + esc(t(u.sample ? "Sample notebook" : "Demo profile")) + "</span></span>" +
      "</div>" +
      (defaults.length ? '<button type="button" class="r7-st-defaults" data-st-nav="#/settings/planning"><span class="r7-kicker">' + esc(t("Planning defaults")) + '</span><span class="r7-st-def">' + defaults.map(function(x){ return '<span>' + esc(t(x)) + '</span>'; }).join("") + '</span></button>' : "") +
    "</header>" +
    stGroup("", [
      stRow({ icon: STI.bell, label: t("Notifications"), value: notifValue, valueNoTr: true, nav: "#/settings/notifications" }),
      stRow({ icon: STI.globe, label: t("Language"), value: langName, valueNoTr: true, nav: "#/settings/language" }),
      stRow({ icon: STI.sun, label: t("Appearance"), value: appName + " · " + sizeName, nav: "#/settings/appearance" }),
      stRow({ icon: STI.map, label: t("Edit planning defaults"), nav: "#/settings/planning" }),
    ]) +
    stGroup(t("Data"), [
      stRow({ icon: STI.film, label: t("Import from Letterboxd"), nav: "#/settings/import" }),
      stRow({ icon: STI.down, label: t("Export notes"), action: "export" }),
      u.sample ? stRow({ label: t("Leave the sample"), danger: true, center: true, action: "leave-sample" }) : "",
      u.sample ? stRow({ label: t("Start the sample over"), center: true, action: "restart-sample" }) : "",
      stRow({ label: t("Delete all data"), danger: true, center: true, action: "delete-all" }),
    ].filter(Boolean), esc(t("Exports include every note and card. Deleting removes your notebook from the server."))) +
    stGroup(t("About"), [
      stRow({ icon: STI.info, label: t("About"), value: "v" + APP_VERSION, valueNoTr: true, nav: "#/settings/about" }),
      stRow({ icon: STI.spark, label: t("How Sparkling uses Qloo"), nav: "#/settings/qloo" }),
    ]) +
    stGroup("", [stRow({ label: t("Sign out"), danger: true, center: true, action: "sign-out" })]);
}

function notifPermission(){ return ("Notification" in window) ? Notification.permission : "unsupported"; }
function notificationsHTML(){
  const n = prefs.notif;
  const perm = notifPermission();
  const masterOn = n.master && perm === "granted";
  const off = !masterOn;
  let blocked = "";
  if (perm === "denied") blocked = stGroup("", ['<div class="st-row st-explain"><span class="st-row-main"><span class="st-label">' + esc(t("Notifications are off for this site")) + '</span><span class="st-sub">' + esc(t("Your browser blocked notifications for Sparkling. To turn them on, open your browser's site settings for this page and allow Notifications, then come back.")) + "</span></span></div>"]);
  else if (perm === "unsupported") blocked = stGroup("", ['<div class="st-row st-explain"><span class="st-row-main"><span class="st-label">' + esc(t("This browser cannot show notifications")) + '</span><span class="st-sub">' + esc(t("On iPhone, add Sparkling to your Home Screen first, then open it from there.")) + "</span></span></div>"]);
  return blocked +
    stGroup("", [stRow({ label: t("Allow Notifications"), control: stToggle("master", masterOn, perm === "denied" || perm === "unsupported") })],
      esc(t("Sparkling never sends recommendation pushes. You only hear from it about things you started."))) +
    '<div class="st-dim' + (off ? " is-off" : "") + '">' +
    stGroup("", [
      stRow({ label: t("Your letter is ready"), sub: t("Once a month, when your taste letter is written."), control: stToggle("letter", n.letter, off) }),
      stRow({ label: t("Plan reminder"), sub: t("The day before a saved outing."), control: stToggle("plan", n.plan, off) }),
      (n.plan ? stRow({ label: t("Remind at"), control: stTime("planTime", n.planTime, off) }) : ""),
      stRow({ label: t("Inbox needs you"), sub: t("A weekly digest of items Sparkling was unsure about."), control: stToggle("inbox", n.inbox, off) }),
      stRow({ label: t("Import finished"), sub: t("When a Letterboxd import is done reading."), control: stToggle("imported", n.imported, off) }),
    ].filter(Boolean)) +
    stGroup("", [
      stRow({ label: t("Quiet hours"), control: stToggle("quiet", n.quiet, off) }),
      (n.quiet ? stRow({ label: t("From"), control: stTime("quietFrom", n.quietFrom, off) }) : ""),
      (n.quiet ? stRow({ label: t("To"), control: stTime("quietTo", n.quietTo, off) }) : ""),
    ].filter(Boolean), esc(t("Notifications wait until quiet hours end."))) +
    "</div>";
}
function languageHTML(){
  return stGroup("", [
    '<button class="st-row" type="button" data-st-pick="lang" data-value="en"><span class="st-row-main" translate="no"><span class="st-label">English</span><span class="st-sub">English</span></span>' + (LANG === "en" ? stIcons.check : "") + "</button>",
    '<button class="st-row" type="button" data-st-pick="lang" data-value="zh"><span class="st-row-main" translate="no"><span class="st-label">简体中文</span><span class="st-sub">Simplified Chinese</span></span>' + (LANG === "zh" ? stIcons.check : "") + "</button>",
  ], esc(t("Qloo names, tags and your own notes are never translated.")));
}
function appearanceHTML(){
  const opt = function(v, label){ return '<button class="st-row" type="button" data-st-pick="appearance" data-value="' + v + '"><span class="st-row-main"><span class="st-label">' + esc(t(label)) + "</span></span>" + (prefs.appearance === v ? stIcons.check : "") + "</button>"; };
  const sizes = ["Small", "Default", "Large"].map(function(l, i){
    return '<button class="st-seg' + (prefs.textSize === i ? " on" : "") + '" type="button" data-st-pick="textSize" data-value="' + i + '" aria-pressed="' + (prefs.textSize === i) + '"><span style="font-size:' + [13, 16, 19][i] + 'px">Aa</span><span class="st-seg-l">' + esc(t(l)) + "</span></button>";
  }).join("");
  return stGroup(t("Appearance"), [opt("system", "System"), opt("light", "Light"), opt("paper", "Paper")],
      esc(t("System follows your device: Paper by day, dark at night if your device is set to dark."))) +
    stGroup(t("Text size"), ['<div class="st-segs" role="group">' + sizes + "</div>"], esc(t("Applies to notes, cards and sheets.")));
}
function planningHTML(u){
  return '<form data-prefs novalidate>' +
    stGroup(t("Planning"), [
      '<label class="st-row st-field"><span class="st-label">' + esc(t("Planning area")) + '</span><input data-pref-area value="' + attr(u.area || "") + '" placeholder="' + attr(t("Neighbourhood")) + '" autocomplete="off"></label>',
      '<label class="st-row st-field"><span class="st-label">' + esc(t("Default budget")) + '</span><input data-pref-budget inputmode="numeric" value="' + attr(u.budget == null ? "" : u.budget) + '" placeholder="40" autocomplete="off"></label>',
      '<label class="st-row st-field"><span class="st-label">' + esc(t("Default time")) + '</span><input data-pref-when value="' + attr(u.when || "") + '" placeholder="' + attr(t("Saturday afternoon")) + '" autocomplete="off"></label>',
    ], esc(t("Prefills the plan form."))) +
    '<div class="st-pad"><button class="st-btn" type="submit">' + esc(t("Save changes")) + '</button><p class="feedback" data-pref-feedback role="status"></p></div>' +
  "</form>";
}
function wirePlanning(root){
  const form = root.querySelector("[data-prefs]");
  if (!form) return;
  form.addEventListener("submit", async function(e){
    e.preventDefault();
    const v = function(sel){ const el = root.querySelector(sel); return el ? el.value.trim() : ""; };
    const fb = root.querySelector("[data-pref-feedback]");
    const body = {};
    if (v("[data-pref-area]")) body.area = v("[data-pref-area]");
    if (v("[data-pref-when]")) body.when = v("[data-pref-when]");
    if (v("[data-pref-budget]")) {
      const n = numberValue(v("[data-pref-budget]"));
      if (n === null || n < 1) { fb.textContent = t("Budget needs a number above zero."); fb.className = "feedback bad"; return; }
      body.budget = n;
    }
    try {
      const data = await api("/api/me", { method: "PATCH", body: body });
      if (data && data.user) state.user = data.user;
      fb.textContent = t("Saved."); fb.className = "feedback ok";
    } catch (err) { fb.textContent = t("That did not save. Try again."); fb.className = "feedback bad"; }
  });
}
function aboutHTML(){
  return '<div class="st-hero"><span class="st-hero-mark" aria-hidden="true">✦</span><h2 class="st-hero-name">Sparkling</h2><p class="st-sub">' + esc(t("Open-source hackathon build for the Qloo Taste AI challenge.")) + "</p></div>" +
    stGroup("", [
      stRow({ label: t("Version"), value: APP_VERSION, valueNoTr: true }),
      stRow({ label: t("License"), value: "MIT © Q1f730", valueNoTr: true, href: "https://github.com/q1f0730/sparkling/blob/main/LICENSE", external: true }),
      stRow({ label: t("Source code"), value: "GitHub", valueNoTr: true, href: "https://github.com/q1f0730/sparkling", external: true }),
    ]) +
    stGroup("", [stRow({ icon: STI.spark, label: t("How Sparkling uses Qloo"), nav: "#/settings/qloo" })]);
}
function qlooHTML(){
  const para = function(s){ return '<div class="st-row st-explain"><span class="st-row-main"><span class="st-sub st-body">' + esc(t(s)) + "</span></span></div>"; };
  return '<div data-qloo-live class="st-live-slot"></div>' + stGroup(t("What goes to Qloo"), [
      para("The few words that name a film, book, album or place, so Qloo search can match them to a catalogue entity."),
      para("When you plan: the IDs of a few cards and the area you typed."),
    ]) +
    stGroup(t("What never goes to Qloo"), [para("Your notes, your photos, your name and your location history.")]) +
    stGroup(t("What comes back"), [
      para("Catalogue entities with their tags, Insights for Threads (tags shared across your cards) and venues near your area for Plan. Sparkling shows Qloo data as it is and marks its own read."),
    ], esc(t("Every thread and plan has a receipt with the exact Qloo calls behind it.")));
}
function qlooLiveHTML(cards, plans){
  const list = Array.isArray(cards) ? cards : [];
  const total = list.length;
  const matched = list.filter(function(c){ return c && c.qloo_id; }).length;
  const line = LANG === "zh"
    ? "这本笔记里：" + total + " 张卡片中有 " + matched + " 张对上了 Qloo 目录条目。"
    : t("In this notebook: " + matched + " of " + total + " cards are matched to a Qloo catalogue entry.");
  const latest = Array.isArray(plans) ? plans[0] : null;
  const link = latest && latest.id
    ? '<a class="st-live-link" href="#/plan/' + esc(latest.id) + '">' + esc(t("See the Qloo calls behind your latest plan")) + "</a>"
    : "";
  return '<div class="st-live"><p class="st-live-line">' + esc(line) + "</p>" + link + "</div>";
}
function wireQlooLive(root){
  const slot = root.querySelector("[data-qloo-live]");
  if (!slot) return;
  Promise.all([
    api("/api/cards").catch(function(){ return null; }),
    api("/api/plans").catch(function(){ return null; }),
  ]).then(function(res){
    const cards = res[0] && Array.isArray(res[0].cards) ? res[0].cards : null;
    if (!cards) return;
    const plans = res[1] && Array.isArray(res[1].plans) ? res[1].plans : [];
    slot.innerHTML = qlooLiveHTML(cards, plans);
    translateNode(slot);
  }).catch(function(){});
}

function settingsPick(kind, value, page){
  if (kind === "lang") { setLang(value); return; }
  if (kind === "appearance") { prefs.appearance = value; applyAppearance(); savePrefs(); renderSettings(page); return; }
  if (kind === "textSize") { prefs.textSize = Number(value); applyAppearance(); savePrefs(); renderSettings(page); return; }
}
async function settingsToggle(key, on, input){
  if (key === "master") {
    if (on) {
      let perm = notifPermission();
      if (perm === "default") {
        try { perm = await Notification.requestPermission(); } catch (_) { perm = notifPermission(); }
      }
      prefs.notif.master = perm === "granted";
      if (perm === "granted") {
        try { new Notification(t("Notifications are on"), { body: t("Sparkling will only tell you about things you started.") }); } catch (_) {}
      }
    } else prefs.notif.master = false;
    savePrefs();
    renderSettings("notifications");
    return;
  }
  prefs.notif[key] = !!on;
  savePrefs();
  if (key === "plan" || key === "quiet") renderSettings("notifications");
}
function settingsAction(action){
  if (action === "export") {
    openSheet({ title: t("Export notes"), body:
      '<div class="st-sheet-list">' +
        '<a class="st-sheet-btn" href="/api/export" download="sparkling-export.json">' + esc(t("Export as JSON")) + "</a>" +
        '<a class="st-sheet-btn" href="/api/export.md" download="sparkling-notes.md">' + esc(t("Export as Markdown")) + "</a>" +
      "</div>",
      onMount: function(root){ root.querySelectorAll("a").forEach(function(a){ a.addEventListener("click", function(){ setTimeout(closeModal, 300); }); }); },
    });
    return;
  }
  if (action === "delete-all" || action === "leave-sample") {
    const sample = action === "leave-sample";
    confirmSheet({
      title: t(sample ? "Leave the sample?" : "Delete all data?"),
      copy: t(sample ? "The made-up notebook will be removed from this device. You can start your own whenever you like." : "Every note, photo, card and plan will be deleted from Sparkling. This cannot be undone."),
      danger: true,
      confirmLabel: t(sample ? "Leave the sample" : "Delete All Data"),
      slide: sample ? null : t("Slide to delete everything"),
      cancelLabel: t("Cancel"),
      busyLabel: t(sample ? "Leaving" : "Deleting"),
      onConfirm: async function(){
        await api("/api/delete", { method: "POST", body: { confirm: "DELETE" } });
        clearPlanStorage(); clearDidYouGo(); clearDraft();
        state.user = null; state.inboxCount = 0;
        history.replaceState(null, "", "#/onboarding");
        renderOnboarding();
      },
    });
    return;
  }
  if (action === "restart-sample") {
    confirmSheet({
      title: t("Start the sample over?"),
      copy: t("The sample notebook goes back to how it started. Your own notes are not touched."),
      confirmLabel: t("Start over"),
      cancelLabel: t("Cancel"),
      busyLabel: t("Working"),
      onConfirm: async function(){
        await api("/api/delete", { method: "POST", body: { confirm: "DELETE" } });
        await api("/api/session", { method: "POST", body: { mode: "sample" } });
        clearPlanStorage(); clearDidYouGo(); clearDraft();
        location.hash = "#/notes";
        location.reload();
      },
    });
    return;
  }
  if (action === "sign-out") {
    confirmSheet({
      title: t("Sign out?"),
      copy: t("You can open this notebook again from this browser while the session lasts."),
      confirmLabel: t("Sign out"), cancelLabel: t("Cancel"), danger: true, busyLabel: t("Working"),
      onConfirm: async function(){
        await api("/api/signout", { method: "POST", body: {} });
        state.user = null; state.inboxCount = 0;
        history.replaceState(null, "", "#/onboarding");
        renderOnboarding();
      },
    });
  }
}

/* iOS-like edge swipe back for settings sub-pages */
function wireSwipeBack(parent){
  let sx = null, sy = 0, dx = 0;
  on(view, "touchstart", function(e){
    const tch = e.touches[0];
    if (tch.clientX - frame.getBoundingClientRect().left > 28) { sx = null; return; }
    sx = tch.clientX; sy = tch.clientY; dx = 0;
  }, { passive: true });
  on(view, "touchmove", function(e){
    if (sx === null) return;
    const tch = e.touches[0];
    dx = tch.clientX - sx;
    if (Math.abs(tch.clientY - sy) > Math.abs(dx)) { sx = null; view.style.transform = ""; return; }
    if (dx > 0) view.style.transform = "translateX(" + Math.min(dx, 300) + "px)";
  }, { passive: true });
  on(view, "touchend", function(){
    if (sx === null) return;
    view.style.transform = "";
    if (dx > 90) go(parent);
    sx = null;
  });
}


Object.assign(ZH, {
  "Edit planning defaults": "修改规划默认值",
  "See the Qloo calls behind your latest plan": "查看最近一次计划背后的 Qloo 调用",
  "Start the sample over": "重新开始示例",
  "Start the sample over?": "重新开始示例？",
  "The sample notebook goes back to how it started. Your own notes are not touched.": "示例笔记本会回到最初的样子。你自己的笔记不受影响。",
  "Start over": "重新开始",
});

if (LANG === "zh") setLang("zh", true);
boot();

