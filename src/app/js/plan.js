/* ---------------------------------------------------------------------------
   Plan request (screen 8)
   --------------------------------------------------------------------------- */
/* Plan presets: one tap fills the composer. The chips themselves live under the form. */
function planPreset(name){
  if (name === "out") return { mode: "out", when: "Saturday afternoon", area: "Greenpoint", budget: 40, text: "" };
  if (name === "in") return { mode: "in", when: "", area: "", budget: null, text: "I want to watch a film" };
  return null;
}
function renderPlanRequest(){
  const token = beginView();
  setShell({ title: "Plan", tabs: true, active: "plan" });
  view.className = "view";
  const ac = abortable();

  const user = state.user || {};
  const prefill = takePlanPrefill();
  let mood = "familiar", lens = "";
  let period = "all";
  let busy = false;
  /* stayin: Go out / Stay in. Follows the ask until the user taps the toggle. */
  let mode = stayIntent(prefill).mode === "in" ? "in" : "out", modeLocked = false;
  const whenVal = LANG === "zh" ? trZh(String(user.when || "")) : String(user.when || "");

  function moodButtonHTML(value, label){
    return '<button class="mood" type="button" data-mood="' + attr(value) + '" aria-pressed="' + (value === mood ? "true" : "false") + '">' + esc(label) + "</button>";
  }
  function logPanelHTML(){
    return '<div class="log-panel" role="status">' +
      '<div class="log-head"><div>' +
        '<p class="log-status"><span class="live-dot" aria-hidden="true"></span>Looking through your cards</p>' +
        '<p class="log-sub">About 30 seconds</p>' +
      "</div></div>" +
      '<ul class="log-lines" data-log-lines></ul>' +
    "</div>";
  }
  function planErrorHTML(stateName, text){
    if (stateName === "no_area") {
      return '<div class="plan-error" role="alert">' +
        '<p class="plan-error-title">Where would you like to spend an afternoon?</p>' +
        '<p class="plan-error-copy">A neighbourhood is enough. GPS is optional.</p>' +
        '<div class="plan-error-actions">' +
          '<input class="inline-input area-input" data-error-area aria-label="Neighbourhood" placeholder="Greenpoint">' +
          '<button class="btn btn-primary btn-sm" type="button" data-error-area-go>Make a plan</button>' +
        "</div>" +
      "</div>";
    }
    if (stateName === "too_few") {
      return '<div class="plan-error" role="alert">' +
        '<p class="plan-error-title">A few more things would help.</p>' +
        '<p class="plan-error-text">' + esc(text || "I need a few more things you love to plan from.") + "</p>" +
        '<p class="plan-error-copy">Mark a couple of cards with a heart, then try again.</p>' +
        '<div class="plan-error-actions"><button class="btn btn-sm" type="button" data-nav="#/cards">Go to Cards</button></div>' +
      "</div>";
    }
    return '<div class="plan-error" role="alert">' +
      '<p class="plan-error-title">That plan did not come together.</p>' +
      (text ? '<p class="plan-error-text">' + esc(text) + "</p>" : "") +
      '<div class="plan-error-actions"><button class="btn btn-sm" type="button" data-retry="plan">Try again</button></div>' +
    "</div>";
  }

  view.classList.add('plan-input-view');
  view.innerHTML =
    '<h2 class="plan-prompt">An afternoon, built from what you keep.</h2>' +
    '<form class="plan-form" data-plan-form data-mode-now="' + mode + '" novalidate>' +
      '<div class="mode-row"><div class="mode-toggle" role="group" aria-label="Go out or stay in">' +
        '<button type="button" class="mode-opt" data-plan-mode="out" aria-pressed="' + (mode === "out") + '">Go out</button>' +
        '<button type="button" class="mode-opt" data-plan-mode="in" aria-pressed="' + (mode === "in") + '">Stay in</button>' +
      '</div><span class="mode-hint" data-mode-hint' + (mode === "in" && prefill ? "" : " hidden") + '>Picked from what you wrote</span></div>' +
      '<div class="plan-sentence">' +
        "<span>On</span>" +
        '<input class="inline-input when-input" data-when aria-label="When" placeholder="Saturday afternoon" value="' + attr(whenVal) + '">' +
        '<span class="out-only" data-out-only' + (mode === "in" ? " hidden" : "") + '>' +
        '<span class="sep" aria-hidden="true">&middot;</span>' +
        "<span>around</span>" +
        '<input class="inline-input area-input" data-area aria-label="Area" placeholder="Greenpoint" value="' + attr(user.area || "") + '">' +
        '</span><span class="out-only" data-out-only' + (mode === "in" ? " hidden" : "") + '>' +
        '<span class="sep" aria-hidden="true">&middot;</span>' +
        "<span>under $</span>" +
        '<input class="inline-input budget-input" data-budget inputmode="numeric" aria-label="Budget" placeholder="40" value="' + attr(user.budget == null ? "" : user.budget) + '">' +
      "</span></div>" +
      '<div class="mood-row" role="group" aria-label="Mood">' +
        moodButtonHTML("familiar", "Familiar") +
        moodButtonHTML("different", "A little different") +
        moodButtonHTML("surprise", "Surprise me") +
        '</div><div class="mood-row" role="group" aria-label="Which you">' +
        [["all","All of you"],["now","Recent you"],["then","Earlier you"]].map(function(x){return '<button class="mood" type="button" data-period="'+x[0]+'" aria-pressed="'+(x[0]===period?"true":"false")+'">'+x[1]+'</button>';}).join("") +
      "</div>" +
      '<div class="mood-row" role="group" aria-label="Lens (optional)"><span class="lens-l">Lens, optional</span>' +
        [["",LANG === "zh" ? "不限" : "None"],["photography","Photographers"],["arts_crafts","Arts & crafts"],["musician","Musicians"],["hiking","Hikers"],["meditation","Meditators"]].map(function(x){return '<button class="mood" type="button" data-lens="'+x[0]+'" aria-pressed="'+(x[0]===lens?"true":"false")+'">'+x[1]+'</button>';}).join("") +
      "</div>" +
      '<div class="free-line">' +
        '<input class="free-input" data-free aria-label="Anything else?" placeholder="A quiet bookstore, then somewhere to sit" value="' + attr(prefill) + '">' +
      "</div>" +
      '<div class="plan-submit"><button class="btn btn-primary btn-block" type="submit" data-make-plan>Make a plan</button></div>' +
      '<div class="duo-box" data-out-only' + (mode === "in" ? " hidden" : "") + '><button class="btn btn-sm" type="button" data-duo-go>' + esc(t("Plan for two · try with a sample friend")) + '</button><div data-duo-out></div></div>' +
      '<div data-plan-progress></div>' +
      '<div data-plan-error></div>' +
    "</form>" +
    '<div class="mood-row plan-presets" role="group" aria-label="Quick starts">' +
      '<button class="plan-preset mood" type="button" data-plan-preset="out" style="height:auto;white-space:normal;text-align:left;padding:8px 12px;line-height:1.35">' + esc(t("Saturday afternoon in Greenpoint, $40")) + "</button>" +
      '<button class="plan-preset mood" type="button" data-plan-preset="in" style="height:auto;white-space:normal;text-align:left;padding:8px 12px;line-height:1.35">' + esc(t("I want to watch a film")) + "</button>" +
    "</div>" +
    '<div class="plan-ideas"><p class="plan-ideas-h">Try one of these</p>' +
    ["A quiet bookstore, then somewhere to sit","A record shop and a slow coffee","An old cinema, then a late bite"].map(function(t){return '<button type="button" class="plan-idea" data-idea="'+attr(t)+'" data-out-only' + (mode === "in" ? " hidden" : "") + '>'+esc(t)+'</button>';}).join("") +
    ["A film for tonight, from my notes","An album to put on while I cook","A book for a slow Sunday"].map(function(t){return '<button type="button" class="plan-idea" data-idea="'+attr(t)+'" data-in-only' + (mode === "out" ? " hidden" : "") + '>'+esc(t)+'</button>';}).join("") +
    "</div>" +
    "<div data-saved-plans></div>";

  view.querySelectorAll("[data-idea]").forEach(function(b){b.addEventListener("click",function(){var f=view.querySelector("[data-free]");f.value=b.getAttribute("data-idea");followAsk();f.focus();});});
  const form = view.querySelector("[data-plan-form]");
  function setMode(next, auto){
    mode = next === "in" ? "in" : "out";
    if (form) form.setAttribute("data-mode-now", mode);
    view.querySelectorAll("[data-plan-mode]").forEach(function(b){ b.setAttribute("aria-pressed", b.getAttribute("data-plan-mode") === mode ? "true" : "false"); });
    view.querySelectorAll("[data-out-only]").forEach(function(el){ el.hidden = mode === "in"; });
    view.querySelectorAll("[data-in-only]").forEach(function(el){ el.hidden = mode !== "in"; });
    const hint = view.querySelector("[data-mode-hint]"); if (hint) hint.hidden = !auto;
    if (mode === "in") { const es = view.querySelector("[data-plan-error]"); if (es && es.querySelector("[data-error-area]")) es.innerHTML = ""; }
  }
  function followAsk(){
    if (modeLocked) return;
    const f = view.querySelector("[data-free]"); const it = stayIntent(f ? f.value : "");
    if (it.mode) setMode(it.mode, it.mode === "in"); else if (mode === "in") setMode("out", false);
  }
  view.querySelectorAll("[data-plan-mode]").forEach(function(b){ b.addEventListener("click", function(){ modeLocked = true; setMode(b.getAttribute("data-plan-mode"), false); }); });
  (function(){ const f = view.querySelector("[data-free]"); if (f) f.addEventListener("input", followAsk); })();
  const whenInput = view.querySelector("[data-when]");
  const areaInput = view.querySelector("[data-area]");
  const budgetInput = view.querySelector("[data-budget]");
  const freeInput = view.querySelector("[data-free]");
  const planBtn = view.querySelector("[data-make-plan]");
  const progressSlot = view.querySelector("[data-plan-progress]");
  const errSlot = view.querySelector("[data-plan-error]");
  const savedSlot = view.querySelector("[data-saved-plans]");
  const duoBtn = view.querySelector("[data-duo-go]");
  function applyPreset(p){
    if (!p) return;
    modeLocked = true;
    setMode(p.mode, false);
    if (p.when && whenInput) whenInput.value = p.when;
    if (p.area && areaInput) areaInput.value = p.area;
    if (p.budget != null && budgetInput) budgetInput.value = String(p.budget);
    if (p.text && freeInput) freeInput.value = t(p.text);
    const hint = view.querySelector("[data-mode-hint]"); if (hint) hint.hidden = true;
    const focusEl = p.mode === "in" ? freeInput : whenInput;
    if (focusEl) { try { focusEl.focus(); } catch (_) {} }
  }
  if (duoBtn) duoBtn.addEventListener("click", async function(){
    const out = view.querySelector("[data-duo-out]");
    duoBtn.disabled = true; out.innerHTML = '<p class="duo-note">' + esc(t("Weighing both notebooks…")) + "</p>";
    try {
      const r = await api("/api/duo", { method: "POST", body: { area: (areaInput.value || "").trim(), partner_ids: ["0F920838-D245-440D-B52E-2C045BEEFEE9","19DF9974-2931-42F7-AF6F-DC29B9E17974","28D688C4-0760-4042-BEC1-F6EE75E71CC7"] } });
      const bar = function(v){ return '<span class="duo-bar"><i style="width:' + Math.round(Math.min(1, v || 0) * 100) + '%"></i></span>'; };
      out.innerHTML = '<p class="duo-note">Chosen by our fairness rule: best for whoever likes it least.</p><ol class="duo-list">' +
        (r.picks || []).map(function(p){ return '<li><b>' + esc(p.name) + '</b><span>You ' + bar(p.scoreA) + '</span><span>Them ' + bar(p.scoreB) + '</span></li>'; }).join("") + '</ol>';
    } catch (e) { out.innerHTML = '<p class="duo-note">' + esc(t("Could not plan for two just now.")) + "</p>"; }
    duoBtn.disabled = false;
  });

  function appendLog(linesEl, text){
    if (!linesEl || !isCurrent(token)) return;
    const li = document.createElement("li");
    li.className = "log-line";
    li.textContent = String(text);
    linesEl.appendChild(li);
    linesEl.scrollTop = linesEl.scrollHeight;
  }
  function showPlanError(stateName, text){
    if (!isCurrent(token)) return;
    progressSlot.innerHTML = "";
    if (stateName === "no_area" && mode === "in") stateName = null; /* stay-in never asks where */
    errSlot.innerHTML = planErrorHTML(stateName, text);
    if (stateName === "no_area") {
      const input = errSlot.querySelector("[data-error-area]");
      if (input) setTimeout(function(){ try { input.focus(); } catch (_) {} }, 30);
    }
  }
  function finishSubmit(){
    busy = false;
    if (isCurrent(token)) {
      planBtn.disabled = false;
      planBtn.textContent = "Make a plan";
    }
  }
  async function submitPlan(){
    if (busy) return;
    const when = whenInput ? whenInput.value.trim() : "";
    const area = areaInput ? areaInput.value.trim() : "";
    const budgetRaw = budgetInput ? budgetInput.value.trim() : "";
    const text = freeInput ? freeInput.value.trim() : "";
    busy = true;
    errSlot.innerHTML = "";
    progressSlot.innerHTML = logPanelHTML();
    planBtn.disabled = true;
    planBtn.textContent = "Making a plan";
    const body = { mood: mood, period: period, mode: mode };
    if (lens) body.audience = lens;
    if (LANG === "zh") body.lang = "zh";
    if (when) body.when = when;
    if (area && mode !== "in") body.area = area;
    const budgetN = numberValue(budgetRaw);
    if (mode !== "in" && budgetRaw && budgetN !== null) body.budget = budgetN;
    if (text) body.text = text;
    body.lang = LANG === "zh" ? "zh" : "en";
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        let msg = "";
        try { const d = await res.json(); msg = d && d.error; } catch (_) {}
        throw new Error(msg || ("Request failed (" + res.status + ")"));
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const linesEl = progressSlot.querySelector("[data-log-lines]");
      let buffer = "";
      let done = false;
      while (!done) {
        const step = await reader.read();
        done = !!step.done;
        buffer += decoder.decode(step.value || new Uint8Array(0), { stream: !done });
        const parts = buffer.split(/\r?\n/);
        buffer = parts.pop();
        for (let i = 0; i < parts.length; i++) {
          const raw = parts[i].trim();
          if (!raw) continue;
          let msg = null;
          try { msg = JSON.parse(raw); } catch (_) { continue; }
          if (!msg || typeof msg !== "object") continue;
          if (msg.type === "log" && msg.text) {
            appendLog(linesEl, msg.text);
          } else if (msg.type === "plan" && msg.plan && msg.plan.id) {
            cachePlan(msg.plan);
            finishSubmit();
            go("#/plan/" + encodeURIComponent(String(msg.plan.id)));
            return;
          } else if (msg.type === "error") {
            showPlanError(msg.state, msg.text);
            finishSubmit();
            return;
          }
        }
      }
      showPlanError(null, t("The plan stream ended before a plan arrived."));
    } catch (e) {
      if (!isAbort(e) && isCurrent(token)) showPlanError(null, (e && e.message) || "That did not work. Try again.");
    } finally {
      finishSubmit();
    }
  }

  async function loadSaved(){
    if (!savedSlot) return;
    savedSlot.innerHTML = '<div class="skeleton sk-line w40"></div><div class="skeleton sk-line w60"></div><div class="skeleton sk-line w80"></div>';
    let data;
    try {
      data = await api("/api/plans", { signal: ac.signal });
    } catch (e) {
      if (!isCurrent(token) || isAbort(e)) return;
      savedSlot.innerHTML = '<div class="compact-error">' + esc(t("Your saved plans did not load.")) + ' <button class="text-btn" type="button" data-retry="saved">Try again</button></div>';
      return;
    }
    if (!isCurrent(token)) return;
    const plans = Array.isArray(data && data.plans) ? data.plans : [];
    if (!plans.length) { savedSlot.innerHTML = ""; return; }
    savedSlot.innerHTML =
      '<div class="saved-title"><h3 class="section-label">Saved plans</h3><span class="label num">' + plans.length + "</span></div>" +
      '<div class="saved-list">' + plans.map(savedPlanHTML).join("") + "</div>";
  }
  function savedPlanHTML(plan){
    const stops = Array.isArray(plan.stops) && plan.stops.length ? plan.stops : Array.isArray(plan.picks) ? plan.picks : [];
    const names = stops.map(function(s){ return s && s.name; }).filter(Boolean).join(" · ");
    const when = Number(plan.saved_at || plan.created_at);
    return '<button class="saved-plan" type="button" data-nav="' + attr("#/plan/" + encodeURIComponent(String(plan.id))) + '">' +
      '<span class="saved-plan-main">' +
        '<span class="saved-plan-head">' + esc(plan.header || names || "Untitled plan") + "</span>" +
        (names ? '<span class="saved-plan-stops">' + esc(names) + "</span>" : "") +
        (Number.isFinite(when) ? '<span class="saved-plan-date">' + esc(formatDate(when)) + "</span>" : "") +
      "</span>" +
      '<span class="saved-plan-chev">' + icons.chevron + "</span>" +
    "</button>";
  }

  on(view, "click", function(e){
    const presetBtn = e.target.closest("[data-plan-preset]");
    if (presetBtn) {
      applyPreset(planPreset(presetBtn.getAttribute("data-plan-preset")));
      return;
    }
    const perBtn = e.target.closest("[data-period]");
    if (perBtn) {
      period = perBtn.getAttribute("data-period");
      Array.prototype.forEach.call(view.querySelectorAll("[data-period]"), function(b){ b.setAttribute("aria-pressed", b === perBtn ? "true" : "false"); });
      return;
    }
    const lensBtn = e.target.closest("[data-lens]");
    if (lensBtn) {
      lens = lensBtn.getAttribute("data-lens");
      Array.prototype.forEach.call(view.querySelectorAll("[data-lens]"), function(b){ b.setAttribute("aria-pressed", b === lensBtn ? "true" : "false"); });
      return;
    }
    const moodBtn = e.target.closest("[data-mood]");
    if (moodBtn) {
      mood = moodBtn.getAttribute("data-mood");
      Array.prototype.forEach.call(view.querySelectorAll("[data-mood]"), function(b){
        b.setAttribute("aria-pressed", b === moodBtn ? "true" : "false");
      });
      return;
    }
    if (e.target.closest("[data-error-area-go]")) {
      const input = errSlot.querySelector("[data-error-area]");
      const value = input ? input.value.trim() : "";
      if (!value) { if (input) input.focus(); return; }
      if (areaInput) areaInput.value = value;
      api("/api/me", { method: "PATCH", body: { area: value } })
        .then(function(d){ if (d && d.user) state.user = d.user; })
        .catch(function(){});
      submitPlan();
    }
  });
  if (form) form.addEventListener("submit", function(e){ e.preventDefault(); submitPlan(); });
  bindRetries({ plan: submitPlan, saved: loadSaved });
  loadSaved();
}

