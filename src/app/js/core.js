/* ---- escaping and small utilities ---- */
function esc(value){
  return String(value == null ? "" : value).replace(/[&<>"']/g, function(c){
    return c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;";
  });
}
function attr(value){ return esc(value); }
function clamp(n, lo, hi){ n = Number(n); if (!Number.isFinite(n)) n = lo; return Math.max(lo, Math.min(hi, n)); }
function numberValue(v){ const n = Number(v); return Number.isFinite(n) ? n : null; }
function plural(n, one, many){ return Number(n) === 1 ? one : many; }
function countWord(n){ const i = Math.max(0, Math.min(12, Math.floor(Number(n) || 0))); return COUNT_WORDS[i]; }
function countWordCap(n){ const w = countWord(n); return w.charAt(0).toUpperCase() + w.slice(1); }
function typeOf(t){ return VALID_TYPES.includes(t) ? t : "other"; }
function typeLabel(t){ return TYPE_LABELS[typeOf(t)]; }
function typeClass(t){ return TYPE_CLASSES[typeOf(t)]; }
function sizeOf(s){ const n = Number(s); return n === 2 || n === 3 ? n : 1; }

function safeHttpUrl(value){
  if (typeof value !== "string" || !value) return "";
  try {
    const u = new URL(value, location.href);
    return (u.protocol === "http:" || u.protocol === "https:") ? u.href : "";
  } catch (_) { return ""; }
}
function imgSrc(value){
  if (typeof value !== "string" || !value) return "";
  if (value.charAt(0) === "/" && value.indexOf("//") !== 0) return value;
  return /^https?:\/\//i.test(value) ? value : "";
}
function linkHost(value){
  try {
    const u = new URL(value, location.href);
    return u.hostname.replace(/^www\./, "") || u.href;
  } catch (_) { return String(value || ""); }
}
function urlOnly(value){
  const t = String(value || "").trim();
  return /^https?:\/\/[^\s]+$/i.test(t) ? t : "";
}
function extractFirstUrl(value){
  const m = String(value || "").match(/https?:\/\/[^\s]+/i);
  return m ? m[0] : "";
}

function startOfDay(ms){
  const d = new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return NaN;
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function dayDiff(ms){
  const a = startOfDay(Date.now()), b = startOfDay(ms);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / DAY);
}
function formatTime(ms){
  const n = Number(ms);
  if (!Number.isFinite(n)) return "";
  const d = new Date(n);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}
function formatDayLabel(ms){
  const diff = dayDiff(ms);
  if (diff === null) return "Earlier";
  if (diff === 0) return "Today";
  if (diff > 0 && diff < 7) return WEEK_LONG[new Date(Number(ms)).getDay()];
  const d = new Date(Number(ms));
  const year = d.getFullYear() === new Date().getFullYear() ? "" : " " + d.getFullYear();
  return d.getDate() + " " + MONTHS[d.getMonth()] + year;
}
function formatDate(ms){
  const n = Number(ms);
  if (!Number.isFinite(n)) return "";
  const d = new Date(n);
  const year = d.getFullYear() === new Date().getFullYear() ? "" : " " + d.getFullYear();
  return d.getDate() + " " + MONTHS[d.getMonth()] + year;
}
function monthYear(ms){
  const n = Number(ms);
  if (!Number.isFinite(n)) return "";
  return MONTHS[new Date(n).getMonth()] + " " + new Date(n).getFullYear();
}
function weekdayShort(ms){
  const n = Number(ms);
  if (!Number.isFinite(n)) return "";
  return WEEK_SHORT[new Date(n).getDay()];
}
function lastSeen(ms){
  const diff = dayDiff(ms);
  if (diff === null) return "";
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff > 1 && diff < 7) return weekdayShort(ms);
  return formatDate(ms);
}
function cardCountLabel(n, mentions){
  const arr = Array.isArray(mentions) ? mentions : [];
  if (arr.some(function(m){ return m && m.state === "inbox"; })) return "In inbox";
  const count = Number(n) || 0;
  if (count <= 0) return "plain note";
  return count + " " + plural(count, "card", "cards");
}
function weekdayNameToday(){
  return WEEK_LONG[new Date().getDay()];
}

