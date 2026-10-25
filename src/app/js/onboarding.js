/* ---------------------------------------------------------------------------
   Letterboxd import (shared by onboarding and settings)
   --------------------------------------------------------------------------- */
function importDetailsHTML(){
  return '<details class="fold">' +
    "<summary>How to get your export</summary>" +
    '<div class="fold-body">' +
      "<ol>" +
        "<li>Open Letterboxd on the web and sign in.</li>" +
        "<li>Go to Settings, then Import and export.</li>" +
        "<li>Choose Export your data and download the zip.</li>" +
        "<li>Unzip it, then choose diary.csv here.</li>" +
      "</ol>" +
      "<p>We read titles, dates, rewatches and your review text. The file is discarded after import. We do not read your password, profile or social graph.</p>" +
    "</div>" +
  "</details>";
}
function importBlockHTML(intro){
  return '<div class="import-block" data-import-block>' +
    (intro ? '<p class="import-intro">' + esc(intro) + "</p>" : "") +
    '<input class="file-input-hidden" type="file" accept=".csv,.zip,text/csv,application/zip" data-import-file tabindex="-1" aria-hidden="true">' +
    '<div class="import-row">' +
      '<button class="btn btn-sm" type="button" data-import-choose>Choose your export file</button>' +
      '<span class="file-name" data-import-name>' + t("No file chosen") + '</span>' +
    "</div>" +
    '<div class="import-row">' +
      '<button class="btn btn-primary btn-sm" type="button" data-import-submit disabled>Import file</button>' +
    "</div>" +
    '<p class="import-busy" data-import-status role="status" hidden></p>' +
    '<div data-import-result></div>' +
    importDetailsHTML() +
  "</div>";
}
function importResultHTML(data){
  const read = Number(data && data.read) || 0;
  const cards = Number(data && data.cards) || 0;
  const inbox = Number(data && data.inbox) || 0;
  const notes = Number(data && data.notes) || 0;
  const title = read > 0 ? "Your history is in." : "Nothing was read from that file.";
  const copy = read > 0
    ? "Titles with dates become footprints. Anything less certain waits for you in the inbox."
    : "Try the diary.csv file from your Letterboxd export. Nothing was added.";
  return '<div class="import-result" role="status">' +
    '<p class="import-result-title">' + esc(title) + "</p>" +
    '<p class="import-result-copy">' + esc(copy) + "</p>" +
    '<div class="import-stats">' +
      '<div class="stat"><span class="stat-num">' + read + '</span><span class="stat-label">entries read</span></div>' +
      '<div class="stat"><span class="stat-num">' + cards + '</span><span class="stat-label">became cards</span></div>' +
      '<div class="stat"><span class="stat-num">' + inbox + '</span><span class="stat-label">waiting for a look</span></div>' +
      '<div class="stat"><span class="stat-num">' + notes + '</span><span class="stat-label">kept as notes</span></div>' +
    "</div>" +
    '<div class="result-actions">' +
      '<button class="btn btn-sm" type="button" data-nav="#/cards">See your cards</button>' +
      '<button class="btn btn-sm" type="button" data-nav="#/inbox">Look at the inbox</button>' +
      '<button class="btn btn-sm" type="button" data-nav="#/notes">Notes</button>' +
    "</div>" +
  "</div>";
}
function wireImport(container, options){
  const opts = options || {};
  if (!container) return;
  const input = container.querySelector("[data-import-file]");
  const choose = container.querySelector("[data-import-choose]");
  const submit = container.querySelector("[data-import-submit]");
  const nameEl = container.querySelector("[data-import-name]");
  const statusEl = container.querySelector("[data-import-status]");
  const resultEl = container.querySelector("[data-import-result]");
  let file = null;
  let busy = false;

  function setName(){
    if (!nameEl) return;
    nameEl.textContent = file ? file.name : t("No file chosen");
  }
  if (choose && input) {
    choose.addEventListener("click", function(){ if (!busy) input.click(); });
  }
  if (input) {
    input.addEventListener("change", function(){
      const f = input.files && input.files[0] ? input.files[0] : null;
      if (!f) return;
      file = f;
      setName();
      if (submit) submit.disabled = false;
      if (statusEl) { statusEl.hidden = true; statusEl.textContent = ""; statusEl.className = "import-busy"; }
      if (resultEl) resultEl.innerHTML = "";
    });
  }
  if (submit) {
    submit.addEventListener("click", async function(){
      if (busy || !file) return;
      busy = true;
      submit.disabled = true;
      if (choose) choose.disabled = true;
      if (statusEl) {
        statusEl.hidden = false;
        statusEl.className = "import-busy";
        statusEl.textContent = t("Reading your file. You can leave this screen while it works.");
      }
      if (resultEl) resultEl.innerHTML = "";
      try {
        const fd = new FormData();
        fd.append("file", file, file.name || "letterboxd.csv");
        const data = await api("/api/import/letterboxd", { method: "POST", body: fd });
        if (statusEl) { statusEl.hidden = true; statusEl.textContent = ""; }
        if (resultEl) resultEl.innerHTML = importResultHTML(data || {});
        await refreshMe();
        if (typeof opts.onDone === "function") opts.onDone(data || {});
      } catch (e) {
        if (statusEl) {
          statusEl.hidden = false;
          statusEl.className = "import-error";
          statusEl.textContent = e.status === 404
            ? "The import is not available right now. Try again in a little while."
            : e.status === 413
              ? "That file is too large to read here."
              : "That file did not go through. Try the diary.csv file from your export.";
        }
        if (submit) submit.disabled = false;
      } finally {
        busy = false;
        if (choose) choose.disabled = false;
      }
    });
  }
}

