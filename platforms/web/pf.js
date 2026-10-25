/* Sparkling platform layer (served as /pf.js). Desktop shell (sidebar + inspector, >=1024px), install prompt,
   offline state, service worker registration, Chromium-only lens filter for the glass tab pill.
   Platform detection runs inline in <head> (see head.html) so CSS applies before first paint.
   Desktop shell: everything is additive. Mobile never builds the inspector and the sidebar is display:none below 1024px. */
(function () {
  "use strict";
  var d = document.documentElement;
  var zh = function () { return /^zh/i.test(d.lang || ""); };
  var T = function (en, cn) { return zh() ? cn : en; };
  var STAR = '<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M512 150 Q540 484 874 512 Q540 540 512 874 Q484 540 150 512 Q484 484 512 150Z" fill="#3e5a2e"/><g transform="translate(742 282) scale(.26) translate(-512 -512)"><path d="M512 150 Q540 484 874 512 Q540 540 512 874 Q484 540 150 512 Q484 484 512 150Z" fill="#c99a3a"/></g></svg>';
  var DL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 19.5h14"/></svg>';
  var IC = {
    notes: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14M5 10.5h14M5 15.5h9M5 20h6"/></svg>',
    cards: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6.5" height="16" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="9" rx="1.5"/></svg>',
    threads: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 8c4.5 0 4.5 8 8.5 8s4-8 8.5-8"/><path d="M3.5 16c4.5 0 4.5-8 8.5-8s4 8 8.5 8"/></svg>',
    letter: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4.5 7.5 7.5 5.5 7.5-5.5"/></svg>',
    plan: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="14" rx="2.5"/><path d="M4 10.5h16M8.5 3.5v5M15.5 3.5v5"/></svg>',
    inbox: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.5h15v13h-15z"/><path d="M4.5 12.5h4l1.6 2h3.8l1.6-2h4"/></svg>',
    settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="2.8"/><path d="M12 3.8v2.4M12 17.8v2.4M3.8 12h2.4M17.8 12h2.4M6.2 6.2l1.7 1.7M16.1 16.1l1.7 1.7M6.2 17.8l1.7-1.7M16.1 7.9l1.7-1.7"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.1-4.4-7.1-9.3A4.1 4.1 0 0 1 12 7.2a4.1 4.1 0 0 1 7.1 3.5C19.1 15.6 12 20 12 20z"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/></svg>'
  };

  // ---- service worker (offline shell)
  if ("serviceWorker" in navigator && window.isSecureContext && !/[?&]nosw=1/.test(location.search)) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(function () {}); });
  }

  // ---- offline state
  function net() { d.classList.toggle("pf-offline", navigator.onLine === false); }
  window.addEventListener("online", net); window.addEventListener("offline", net);

  // ---- install prompt (Android / desktop Chrome); Safari gets a hint instead
  var deferred = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; sync(); });
  window.addEventListener("appinstalled", function () { deferred = null; d.classList.add("pf-standalone"); sync(); });

  var MQ = window.matchMedia ? matchMedia("(min-width:1024px)") : { matches: false, addEventListener: function () {} };
  var rail, nav, btn, hint, chip, insp, crumb;

  /* ---------- helpers that lean on the app's own globals when they exist ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function tr(s) { try { return typeof window.t === "function" ? window.t(s) : s; } catch (_) { return s; } }
  function img(u) { try { return typeof imgSrc === "function" ? imgSrc(u) : (u || ""); } catch (_) { return ""; } }
  function ctxOf(c) { try { return typeof cardContext === "function" ? cardContext(c) : (c.type || ""); } catch (_) { return ""; } }
  function tcls(type) { try { return typeof typeClass === "function" ? typeClass(type) : ""; } catch (_) { return ""; } }
  function tlabel(type) { try { return typeof typeLabel === "function" ? typeLabel(type) : type; } catch (_) { return type; } }
  function fdate(ms) { try { return typeof formatDate === "function" ? formatDate(ms) : new Date(ms).toLocaleDateString(); } catch (_) { return ""; } }
  function seen(ms) { try { return typeof lastSeen === "function" ? lastSeen(ms) : ""; } catch (_) { return ""; } }
  function getJSON(path, opts) {
    var o = opts || {};
    return fetch(path, { method: o.method || "GET", credentials: "same-origin", headers: o.body ? { "content-type": "application/json" } : {}, body: o.body ? JSON.stringify(o.body) : undefined })
      .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); });
  }
  function appState() { try { return typeof state !== "undefined" ? state : null; } catch (_) { return null; } }
  function routeName() {
    var h = (location.hash || "#/notes").replace(/^#\/?/, "").split("/");
    var a = h[0] || "notes";
    if (a === "cards") return h[1] ? "card" : "cards";
    if (a === "plan") return h[1] ? "planResult" : "plan";
    return a;
  }
  function go(h) { if (location.hash === h) { try { window.route && window.route(); } catch (_) {} } else location.hash = h; }

  /* ---------- sidebar ---------- */
  function build() {
    var bar = document.createElement("div"); bar.className = "pf-offline-bar"; bar.setAttribute("role", "status");
    bar.textContent = T("Offline. Your notes are safe; changes wait for a connection.", "离线中。笔记已保存，联网后继续同步。");
    document.body.appendChild(bar);

    rail = document.createElement("aside"); rail.className = "pf-rail"; rail.setAttribute("aria-label", "Sparkling");
    rail.innerHTML = '<div class="pf-word">' + STAR + '<span>Sparkling</span></div>' +
      '<button class="pf-new" type="button" data-pf-go="new">' + IC.plus + '<span></span></button>' +
      '<nav class="pf-nav" aria-label="Sections"></nav>' +
      '<div class="pf-foot"><button class="pf-install" type="button" hidden>' + DL + '<span></span></button>' +
      '<p class="pf-hint" hidden></p><button class="pf-settings" type="button" data-pf-go="settings">' + IC.settings + '<span></span></button>' +
      '<div class="pf-me"><span class="pf-av" aria-hidden="true">S</span><span class="pf-me-t"><b></b><small class="pf-chip"><i></i><em></em></small></span></div></div>';
    document.body.appendChild(rail);
    nav = rail.querySelector(".pf-nav"); btn = rail.querySelector(".pf-install"); hint = rail.querySelector(".pf-hint"); chip = rail.querySelector(".pf-chip em");
    btn.addEventListener("click", function () {
      if (!deferred) return; deferred.prompt();
      deferred.userChoice.finally(function () { deferred = null; sync(); });
    });
    rail.addEventListener("click", function (e) {
      var b = e.target.closest("[data-pf-go]"); if (!b) return;
      var k = b.getAttribute("data-pf-go");
      if (k === "new") {
        // the + composer (capture): opens on Notes from anywhere
        if (window.Capture) { window.Capture.open(); return; }
        go("#/notes");
        return;
      }
      go(k === "settings" ? "#/settings" : "#/" + k);
    });

    insp = document.createElement("aside"); insp.className = "dk-insp"; insp.id = "dkInsp"; insp.setAttribute("aria-label", "Inspector"); insp.hidden = true;
    document.body.appendChild(insp);
    crumb = document.createElement("div"); crumb.className = "dk-crumb"; crumb.hidden = true;
    var frame = document.getElementById("frame"), view = document.getElementById("view");
    if (frame && view) frame.insertBefore(crumb, view);

    var tabs = document.getElementById("tabs");
    if (tabs) new MutationObserver(sync).observe(tabs, { attributes: true, attributeFilter: ["hidden"] });
    var tr0 = document.getElementById("topRight"), tl0 = document.getElementById("topLeft");
    if (tr0) new MutationObserver(sync).observe(tr0, { childList: true, subtree: true, characterData: true });
    if (tl0) new MutationObserver(syncCrumb).observe(tl0, { childList: true, subtree: true });
    var tt = document.getElementById("topTitle"); if (tt) new MutationObserver(syncCrumb).observe(tt, { childList: true, characterData: true, subtree: true });
    new MutationObserver(function () { sync(); if (selKey) refreshInsp(); }).observe(d, { attributes: true, attributeFilter: ["lang"] });
    new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("hashchange", onRoute);
    if (MQ.addEventListener) MQ.addEventListener("change", onRoute);
    var vw = document.getElementById("view");
    if (vw) new MutationObserver(onViewMut).observe(vw, { childList: true, subtree: true });
    document.addEventListener("click", onDocClick, true);
    document.addEventListener("mouseover", onHover, true);
    document.addEventListener("mouseover", onPrefetch, true);
    document.addEventListener("focusin", onPrefetch, true);
    sync(); onRoute();
  }

  function inboxCount() {
    var b = document.querySelector("#topRight .inbox-count");
    if (b) return (b.textContent || "").trim();
    try { var n = Number(appState() && appState().inboxCount) || 0; return n ? String(n) : ""; } catch (_) { return ""; }
  }

  function sync() {
    if (!rail) return;
    var tabs = document.getElementById("tabs");
    var signedOut = !tabs || (tabs.hidden && /onboarding/.test(location.hash || ""));
    d.classList.toggle("dk-out", !!signedOut);
    var r = routeName();
    var cur = { notes: "notes", cards: "cards", card: "cards", threads: "threads", letter: "letter", plan: "plan", planResult: "plan", inbox: "inbox", camera: "notes" }[r] || "";
    var items = [["notes", T("Notes", "笔记")], ["cards", T("Cards", "卡片")], ["threads", T("Threads", "线索")], ["letter", T("Letter", "来信")], ["plan", T("Plan", "计划")]];
    var n = inboxCount();
    var html = items.map(function (it) {
      return '<button type="button" data-pf-go="' + it[0] + '"' + (cur === it[0] ? ' aria-current="page"' : "") + ' title="' + esc(it[1]) + '">' + IC[it[0]] + "<span>" + esc(it[1]) + "</span></button>";
    }).join("") + '<span class="pf-sep" aria-hidden="true"></span>' +
      '<button type="button" data-pf-go="inbox"' + (cur === "inbox" ? ' aria-current="page"' : "") + ' title="' + esc(T("Inbox", "收件箱")) + '">' + IC.inbox + "<span>" + esc(T("Inbox", "收件箱")) + "</span>" +
      (n ? '<b class="pf-count" aria-label="' + esc(T(n + " waiting", n + " 条待处理")) + '">' + esc(n) + "</b>" : "") + "</button>";
    if (nav.__h !== html) { nav.__h = html; nav.innerHTML = html; }
    rail.querySelector(".pf-new span").textContent = T("New note", "写笔记");
    var st = rail.querySelector(".pf-settings"); st.querySelector("span").textContent = T("Settings", "设置");
    st.toggleAttribute("aria-current", r === "settings"); if (r === "settings") st.setAttribute("aria-current", "page");
    var sample = document.body.classList.contains("is-sample");
    var u = null; try { u = appState() && appState().user; } catch (_) {}
    rail.querySelector(".pf-me-t b").textContent = "Q1f730";
    rail.querySelector(".pf-av").textContent = "Q";
    var standalone = d.classList.contains("pf-standalone");
    btn.hidden = !deferred || standalone;
    btn.querySelector("span").textContent = T("Install Sparkling", "安装 Sparkling");
    var os = d.getAttribute("data-os"), safari = /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Edg/.test(navigator.userAgent);
    var h = "";
    if (!standalone && !deferred && os === "macos" && safari) h = T("Install: File > Add to Dock.", "安装：文件 > 添加到程序坞。");
    hint.hidden = !h; hint.textContent = h;
    chip.textContent = navigator.onLine === false ? T("Offline", "离线") : sample ? T("Sample notebook", "示例笔记本") : T("Works offline", "可离线使用");
  }

  /* back link + page title inside the main pane (the phone top bar is hidden on desktop) */
  var TITLED = { inbox: 1, settings: 1, card: 1, camera: 1, threads: 1, letter: 0 };
  var TOP = { notes: 1, cards: 1, threads: 1, letter: 1, plan: 1, inbox: 1 };
  function syncCrumb() {
    if (!crumb) return;
    var r = routeName();
    var back = document.querySelector("#topLeft .back-btn");
    var sub = (location.hash || "").split("/").length > 2;
    if (back && TOP[r]) back = null;               // sidebar destinations need no back
    if (back && r === "settings" && !sub) back = null;
    var title = (document.getElementById("topTitle") || {}).textContent || "";
    var show = !!back || TITLED[r] === 1;
    crumb.hidden = !show;
    if (!show) { crumb.innerHTML = ""; return; }
    var to = back ? back.getAttribute("data-nav") : "";
    var h = (to ? '<button type="button" class="dk-back" data-nav="' + esc(to) + '">' + IC.back + "<span>" + esc(T("Back", "返回")) + "</span></button>" : "") +
      '<h1 class="dk-title">' + esc(title) + "</h1>";
    if (crumb.__h !== h) { crumb.__h = h; crumb.innerHTML = h; }
  }

  /* ---------- inspector ---------- */
  var selKey = "", selTok = 0, cache = {};
  /* one cache with the phone detail screen: window.SpCards (app.html). Fallback keeps the old local map. */
  function SC() { return window.SpCards || null; }
  function cachedCard(id) { var s = SC(); return s ? s.cached(id) : cache[id] || null; }
  function loadCard(id) {
    var s = SC();
    if (s) return s.get(id).then(function (x) { cache[id] = x; return x; });
    return cache[id] ? Promise.resolve(cache[id]) : getJSON("/api/cards/" + encodeURIComponent(id)).then(function (x) { cache[id] = x; return x; });
  }
  function summaryCard(id) { var s = SC(); return s ? s.summary(id) : null; }
  function desk() { return MQ.matches && !d.classList.contains("dk-out"); }
  function setBodyRoute() {
    var r = routeName();
    var cls = d.className.replace(/\bdk-r-\S+/g, "").trim();
    d.className = cls + " dk-r-" + r;
  }
  function wantsInsp(r) { return r === "notes" || r === "cards"; }
  function onRoute() {
    setBodyRoute(); sync(); syncCrumb();
    var r = routeName();
    var on = desk() && wantsInsp(r);
    d.classList.toggle("dk-insp-on", on);
    if (!insp) return;
    insp.hidden = !on;
    if (!on) { selKey = ""; return; }
    if (r === "notes") { if (!(selKey === "home" || selKey.indexOf("note:") === 0 || selKey.indexOf("card:") === 0)) selKey = "home"; }
    else if (selKey.indexOf("card:") !== 0) selKey = "cardauto";
    refreshInsp();
  }
  var mutRaf = 0;
  function onViewMut() {
    if (!desk() || mutRaf) return;
    mutRaf = requestAnimationFrame(function () { mutRaf = 0; onViewMut2(); });
  }
  function onViewMut2() {
    var r = routeName();
    if (r === "cards" && selKey === "cardauto") refreshInsp();
    markSelected();
  }
  function markSelected() {
    var v = document.getElementById("view"); if (!v) return;
    Array.prototype.forEach.call(v.querySelectorAll(".dk-sel"), function (el) { el.classList.remove("dk-sel"); });
    if (selKey.indexOf("note:") === 0) {
      var n = v.querySelector('[data-note-id="' + selKey.slice(5).replace(/"/g, "") + '"]'); if (n) n.classList.add("dk-sel");
    } else if (selKey.indexOf("card:") === 0) {
      var id = selKey.slice(5);
      Array.prototype.forEach.call(v.querySelectorAll('.card-tile[data-nav]'), function (el) { if (el.getAttribute("data-nav") === "#/cards/" + encodeURIComponent(id)) el.classList.add("dk-sel"); });
    }
  }
  function onDocClick(e) {
    if (!desk()) return;
    var r = routeName();
    // card tiles and note chips open in the inspector instead of navigating
    var nav0 = e.target.closest("[data-nav]");
    if (nav0 && /^#\/cards\/[^/]+$/.test(nav0.getAttribute("data-nav") || "") && (nav0.closest("#view") || nav0.closest("#dkInsp")) && (r === "cards" || r === "notes")) {
      if (nav0.closest(".dk-open")) return; // explicit "Open full page"
      e.preventDefault(); e.stopPropagation();
      var id = decodeURIComponent(nav0.getAttribute("data-nav").split("/")[2]);
      if (r === "notes" && nav0.closest("#view")) {
        var art = nav0.closest("[data-note-id]");
        if (art) { selKey = "note:" + art.getAttribute("data-note-id"); refreshInsp(id); return; }
      }
      selKey = "card:" + id; refreshInsp(); return;
    }
    if (r === "notes") {
      var a = e.target.closest("#view article.note[data-note-id]");
      if (a && !e.target.closest("button, a, input, textarea, [data-nav], .note-menu")) {
        var k = "note:" + a.getAttribute("data-note-id");
        selKey = selKey === k ? "home" : k; refreshInsp();
      }
    }
  }
  var pfT = 0, pfId = "";
  function onPrefetch(e) {
    if (!desk() || !SC()) return;
    var el = e.target.closest && e.target.closest('#view [data-nav^="#/cards/"], #dkInsp .dk-mini[data-nav]');
    if (!el) return;
    var m = /^#\/cards\/([^/]+)$/.exec(el.getAttribute("data-nav") || ""); if (!m) return;
    var id = decodeURIComponent(m[1]); if (id === pfId) return;
    pfId = id; clearTimeout(pfT);
    pfT = setTimeout(function () { SC().prefetch(id); }, e.type === "focusin" ? 0 : 70);
  }
  function onHover(e) {
    if (!desk() || routeName() !== "planResult") return;
    var s = e.target.closest && e.target.closest("#view .stop, #view [data-stop-i]");
    var v = document.getElementById("view"); if (!v) return;
    var i = -1;
    if (s) { var all = v.querySelectorAll(".stop"); i = Array.prototype.indexOf.call(all, s); }
    Array.prototype.forEach.call(v.querySelectorAll(".plan-side .rm-pin"), function (p, k) { p.classList.toggle("on", k === i); });
  }

  function refreshInsp(focusCard) {
    if (!insp || insp.hidden) return;
    var tok = ++selTok;
    markSelected();
    if (selKey === "home") return renderHome(tok);
    if (selKey === "cardauto") {
      var first = document.querySelector("#view .card-tile[data-nav]");
      if (!first) { insp.innerHTML = skeleton(); return; }
      selKey = "card:" + decodeURIComponent(first.getAttribute("data-nav").split("/")[2]); markSelected();
    }
    if (selKey.indexOf("card:") === 0) return renderCard(tok, selKey.slice(5));
    if (selKey.indexOf("note:") === 0) return renderNote(tok, selKey.slice(5), focusCard);
  }
  function skeleton() { return '<div class="dk-sk"></div><div class="dk-sk s"></div><div class="dk-sk s2"></div>'; }
  function head(eyebrow, title, extra) {
    return '<header class="dk-ih">' + (eyebrow ? '<p class="dk-eyebrow">' + esc(eyebrow) + "</p>" : "") + '<h2 class="dk-ititle">' + title + "</h2>" + (extra || "") + "</header>";
  }

  /* Notes, nothing selected: what needs you + what came back this week */
  function renderHome(tok) {
    insp.innerHTML = skeleton();
    Promise.all([getJSON("/api/inbox").catch(function () { return { items: [] }; }), getJSON("/api/cards").catch(function () { return { cards: [] }; })]).then(function (res) {
      if (tok !== selTok) return;
      var items = (res[0] && res[0].items) || [], cards = (res[1] && res[1].cards) || [];
      var h = "";
      if (items.length) {
        h += head(tr("Needs you"), esc(items.length === 1 ? tr("One guess to check") : T(items.length + " guesses to check", items.length + " 个猜测待确认")));
        h += '<ul class="dk-inbox">' + items.slice(0, 3).map(function (it) {
          var g = (it.guesses || [])[0] || {};
          return '<li><button type="button" data-nav="#/inbox"><span class="dk-q" translate="no">“' + esc(it.sentence) + '”</span>' +
            '<span class="dk-g"><b translate="no">' + esc(g.name || it.mention) + "</b> " + esc([tlabel(g.type), g.year].filter(Boolean).join(" · ")) + "</span></button></li>";
        }).join("") + "</ul>" +
          '<button class="btn btn-sm dk-wide" type="button" data-nav="#/inbox">' + esc(tr("Review the inbox")) + "</button>";
      } else {
        h += head(tr("Needs you"), esc(tr("Nothing waiting")), '<p class="dk-copy">' + esc(tr("Every mention in your notes has a card or was set aside.")) + "</p>");
      }
      var week = cards.slice().sort(function (a, b) { return (b.last_at || 0) - (a.last_at || 0); }).slice(0, 4);
      if (week.length) {
        h += '<p class="dk-eyebrow dk-gap">' + esc(tr("Came back lately")) + "</p>" +
          '<div class="dk-minis">' + week.map(miniTile).join("") + "</div>";
      }
      h += '<p class="dk-hint">' + esc(tr("Select a note to see the cards it grew.")) + "</p>";
      insp.innerHTML = h;
    });
  }
  function miniTile(c) {
    var im = img(c.image);
    return '<button type="button" class="dk-mini ' + tcls(c.type) + '" data-nav="#/cards/' + encodeURIComponent(c.id) + '">' +
      (im ? '<img src="' + esc(im) + '" alt="" loading="lazy" onerror="this.remove()">' : '<span class="dk-face" translate="no">' + esc(String(c.name || "").slice(0, 1)) + "</span>") +
      '<span class="dk-mt"><b translate="no">' + esc(c.name) + "</b><small>" + esc(ctxOf(c)) + "</small></span></button>";
  }

  /* Notes, a note selected: the cards it grew, each with its footprints */
  function renderNote(tok, nid, focusCard) {
    var art = document.querySelector('#view [data-note-id="' + nid.replace(/"/g, "") + '"]');
    var ids = [];
    if (art) Array.prototype.forEach.call(art.querySelectorAll('[data-nav^="#/cards/"]'), function (b) { var id = decodeURIComponent(b.getAttribute("data-nav").split("/")[2]); if (ids.indexOf(id) < 0) ids.push(id); });
    var timeEl = art && art.querySelector(".note-time");
    var eyebrow = tr("Selected note") + (timeEl ? " · " + timeEl.textContent : "");
    if (!ids.length) {
      insp.innerHTML = head(eyebrow, esc(tr("No cards from this note")), '<p class="dk-copy">' + esc(tr("Plain notes stay plain. Mention a film, book, album or place and it grows a card.")) + "</p>") +
        '<button class="btn btn-sm dk-wide" type="button" data-dk-home>' + esc(tr("Back to what needs you")) + "</button>";
      wireHomeBtn(); return;
    }
    insp.innerHTML = head(eyebrow, esc(ids.length === 1 ? tr("1 card from this note") : T(ids.length + " cards from this note", "这条笔记长出 " + ids.length + " 张卡片"))) + skeleton();
    Promise.all(ids.map(function (id) { return loadCard(id).catch(function () { return null; }); })).then(function (list) {
      if (tok !== selTok) return;
      var order = list.filter(Boolean);
      if (focusCard) order.sort(function (a, b) { return (b.card.id === focusCard) - (a.card.id === focusCard); });
      insp.innerHTML = head(eyebrow, esc(ids.length === 1 ? tr("1 card from this note") : T(ids.length + " cards from this note", "这条笔记长出 " + ids.length + " 张卡片"))) +
        order.map(function (x, i) { return cardBlock(x, i === 0 ? "full" : "compact"); }).join('<hr class="dk-hr">') +
        '<button class="dk-link" type="button" data-dk-home>' + esc(tr("Back to what needs you")) + "</button>";
      wireHomeBtn(); wireReact();
    });
  }
  function wireHomeBtn() { Array.prototype.forEach.call(insp.querySelectorAll("[data-dk-home]"), function (b) { b.addEventListener("click", function () { selKey = "home"; refreshInsp(); }); }); }

  /* Cards: the selected card */
  function renderCard(tok, id) {
    var hit = cachedCard(id), sum = !hit && summaryCard(id);
    if (hit) { insp.innerHTML = cardBlock(hit, "full"); wireReact(); }
    else if (sum && sum.name) { insp.innerHTML = cardBlock({ card: sum, footprints: null }, "full"); wireReact(); }
    else insp.innerHTML = skeleton();
    if (hit && (!SC() || SC().fresh(id))) return;
    var p = hit ? SC().load(id) : loadCard(id);
    p.then(function (x) {
      if (tok !== selTok) return;
      if (hit && JSON.stringify(x) === JSON.stringify(hit)) return;
      fillCard(x);
      wireReact();
    }).catch(function () {
      if (hit) return;
      if (tok !== selTok) return;
      insp.innerHTML = head("", esc(tr("This card did not load.")), '<p class="dk-copy">' + esc(tr("Check your connection, then try again.")) + "</p>");
    });
  }
  function fillCard(x) {
    var old = insp.querySelector('[data-dk-card="' + (window.CSS && CSS.escape ? CSS.escape(x.card.id) : x.card.id) + '"]');
    var t = document.createElement("div"); t.innerHTML = cardBlock(x, "full");
    var nu = t.firstElementChild;
    if (!old || !nu) { insp.innerHTML = t.innerHTML; return; }
    var oh = old.querySelector(".dk-ch"), nh = nu.querySelector(".dk-ch");
    if (oh && nh) {
      var or = oh.querySelector(".dk-react"), nr = nh.querySelector(".dk-react");
      if (or && nr && or.innerHTML !== nr.innerHTML) or.innerHTML = nr.innerHTML;
      var on = oh.querySelector(".dk-cname"), nn = nh.querySelector(".dk-cname");
      if (on && nn && on.textContent !== nn.textContent) on.textContent = nn.textContent;
    }
    var wasLoading = old.classList.contains("is-loading");
    Array.prototype.slice.call(old.children).forEach(function (el) { if (!el.classList.contains("dk-ch")) el.remove(); });
    Array.prototype.slice.call(nu.children).forEach(function (el) { if (!el.classList.contains("dk-ch")) { if (wasLoading && el.matches(".dk-fpw")) el.classList.add("dk-in"); old.appendChild(el); } });
    old.classList.remove("is-loading"); old.removeAttribute("aria-busy");
  }
  var KIND = { note: "Note", rewatch: "Rewatch", first_watch: "First watch", listen: "Listen", read: "Read", visit: "Visit", quote: "Quote", screenshot: "Screenshot", link: "Link" };
  function cardBlock(x, mode) {
    var c = x.card || {}, loading = x.footprints === null, fps = (x.footprints || []).slice().sort(function (a, b) { return (b.created_at || 0) - (a.created_at || 0); });
    var im = img(c.image), heart = Number(c.heart) || 0, full = mode === "full";
    var tags = (x.qloo_tags && x.qloo_tags.length ? x.qloo_tags : (c.tags || [])).slice(0, full && !loading ? 6 : 3);
    var tones = ["sage", "clay", "butter"];
    var h = '<article class="dk-card ' + tcls(c.type) + (full ? "" : " compact") + (loading ? " is-loading" : "") + '" data-dk-card="' + esc(c.id) + '"' + (loading ? ' aria-busy="true"' : "") + '>' +
      '<div class="dk-ch">' + (im ? '<span class="dk-cover"><img src="' + esc(im) + '" alt="" onerror="this.parentNode.classList.add(\'none\');this.remove()"></span>' : '<span class="dk-cover none"><span translate="no">' + esc(String(c.name || "").slice(0, 1)) + "</span></span>") +
      '<div class="dk-cht"><p class="dk-eyebrow">' + esc(ctxOf(c)) + '</p><h2 class="dk-cname" translate="no">' + esc(c.name || "") + "</h2>" +
      '<div class="dk-react"><button type="button" class="dk-pill' + (heart === 1 ? " on" : "") + '" data-dk-heart="1" aria-pressed="' + (heart === 1) + '">' + IC.heart + "<span>" + esc(tr(heart === 1 ? "Loved" : "Love this")) + "</span></button>" +
      '<button type="button" class="dk-pill' + (heart === -1 ? " on out" : "") + '" data-dk-heart="-1" aria-pressed="' + (heart === -1) + '">' + IC.close + "<span>" + esc(tr("Not for me")) + "</span></button></div></div></div>";
    if (full) {
      var n = Number(c.footprints) || fps.length;
      h += '<dl class="dk-stats"><div><dt>' + esc(tr(n === 1 ? "mention" : "mentions")) + '</dt><dd class="num">' + n + "</dd></div>" +
        (c.first_at ? "<div><dt>" + esc(tr("first met")) + "</dt><dd>" + esc(fdate(c.first_at)) + "</dd></div>" : "") +
        (c.last_at ? "<div><dt>" + esc(tr("last seen")) + "</dt><dd>" + esc(seen(c.last_at) || fdate(c.last_at)) + "</dd></div>" : "") + "</dl>";
    }
    var show = fps.slice(0, full ? 4 : 2);
    if (loading) {
      var k = Math.max(1, Math.min(full ? 4 : 2, Number(c.footprints) || 1)), rows = "";
      for (var i = 0; i < k; i++) rows += '<li class="dk-skr"><span class="dk-fd"><i class="dk-b w1"></i><i class="dk-b w2"></i></span><span class="dk-sq"><i class="dk-b w3"></i><i class="dk-b w4"></i></span></li>';
      h += '<div class="dk-fpw" aria-hidden="true"><p class="dk-eyebrow dk-gap">' + esc(tr("Footprints")) + '</p><ol class="dk-fps">' + rows + "</ol></div>";
    } else if (show.length) {
      h += '<div class="dk-fpw"><p class="dk-eyebrow dk-gap">' + esc(tr("Footprints")) + '</p><ol class="dk-fps">' + show.map(function (f) {
        return '<li><span class="dk-fd">' + esc(fdate(f.created_at)) + "<br>" + esc(tr(KIND[f.kind] || "Note")) + '</span><q translate="no">' + esc(f.quote || "") + "</q></li>";
      }).join("") + "</ol>" + (fps.length > show.length ? '<p class="dk-more">' + esc(T("+ " + (fps.length - show.length) + " more on the card", "卡片上还有 " + (fps.length - show.length) + " 条")) + "</p>" : "") + "</div>";
    }
    if (tags.length) {
      h += '<p class="dk-eyebrow dk-gap">' + esc(tr("From the catalogue")) + '</p><div class="dk-tags" translate="no">' + tags.map(function (t, i) { return '<span class="dk-tag ' + tones[i % 3] + '">' + esc(typeof window.tagZh === "function" ? window.tagZh(t) : t) + "</span>"; }).join("") + "</div>";
    }
    h += '<div class="dk-actions dk-open"><button class="btn btn-sm" type="button" data-nav="#/cards/' + encodeURIComponent(c.id) + '">' + esc(tr("Open full card")) + "</button></div>";
    return h + "</article>";
  }
  function syncTile(id, heart) {
    var t = document.querySelector('#view .card-tile[data-nav="#/cards/' + encodeURIComponent(id) + '"]');
    if (t) t.classList.toggle("is-out", heart === -1);
  }
  function wireReact() {
    Array.prototype.forEach.call(insp.querySelectorAll("[data-dk-heart]"), function (b) {
      b.addEventListener("click", function () {
        var art = b.closest("[data-dk-card]"), id = art.getAttribute("data-dk-card"), x = cachedCard(id) || cache[id]; if (!x) return;
        var v = Number(b.getAttribute("data-dk-heart")), now = Number(x.card.heart) || 0, next = now === v ? 0 : v;
        x.card.heart = next; syncTile(id, next); refreshInsp();
        getJSON("/api/cards/" + encodeURIComponent(id), { method: "PATCH", body: { heart: next } }).catch(function () { x.card.heart = now; syncTile(id, now); refreshInsp(); });
      });
    });
  }

  // ---- Chromium-only lens: displacement map refracting what sits behind the glass pill.
  // Safari does not support url() in backdrop-filter, so Apple Safari keeps the rim-light lens from pf.css.
  function lens() {
    var ua = navigator.userAgent;
    if (!d.classList.contains("pf-glass") || !/Chrome\//.test(ua)) return;
    if (matchMedia("(prefers-reduced-transparency: reduce)").matches) return;
    var c = document.createElement("canvas"); c.width = 128; c.height = 64; var x = c.getContext("2d");
    var im = x.createImageData(128, 64);
    for (var j = 0; j < 64; j++) for (var i = 0; i < 128; i++) {
      var nx = (i - 63.5) / 63.5, ny = (j - 31.5) / 31.5, r = Math.min(1, Math.sqrt(nx * nx + ny * ny));
      var k = Math.pow(r, 3);
      var o = (j * 128 + i) * 4;
      im.data[o] = 128 - nx * k * 110; im.data[o + 1] = 128 - ny * k * 110; im.data[o + 2] = 128; im.data[o + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    var ns = "http://www.w3.org/2000/svg";
    var s = document.createElementNS(ns, "svg"); s.setAttribute("width", "0"); s.setAttribute("height", "0"); s.setAttribute("aria-hidden", "true");
    s.style.position = "absolute";
    s.innerHTML = '<filter id="pf-lens" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">' +
      '<feImage href="' + c.toDataURL() + '" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="m"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="m" scale="14" xChannelSelector="R" yChannelSelector="G"/></filter>';
    document.body.appendChild(s);
    d.classList.add("pf-lens");
  }

  function start() { net(); build(); lens(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