function sleep(ms, signal){
  return new Promise(function(resolve, reject){
    const timer = setTimeout(resolve, ms);
    if (signal) {
      if (signal.aborted) { clearTimeout(timer); reject(Object.assign(new Error("aborted"), { name:"AbortError" })); return; }
      signal.addEventListener("abort", function(){
        clearTimeout(timer);
        reject(Object.assign(new Error("aborted"), { name:"AbortError" }));
      }, { once:true });
    }
  });
}
function isAbort(e){ return e && (e.name === "AbortError" || e.code === 20); }

function on(target, event, handler, options){
  target.addEventListener(event, handler, options);
  cleanups.push(function(){ target.removeEventListener(event, handler, options); });
}
function onCleanup(fn){ cleanups.push(fn); }
function beginView(){
  viewToken += 1;
  cleanups.forEach(function(fn){ try { fn(); } catch (_) {} });
  cleanups = [];
  return viewToken;
}
function isCurrent(token){ return token === viewToken; }
function abortable(){
  const ac = new AbortController();
  onCleanup(function(){ try { ac.abort(); } catch (_) {} });
  return ac;
}
function bindRetries(handlers){
  on(view, "click", function(e){
    const b = e.target.closest("[data-retry]");
    if (!b) return;
    const fn = handlers[b.getAttribute("data-retry")];
    if (fn) { e.preventDefault(); fn(); }
  });
}

/* ---- API ---- */
/* Card detail cache. Summaries come free with every /api/cards list; details are fetched once, prefetched on
   hover / focus / press, shared by the phone detail screen and the desktop inspector. Any write clears details
   (a note, a reaction, a detach can all change a card); a session change clears everything. */
const SpCards = window.SpCards = (function(){
  const sum = new Map(), det = new Map(), fly = new Map();
  let gen = 0;
  const FRESH = 60000;
  function fetchOne(id){
    if (fly.has(id)) return fly.get(id);
    const g = gen;
    const p = api("/api/cards/" + encodeURIComponent(id)).then(function(x){
      fly.delete(id);
      if (x && x.card && g === gen) { det.set(id, { x: x, at: Date.now() }); sum.set(id, Object.assign({}, sum.get(id) || {}, x.card)); }
      return x;
    }, function(e){ fly.delete(id); throw e; });
    fly.set(id, p);
    return p;
  }
  return {
    summary: function(id){ return sum.get(String(id)) || null; },
    cached: function(id){ const e = det.get(String(id)); return e ? e.x : null; },
    fresh: function(id){ const e = det.get(String(id)); return !!e && Date.now() - e.at < FRESH; },
    get: function(id){ id = String(id); const e = det.get(id); return e ? Promise.resolve(e.x) : fetchOne(id); },
    load: function(id){ return fetchOne(String(id)); },
    prefetch: function(id){ id = String(id || ""); if (!id || (det.has(id) && Date.now() - det.get(id).at < FRESH)) return; fetchOne(id).catch(function(){}); },
    noteList: function(list){ (Array.isArray(list) ? list : []).forEach(function(c){ if (c && c.id) sum.set(String(c.id), c); }); },
    clear: function(all){ gen++; det.clear(); if (all) sum.clear(); }
  };
})();
async function api(path, options){
  const opts = options || {};
  const method = opts.method || "GET";
  const headers = Object.assign({}, opts.headers || {});
  const init = { method: method, credentials: "same-origin", headers: headers };
  if (opts.signal) init.signal = opts.signal;
  if (opts.body !== undefined) {
    if (opts.body instanceof FormData) {
      init.body = opts.body;
    } else {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }
  }
  if (method !== "GET" && typeof SpCards !== "undefined") SpCards.clear(/^\/api\/(session|signout|delete)\b/.test(path));
  const res = await fetch(path, init);
  let data = null;
  const ct = res.headers.get("content-type") || "";
  if (ct.indexOf("application/json") >= 0) {
    try { data = await res.json(); } catch (_) {}
  } else {
    let text = "";
    try { text = await res.text(); } catch (_) {}
    if (text) {
      try { data = JSON.parse(text); } catch (_) { data = text; }
    }
  }
  if (!res.ok) {
    const serverMsg = data && typeof data === "object" && data.error ? data.error : "";
    const err = new Error(serverMsg || ("Request failed (" + res.status + ")"));
    err.status = res.status;
    err.data = data;
    if (res.status === 401 && state.user) sessionLost();
    throw err;
  }
  if (method === "GET" && /^\/api\/cards(\?|$)/.test(path) && data && data.cards) SpCards.noteList(data.cards);
  return data;
}
async function refreshMe(){
  try {
    const me = await api("/api/me");
    if (me && me.user) {
      state.user = me.user;
      state.inboxCount = Number(me.inbox_count) || 0;
      updateRibbon();
      updateInboxBadge();
    }
  } catch (_) {}
}
function sessionLost(){
  if (!state.user) return;
  state.user = null;
  state.inboxCount = 0;
  state.focusComposer = false;
  state.bootNotice = "Your session ended. Start a fresh notebook when you are ready.";
  closeModal();
  history.replaceState(null, "", "#/onboarding");
  renderOnboarding();
}