/* ---------------------------------------------------------------------------
   Onboarding
   --------------------------------------------------------------------------- */
async function retryBootFromOnboarding(button){
  if (button) { button.disabled = true; button.textContent = t("Trying again"); }
  try {
    const me = await api("/api/me");
    if (!me || !me.user) throw new Error("no session");
    state.user = me.user;
    state.inboxCount = Number(me.inbox_count) || 0;
    state.bootError = null;
    state.bootNotice = null;
    go("#/notes");
  } catch (e) {
    if (e.status !== 401) state.bootError = "Your notebook could not be reached just now. Try again in a moment.";
    else { state.bootError = null; state.bootNotice = null; }
    renderOnboarding();
  }
}
function onboardingChoiceHTML(key, title, support){
  return '<button class="choice" type="button" data-choice="' + attr(key) + '">' +
    '<span class="choice-copy"><span class="choice-title">' + esc(title) + '</span><span class="choice-sub">' + esc(support) + "</span></span>" +
    '<span class="choice-chev">' + icons.chevron + "</span>" +
  "</button>";
}
/* onboard-lang: welcome-screen language switch; shows the other language's own name, never run through the zh DOM pass */
function onboardLangHTML(){
  const zh = LANG === "zh";
  return '<button class="onboard-lang" type="button" data-onboard-lang translate="no" lang="' + (zh ? "en" : "zh-CN") + '" aria-label="' + (zh ? "Switch to English" : "\u5207\u6362\u5230\u4e2d\u6587") + '">' + (zh ? "English" : "\u4e2d\u6587") + "</button>";
}
function switchOnboardLang(){
  const next = LANG === "zh" ? "en" : "zh";
  const booted = state.booted;
  state.booted = false; /* setLang would route(); stay on this screen instead */
  try { setLang(next); } finally { state.booted = booted; }
  renderOnboarding();
  applyLang();
  const b = view.querySelector("[data-onboard-lang]");
  if (b) try { b.focus({ preventScroll: true }); } catch (_) {}
}
function renderOnboarding(){
  beginView();
  setShell({ hide: true });
  document.title = "Sparkling";
  view.className = "view onboarding";
  const bootError = state.bootError
    ? '<div class="onboard-error" role="alert"><span>' + esc(state.bootError) + '</span><br><button class="text-btn" type="button" data-retry-boot>Try again</button></div>'
    : "";
  const notice = state.bootNotice
    ? '<p class="onboard-notice">' + esc(state.bootNotice) + "</p>"
    : "";
  view.innerHTML =
    '<div class="onboard">' +
      '<div class="onboard-top">' +
        '<span class="wordmark"><span class="wordmark-name">Sparkling</span><span class="wordmark-dots" aria-hidden="true"><span class="wordmark-dot"></span><span class="wordmark-dot"></span><span class="wordmark-dot"></span></span></span>' +
      "</div>" +
      bootError +
      '<h1 class="onboard-headline">Keep the things that stay with you.</h1>' +
      '<p class="onboard-sub">Write a thought, paste a link, or add a screenshot. Sparkling connects the cultural things you return to.</p>' +
      notice +
      '<div class="choices">' +
        onboardingChoiceHTML("note", "Add your first note", "Start with whatever is on your mind.") +
        onboardingChoiceHTML("sample", "Try a sample notebook", "Look around a made-up notebook first.") +
        onboardingChoiceHTML("history", "Bring some history", "Start from your Letterboxd export.") +
      "</div>" +
      '<p class="onboard-status" data-onboard-status role="status" hidden></p>' +
      '<div class="onboard-foot-row">' +
        '<div class="onboard-foot">Your notes stay yours. Export or delete anytime.</div>' +
        onboardLangHTML() +
      "</div>" +
    "</div>";

  const status = view.querySelector("[data-onboard-status]");
  const choices = Array.prototype.slice.call(view.querySelectorAll(".choice"));
  function setStatus(text, bad){
    if (!status) return;
    status.hidden = !text;
    status.textContent = text || "";
    status.className = "onboard-status" + (bad ? " bad" : "");
  }
  function setBusy(b, text){
    choices.forEach(function(c){ c.disabled = b; });
    if (text) setStatus(text, false);
  }
  async function makeSession(mode, chosen){
    if (state.user) {
      if (mode === "sample" && !state.user.sample) {
        // A deliberate switch from onboarding.
      } else {
        if (mode === "new") state.focusComposer = true;
        go("#/notes");
        return;
      }
    }
    setBusy(true, mode === "sample" ? "Opening the sample notebook." : "Opening a notebook.");
    try {
      const data = await api("/api/session", { method: "POST", body: { mode: mode } });
      if (!data || !data.user) throw new Error("no user");
      state.user = data.user;
      state.inboxCount = 0;
      state.bootError = null;
      state.bootNotice = null;
      state.focusComposer = mode === "new";
      if (chosen !== "history" && mode === "sample") {
        setStatus("Opening the sample notebook.");
        go("#/notes");
        return;
      }
      if (chosen === "history") {
        renderOnboardingImport();
        return;
      }
      go("#/notes");
    } catch (e) {
      setBusy(false, "");
      setStatus("That did not work. Trying again in a moment may help.", true);
    }
  }

  on(view, "click", function(e){
    if (e.target.closest("[data-onboard-lang]")) { switchOnboardLang(); return; }
    const retry = e.target.closest("[data-retry-boot]");
    if (retry) { retryBootFromOnboarding(retry); return; }
    const choice = e.target.closest("[data-choice]");
    if (!choice) return;
    const key = choice.getAttribute("data-choice");
    if (key === "note") makeSession("new", "note");
    else if (key === "sample") makeSession("sample", "sample");
    else if (key === "history") {
      if (state.user) renderOnboardingImport();
      else makeSession("new", "history");
    }
  });
}