/* ---- fonts of data ---- */
function cardContext(card){
  if (!card) return "";
  const type = typeLabel(card.type);
  const extra = card.year ? String(card.year) : (card.by ? String(card.by) : "");
  return type + (extra ? " · " + extra : "");
}
function planStopWhere(stop){
  if (!stop) return "";
  const place = stop.neighborhood || stop.address || "";
  const dist = stop.distance ? String(stop.distance) : "";
  return [place, dist].filter(Boolean).join(" · ");
}
function guessMeta(g){
  if (!g) return "";
  const bits = [typeLabel(g.type)];
  if (g.year) bits.push(String(g.year));
  if (g.by) bits.push("by " + g.by);
  return bits.join(" · ");
}
function footprintsDots(n){
  const count = Math.max(0, Number(n) || 0);
  if (!count) return "";
  const label = count === 1 ? "Mentioned once" : "Mentioned " + count + "\u00d7";
  return '<span class="fp-dots fp-label" aria-label="' + attr(label) + '">' + label + "</span>";
}

/* ---- icons ---- */
const icons = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5.5 15.5 12 9 18.5"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>',
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 8.5h3l1.2-2h6.6l1.2 2h3v9h-15z"/><circle cx="12" cy="13" r="3"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.2 13.8a3.6 3.6 0 0 1 0-5.1l2-2a3.6 3.6 0 0 1 5.1 5.1l-1.1 1.1M13.8 10.2a3.6 3.6 0 0 1 0 5.1l-2 2a3.6 3.6 0 0 1-5.1-5.1l1.1-1.1"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="5.5"/><path d="M15.2 15.2 20 20"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.1-4.4-7.1-9.3A4.1 4.1 0 0 1 12 7.2a4.1 4.1 0 0 1 7.1 3.5C19.1 15.6 12 20 12 20z"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.5h15v13h-15z"/><path d="M4.5 12.5h4l1.6 2h3.8l1.6-2h4"/></svg>',
  photo: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="5.5" width="15" height="13" rx="2"/><circle cx="9" cy="10" r="1.3"/><path d="m5.5 17 4.6-4.6 3.2 3.2 2-2 3.2 3.4"/></svg>',
};

function inboxButtonHTML(){
  const n = Number(state.inboxCount) || 0;
  const label = n > 0 ? "Inbox, " + n + " waiting" : "Inbox";
  const badge = n > 0
    ? '<span class="inbox-badge"><span class="inbox-dot" aria-hidden="true"></span><span class="inbox-count">' + (n > 99 ? "99+" : n) + "</span></span>"
    : "";
  return '<button class="inbox-btn" type="button" data-nav="#/inbox" aria-label="' + attr(label) + '">' + icons.inbox + badge + "</button>";
}
function avatarHTML(){
  return '<button class="avatar" type="button" data-nav="#/settings" aria-label="Open settings"><span aria-hidden="true">S</span></button>';
}
function backHTML(fallback){
  return '<button class="back-btn" type="button" data-nav="' + attr(fallback || "#/notes") + '" aria-label="Go back">' + icons.back + "</button>";
}
function updateInboxBadge(){
  if (chromeEl.hidden) return;
  topRight.innerHTML = inboxButtonHTML();
}
function updateRibbon(){
  ribbon.hidden = !(state.user && state.user.sample);
  document.body.classList.toggle("is-sample", !!(state.user && state.user.sample));
}
function setShell(opts){
  const o = opts || {};
  const hidden = !!o.hide;
  const showTabs = o.tabs !== false && !hidden;
  chromeEl.hidden = hidden;
  tabsEl.hidden = !showTabs;
  view.className = "view" + (showTabs ? "" : " no-tabs") + (hidden ? " onboarding" : "");
  if (hidden) {
    document.title = "Sparkling";
    return;
  }
  topTitle.textContent = o.title || "Sparkling";
  document.title = (o.title || "Sparkling") + " · Sparkling";
  topLeft.innerHTML = o.back ? backHTML(o.back) : avatarHTML();
  topRight.innerHTML = inboxButtonHTML();
  updateRibbon();
  const active = o.active || null;
  Array.prototype.forEach.call(tabsEl.querySelectorAll(".tab"), function(tab){
    if (active && tab.getAttribute("data-tab") === active) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  });
}

/* ---- toasts ---- */
function dismissToast(){
  if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
  toastHost.innerHTML = "";
}
function toast(text, opts){
  const o = opts || {};
  if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
  toastHost.innerHTML = "";
  const el = document.createElement("div");
  el.className = "toast";
  const span = document.createElement("span");
  span.className = "toast-text";
  span.textContent = String(text == null ? "" : text);
  el.appendChild(span);
  let undo = null;
  if (o.actionLabel && typeof o.onAction === "function") {
    undo = document.createElement("button");
    undo.type = "button";
    undo.className = "toast-action";
    undo.textContent = String(o.actionLabel);
    undo.addEventListener("click", function(){
      dismissToast();
      try { o.onAction(); } catch (_) {}
    });
    el.appendChild(undo);
  }
  toastHost.appendChild(el);
  const duration = Number(o.duration) || (o.actionLabel ? 10000 : 3500);
  toastTimer = setTimeout(dismissToast, duration);
}


/* inline inputs grow with their text (fallback where field-sizing is unsupported) */
let sizeCtx = null;
function sizeInline(el){
  if (!el || !el.classList || !el.classList.contains("inline-input")) return;
  const v = el.value || el.placeholder || "";
  sizeCtx = sizeCtx || document.createElement("canvas").getContext("2d");
  const cs = getComputedStyle(el);
  sizeCtx.font = cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
  el.style.width = Math.ceil(Math.max(28, sizeCtx.measureText(v).width + 8)) + "px";
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ document.querySelectorAll(".inline-input").forEach(sizeInline); });
document.addEventListener("input", function(e){ sizeInline(e.target); });
new MutationObserver(function(){ document.querySelectorAll(".inline-input").forEach(function(el){ if (!el.dataset.sized) { el.dataset.sized = "1"; sizeInline(el); } }); }).observe(document.documentElement, { childList: true, subtree: true });