function renderOnboardingImport(){
  beginView();
  setShell({ hide: true });
  document.title = "Bring some history · Sparkling";
  view.className = "view onboarding";
  view.innerHTML =
    '<div class="onboard onboard-import">' +
      '<div class="onboard-top">' +
        '<span class="wordmark"><span class="wordmark-name">Sparkling</span><span class="wordmark-dots" aria-hidden="true"><span class="wordmark-dot"></span><span class="wordmark-dot"></span><span class="wordmark-dot"></span></span></span>' +
        '<button class="onboard-back" type="button" data-back-choices><span aria-hidden="true">←</span> Back to choices</button>' +
      "</div>" +
      '<h1 class="onboard-headline">Start from Letterboxd</h1>' +
      '<p class="onboard-sub">We read titles, dates, rewatches and your review text. Nothing is posted anywhere. Unmatched rows are kept as plain notes, never silently dropped.</p>' +
      importBlockHTML("Choose the diary file from your export. It stays on your server and is discarded after the import.") +
      '<div class="onboard-next">' +
        '<button class="btn btn-primary" type="button" data-nav="#/notes">Go to your notes</button>' +
      "</div>" +
      '<div class="onboard-foot">Your notes stay yours. Export or delete anytime.</div>' +
    "</div>";
  wireImport(view.querySelector("[data-import-block]"), {});
  on(view, "click", function(e){
    if (e.target.closest("[data-back-choices]")) renderOnboarding();
  });
}