/* ---- dialogs ---- */
let lastSheetFocus = null;
function openSheet(opts){
  const o = opts || {};
  if (modal.open) modal.close();
  lastSheetFocus = document.activeElement;
  modal.innerHTML =
    '<div class="sheet' + (o.cls ? " " + o.cls : "") + '">' +
      '<div class="sheet-head"><h2 class="sheet-title" id="modalTitle">' + esc(o.title || "") + "</h2>" +
        '<button class="sheet-close" type="button" data-close aria-label="Close">' + icons.close + "</button>" +
      "</div>" +
      '<div class="sheet-body">' + (o.body || "") + "</div>" +
    "</div>";
  modal.showModal();
  document.body.classList.add("modal-open");
  const focusTarget = modal.querySelector("[data-autofocus]") ||
    modal.querySelector(".sheet-body input, .sheet-body textarea, .sheet-body button") ||
    modal.querySelector(".sheet-close");
  if (focusTarget) setTimeout(function(){ try { focusTarget.focus(); } catch (_) {} }, 20);
  if (typeof o.onMount === "function") o.onMount(modal);
}
function closeModal(){
  if (modal.open) modal.close();
  document.body.classList.remove("modal-open");
  if (lastSheetFocus && typeof lastSheetFocus.focus === "function") {
    try { lastSheetFocus.focus(); } catch (_) {}
  }
  lastSheetFocus = null;
}
function openMenu(title, items){
  const rows = items.map(function(item){
    return '<button class="menu-item' + (item.danger ? " danger" : "") + '" type="button" data-menu="' + attr(item.key) + '">' +
      "<span><span>" + esc(item.label) + "</span>" + (item.sub ? '<span class="sub">' + esc(item.sub) + "</span>" : "") + "</span>" +
    "</button>";
  }).join("");
  openSheet({ title: title, body: '<div class="menu-list">' + rows + "</div>" });
  return modal;
}
function confirmSheet(opts){
  const o = opts || {};
  const danger = o.danger ? " btn-danger-solid" : " btn-primary";
  openSheet({
    title: o.title || "Are you sure?",
    body:
      '<p id="confirmCopy">' + esc(o.copy || "") + "</p>" +
      (o.extra || "") +
      '<p class="inline-error" data-confirm-error role="alert" hidden></p>' +
      (o.slide && window.Fx ? Fx.slideHTML(esc(o.slide)) +
        '<div class="sheet-actions"><button class="btn btn-ghost" type="button" data-confirm-no data-autofocus>' + esc(o.cancelLabel || "Cancel") + '</button><button type="button" data-confirm-yes hidden></button></div>' :
      '<div class="sheet-actions">' +
        '<button class="btn btn-ghost" type="button" data-confirm-no data-autofocus>' + esc(o.cancelLabel || "Cancel") + "</button>" +
        '<button class="btn' + danger + '" type="button" data-confirm-yes>' + esc(o.confirmLabel || "Continue") + "</button>" +
      "</div>"),
    onMount: function(root){
      const yes = root.querySelector("[data-confirm-yes]");
      const no = root.querySelector("[data-confirm-no]");
      const errEl = root.querySelector("[data-confirm-error]");
      if (no) no.addEventListener("click", closeModal);
      if (!yes) return;
      if (o.slide && window.Fx) Fx.wireSlide(root, function(reset, labelEl){
        labelEl.textContent = o.busyLabel || "Working";
        if (errEl) errEl.hidden = true;
        Promise.resolve().then(o.onConfirm).then(closeModal, function(e){
          if (errEl) { errEl.textContent = e && e.message ? e.message : t("That did not work. Try again."); errEl.hidden = false; }
          labelEl.textContent = o.slide; reset();
        });
      });
      yes.addEventListener("click", async function(){
        if (yes.disabled) return;
        const old = yes.textContent;
        yes.disabled = true;
        yes.textContent = o.busyLabel || "Working";
        if (errEl) errEl.hidden = true;
        try {
          await o.onConfirm();
          closeModal();
        } catch (e) {
          const msg = e && e.message ? e.message : t("That did not work. Try again.");
          if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
          yes.disabled = false;
          yes.textContent = old;
        }
      });
    },
  });
}

// Dialog housekeeping, bound once.
modal.addEventListener("click", function(e){
  if (e.target.closest("[data-close]")) { closeModal(); return; }
  if (e.target === modal) closeModal();
});
modal.addEventListener("close", function(){
  document.body.classList.remove("modal-open");
  if (lastSheetFocus && typeof lastSheetFocus.focus === "function") {
    try { lastSheetFocus.focus(); } catch (_) {}
  }
  lastSheetFocus = null;
});
document.addEventListener("error", function(e){
  const img = e.target;
  if (img && img.tagName === "IMG") img.classList.add("img-broken");
}, true);

/* ---- navigation and boot ---- */
function parseRoute(){
  let raw = location.hash || "#/notes";
  if (raw === "#" || raw === "#/") return { name: "notes" };
  const path = raw.replace(/^#\/?/, "");
  const parts = path.split("/").filter(Boolean).map(function(p){
    try { return decodeURIComponent(p); } catch (_) { return p; }
  });
  if (!parts.length) return { name: "notes" };
  if (parts[0] === "notes") return { name: "notes" };
  if (parts[0] === "cards") return parts[1] ? { name: "card", id: parts[1] } : { name: "cards" };
  if (parts[0] === "threads") return { name: "threads" };
  if (parts[0] === "letter") return { name: "letter" };
  if (parts[0] === "inbox") return { name: "inbox" };
  if (parts[0] === "plan") return parts[1] ? { name: "planResult", id: parts[1] } : { name: "plan" };
  if (parts[0] === "settings") return { name: "settings", page: parts[1] || "" };
  if (parts[0] === "camera") return { name: "camera" };
  if (parts[0] === "onboarding") return { name: "onboarding" };
  return { name: "notes" };
}
function go(hash){
  if (!hash) return;
  if (location.hash === hash) { route(); return; }
  location.hash = hash;
}
function route(){
  if (!state.booted) return;
  const r = parseRoute();
  if (!state.user) {
    if (r.name !== "onboarding") history.replaceState(null, "", "#/onboarding");
    renderOnboarding();
    return;
  }
  if (r.name === "onboarding") {
    history.replaceState(null, "", "#/notes");
    renderNotes();
    return;
  }
  if (r.name === "notes" || r.name === "cards" || r.name === "plan") state.lastMain = "#/" + r.name;
  try { window.scrollTo(0, 0); } catch (_) {}
  switch (r.name) {
    case "notes": renderNotes(); break;
    case "cards": renderCards(); break;
    case "card": renderCardDetail(r.id); break;
    case "threads": renderThreads(); break;
    case "letter": renderLetter(); break;
    case "inbox": renderInbox(); break;
    case "plan": renderPlanRequest(); break;
    case "planResult": renderPlanResult(r.id); break;
    case "settings": renderSettings(r.page); break;
    case "camera": { state.capOpen = null; history.replaceState(null, "", "#/notes"); renderNotes(); const capFabEl = document.querySelector(".cap-fab"); if (window.Capture && (!capFabEl || capFabEl.getAttribute("aria-expanded") !== "true")) Capture.open({}); break; }
    default: renderNotes();
  }
}
window.addEventListener("hashchange", function(){
  dismissToast();
  if (modal.open) closeModal();
  route();
});
tabsEl.addEventListener("click", function(e){
  const tab = e.target.closest(".tab");
  if (!tab) return;
  const name = tab.getAttribute("data-tab");
  if (name === "notes") go("#/notes");
  else if (name === "cards") go("#/cards");
  else if (name === "plan") go("#/plan");
});
document.addEventListener("click", function(e){
  const nav = e.target.closest("[data-nav]");
  if (!nav) return;
  const to = nav.getAttribute("data-nav");
  if (!to) return;
  e.preventDefault();
  go(to);
});

/* ---- shared markup ---- */
function noteSkeletonHTML(count){
  let out = "";
  for (let i = 0; i < (count || 3); i++) out += '<div class="skeleton sk-note"></div>';
  return out;
}
function cardSkeletonHTML(){
  return '<div class="wall" aria-hidden="true"><div class="wall-col">' +
    '<div class="skeleton sk-card tall"></div><div class="skeleton sk-card"></div>' +
    '</div><div class="wall-col"><div class="skeleton sk-card"></div><div class="skeleton sk-card tall"></div></div></div>';
}
function errorBlock(copy, retryKey){
  return '<div class="state" role="alert">' +
    '<p class="state-title">Something did not load.</p>' +
    '<p class="state-copy">' + esc(copy || "Check your connection, then try again.") + "</p>" +
    '<div class="state-actions"><button class="btn btn-sm" type="button" data-retry="' + attr(retryKey || "retry") + '">Retry</button></div>' +
  "</div>";
}
function emptyBlock(title, copy, actionHTML){
  return '<div class="state">' +
    (title ? '<p class="state-title">' + esc(title) + "</p>" : "") +
    '<p class="state-copy">' + esc(copy) + "</p>" +
    (actionHTML ? '<div class="state-actions">' + actionHTML + "</div>" : "") +
  "</div>";
}
function feedbackEl(){ return '<p class="feedback" role="status"></p>'; }
function searchFieldHTML(id, value){
  return '<div class="search-field">' + icons.search +
    '<input id="' + attr(id) + '" type="search" autocomplete="off" placeholder="' + attr(t("Search your notes")) + '" aria-label="' + attr(t("Search your notes")) + '" value="' + attr(value || "") + '">' +
    "</div>";
}
function sheetField(label, id, type, value, placeholder, autofocus){
  return '<div class="sheet-field"><label for="' + attr(id) + '">' + esc(label) + "</label>" +
    '<input id="' + attr(id) + '" type="' + attr(type || "text") + '" value="' + attr(value || "") + '" placeholder="' + attr(placeholder || "") + '"' + (autofocus ? " data-autofocus" : "") + "></div>";
}
/* Qloo tag as a typeset word: name (never translated) + type label + score. Raw urn:tag ids stay in receipts only. */
const TAG_TYPE = { mood: "mood", artist: "trait", theme: "theme", genre: "genre", keyword: "keyword", category: "category", audience: "audience", style: "style", subgenre: "genre", award: "award", platform: "platform", demographic: "audience", place: "place" };
function tagType(id){ const m = String(id || "").match(/^urn:tag:([a-z_]+)/); return m ? (TAG_TYPE[m[1]] || m[1].replace(/_/g, " ")) : ""; }
function tagPretty(name){ const s = String(name || ""); if (/^urn:tag:/.test(s)) { const tail = s.split(":").pop().replace(/_/g, " "); return tail.charAt(0).toUpperCase() + tail.slice(1); } return s; }
function scoreText(x){ const n = Number(x); if (!isFinite(n)) return ""; const f = n.toFixed(2); return n >= 0.995 ? "1.00" : f.replace(/^0/, ""); }
const TAG_ZH={"creative writing":"创意写作","artistic":"艺术感","fine baking":"精致烘焙","patio":"露台","bakery shopping":"逛面包店","bread":"面包","pastry":"点心","community events":"社区活动","live music":"现场音乐","vegan":"纯素","quiet":"安静","cozy atmosphere":"温馨","craft":"手作","rare books":"珍本","used books":"二手书","zines":"独立刊物","art":"艺术","books":"书","music":"音乐","film":"电影","tea":"茶","wine":"葡萄酒","cocktails":"鸡尾酒","brunch":"早午餐","dessert":"甜点","foreground framing":"前景构图","framing":"构图","melancholy":"忧郁","nostalgic":"怀旧","nostalgia":"怀旧","romance":"浪漫","romantic":"浪漫","cozy":"温馨","dreamy":"梦幻","atmospheric":"氛围感","minimalist":"极简","minimalism":"极简","urban":"都市","independent":"独立","indie":"独立","jazz":"爵士","classic":"经典","vintage":"复古","retro":"复古","drama":"剧情","documentary":"纪录片","coming of age":"成长","slow cinema":"慢电影","neon":"霓虹","night":"夜晚","city":"城市","loneliness":"孤独","love":"爱情","art house":"文艺片","arthouse":"文艺片","literary":"文学","poetry":"诗","folk":"民谣","ambient":"氛围乐","electronic":"电子","pop":"流行","rock":"摇滚","hip hop":"嘻哈","soul":"灵魂乐","coffee":"咖啡","bookstore":"书店","book store":"书店","vinyl":"黑胶","record store":"唱片店","cinema":"影院","museum":"博物馆","gallery":"画廊","cafe":"咖啡馆","bar":"酒吧","park":"公园","adult":"成人","aesthetic minded":"审美取向","ambition":"野心","art versus mundanity":"艺术与世俗","asia":"亚洲","audiobook":"有声书","biography":"传记","biography memoir":"传记回忆录","chillout":"弛放音乐","cinematic":"电影感","classics":"经典","composed":"沉稳","confessional":"自白","contemplative":"沉思","contemporary":"当代","crime":"犯罪","dedicated":"专注","devoted":"虔诚","drama loving":"剧情爱好者","dream pop":"梦幻流行","elegantly":"优雅","emotionally engaged":"情感投入","essays":"随笔","event venue":"活动场地","everyday minimalism":"日常极简","fantasy":"奇幻","fiction":"小说","folk - rock":"民谣摇滚","food":"美食","forbidden desire":"禁忌之恋","fragmentary":"碎片感","friendship":"友情","german literature":"德国文学","germany":"德国","grief":"哀伤","hip - hop":"嘻哈","hipster chic":"潮人时尚","identity":"身份","improvised feel":"即兴感","indie - folk":"独立民谣","indie pop":"独立流行","indie rock":"独立摇滚","intimate":"亲密","introspective":"内省","japanese":"日式","japanese literature":"日本文学","jazz hop":"爵士嘻哈","literature":"文学","live music venue":"现场音乐场地","lounge":"休闲吧","lounge bar":"酒廊酒吧","lyrical":"抒情","mature":"成熟","memoir":"回忆录","memory":"记忆","memory drama":"记忆剧情","moody":"情绪化","movie theater":"电影院","muted":"低饱和","naturalistic":"自然主义","near future":"近未来","novels":"小说","observational":"观察式","obsession":"执念","passionate":"热情","photographic framing":"摄影构图","quiet lyricism":"静谧诗意","repetitive musical motifs":"重复乐句","sci fi romance":"科幻爱情","second chances":"二次机会","sensitive":"敏感","singer & songwriter":"唱作人","soft focus":"柔焦","speculative fiction":"推想小说","stylized":"风格化","sunrise motifs":"日出意象","temporal collage":"时间拼贴","thoughtful":"深思","tourist attraction":"旅游景点","traditional":"传统","travel":"旅行","trip - hop":"神游舞曲","urban alienation":"城市疏离","vulnerability":"脆弱","affair":"婚外情","elegantly composed":"从容雅致","emotional growth":"情感成长","impressionistic":"印象派","intimacy":"亲密感"};
function tagZh(n){ if (typeof LANG === "undefined" || LANG !== "zh") return n; const k=String(n).toLowerCase().trim(); return TAG_ZH[k] || n; }
function seedHTML(tag, cls){
  const o = typeof tag === "object" && tag ? tag : { name: tag };
  const type = o.type || tagType(o.id || o.subtype || o.name);
  const score = o.affinity != null ? scoreText(o.affinity) : (o.score != null ? scoreText(o.score) : "");
  const meta = (type && type !== "vibe" && type !== "氛围" ? '<span class="seed-type">' + esc(type) + "</span>" : "") + (type && score ? " " : "") + (score ? '<span class="num">' + esc(score) + "</span>" : "");
  return '<span class="seed ' + (cls || "") + '"><span class="seed-name" translate="no">' + esc(tagZh(tagPretty(o.name || o.id))) + "</span>" + (meta ? '<span class="seed-meta">' + meta + "</span>" : "") + "</span>";
}
function tagsHTML(tags, colored){
  const list = Array.isArray(tags) ? tags.filter(function(t){ return t != null && String(typeof t === "object" ? (t.name || t.id || "") : t).trim(); }) : [];
  if (!list.length) return "";
  return '<div class="seeds">' + list.map(function(t, i){ return seedHTML(t, colored === false ? "sm" : (i < 3 ? "s" + (i + 1) : "sm")); }).join("") + "</div>";
}