/* ---------------------------------------------------------------------------
   Local state: drafts, plans to revisit, "did you go"
   --------------------------------------------------------------------------- */
function draftKey(){ return "sparkling.draft." + ((state.user && state.user.id) || "anon"); }
function readDraft(){
  try {
    const raw = localStorage.getItem(draftKey());
    if (!raw) return { text: "", link: "" };
    const data = JSON.parse(raw);
    if (typeof data === "string") return { text: data, link: "" };
    return { text: String(data && data.text || ""), link: String(data && data.link || "") };
  } catch (_) { return { text: "", link: "" }; }
}
function writeDraft(text, link){
  try {
    const key = draftKey();
    if (!text && !link) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify({ text: String(text || ""), link: String(link || "") }));
  } catch (_) {}
}
function clearDraft(){ try { localStorage.removeItem(draftKey()); } catch (_) {} }

function didYouGoKey(){ return "sparkling.didYouGo." + ((state.user && state.user.id) || "anon"); }
function readDidYouGo(){
  try {
    const raw = localStorage.getItem(didYouGoKey());
    if (!raw) return null;
    const rec = JSON.parse(raw);
    if (!rec || typeof rec !== "object" || !rec.plan_id || !rec.place) return null;
    return rec;
  } catch (_) { return null; }
}
function writeDidYouGo(rec){
  try { localStorage.setItem(didYouGoKey(), JSON.stringify(rec)); } catch (_) {}
}
function clearDidYouGo(){ try { localStorage.removeItem(didYouGoKey()); } catch (_) {} }

function planPrefillKey(){ return "sparkling.planPrefill." + ((state.user && state.user.id) || "anon"); }
function takePlanPrefill(){
  try {
    const key = planPrefillKey();
    const v = sessionStorage.getItem(key);
    if (v) sessionStorage.removeItem(key);
    return v || "";
  } catch (_) { return ""; }
}
function putPlanPrefill(text){
  try { sessionStorage.setItem(planPrefillKey(), String(text || "")); } catch (_) {}
}

function planStorageKey(id){ return "sparkling.plan." + ((state.user && state.user.id) || "anon") + "." + String(id); }
function cachePlan(plan){
  if (!plan || !plan.id) return;
  planCache.set(String(plan.id), plan);
  try { sessionStorage.setItem(planStorageKey(plan.id), JSON.stringify(plan)); } catch (_) {}
}
function getCachedPlan(id){
  const key = String(id);
  if (planCache.has(key)) return planCache.get(key);
  try {
    const raw = sessionStorage.getItem(planStorageKey(key));
    if (!raw) return null;
    const plan = JSON.parse(raw);
    if (!plan || !plan.id) return null;
    planCache.set(key, plan);
    return plan;
  } catch (_) { return null; }
}
function clearPlanStorage(){
  planCache.clear();
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.indexOf("sparkling.plan.") === 0) keys.push(k);
    }
    keys.forEach(function(k){ sessionStorage.removeItem(k); });
  } catch (_) {}
}

function composeLinkChipHTML(linkUrl){
  if (!linkUrl) return "";
  return '<span class="link-chip">' + icons.link +
    '<span class="label">' + esc(linkHost(linkUrl)) + "</span>" +
    '<button class="remove" type="button" data-link-remove aria-label="Remove link">' + icons.close + "</button>" +
  "</span>";
}

