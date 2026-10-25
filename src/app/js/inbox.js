/* ---------------------------------------------------------------------------
   Inbox
   --------------------------------------------------------------------------- */
function renderInbox(){
  const token = beginView();
  setShell({ title: "Inbox", back: state.lastMain || "#/notes", tabs: false });
  const ac = abortable();

  view.innerHTML =
    '<header class="r7-mast r7-inbox-mast">' +
      '<p class="r7-eyebrow"><span>Unsure</span><span class="r7-sep" aria-hidden="true"></span><span class="inbox-count" data-inbox-count></span></p>' +
      '<h1 class="r7-display"><span>Did I get</span> <em>this right?</em></h1>' +
      '<p class="r7-deck">Sparkling was not sure about these. Keep the guess, pick another, or set it aside.</p>' +
      '<div class="r7-progress" aria-hidden="true"><i data-inbox-progress></i></div>' +
    '</header>' +
    '<div data-inbox-body><div class="skeleton sk-inbox"></div></div>';

  const countEl = view.querySelector("[data-inbox-count]");
  const bodyEl = view.querySelector("[data-inbox-body]");
  let items = [];
  let total = 0;
  let resolved = 0;
  let busy = false;

  function sentenceHTML(sentence, mention){
    const whole = String(sentence || "");
    const needle = String(mention || "");
    if (!needle) return esc(whole);
    let at = whole.indexOf(needle);
    if (at < 0) at = whole.toLowerCase().indexOf(needle.toLowerCase());
    if (at < 0) return esc(whole);
    return esc(whole.slice(0, at)) + "<mark>" + esc(whole.slice(at, at + needle.length)) + "</mark>" + esc(whole.slice(at + needle.length));
  }
  function emptyHTML(){
    return '<div class="done-wrap">' +
      '<p class="done-title">Nothing to look at.</p>' +
      '<p class="done-copy">' + esc(t("Sparkling was sure about everything lately.")) + '</p>' +
      '<div class="inbox-how" style="max-width:300px;margin:4px auto 22px;padding:14px 16px;border:1px solid var(--b-line);border-radius:18px;background:var(--b-card);text-align:left">' +
        '<p class="inbox-how-lead" style="margin:0 0 6px;font:500 14px/20px var(--sans);color:var(--b-ink)">' + esc(t("Sparkling never guesses silently.")) + '</p>' +
        '<p class="inbox-how-copy" style="margin:0;font:400 13px/19px var(--sans);color:var(--b-ink2)">' + esc(t("When a name could mean two things, like Margaret (a singer and a 2011 film), it waits here for you to pick.")) + '</p>' +
      '</div>' +
      '<button class="btn btn-sm" type="button" data-nav="#/notes">Back to your notes</button>' +
    "</div>";
  }
  function doneHTML(){
    return '<div class="done-wrap">' +
      '<p class="done-title">That’s everything.</p>' +
      '<p class="done-copy">Anything less certain will wait here when it needs you.</p>' +
      '<button class="btn btn-sm" type="button" data-nav="#/notes">Back to your notes</button>' +
    "</div>";
  }
  function itemHTML(item){
    const seen = {};
    const guesses = (Array.isArray(item.guesses) ? item.guesses : []).filter(function(g){ const k = String(g.name||'').toLowerCase()+'|'+guessMeta(g); if (seen[k]) return false; seen[k] = 1; return true; });
    const best = guesses[0] || null;
    const alternatives = guesses.slice(1, 3);
    const bestHTML = best
      ? '<div class="guess-best">' +
          '<span class="guess-name">' + esc(best.name || "Unnamed") + "</span>" +
          '<span class="guess-meta">' + esc(guessMeta(best)) + "</span>" +
          (item.reason ? '<span class="guess-meta guess-reason" style="display:block;margin-top:4px">' + reasonHtml(item.reason) + "</span>" : "") +
        "</div>"
      : '<p class="compact-empty">No close match this time.</p>';
    const altHTML = alternatives.length
      ? '<p class="or-label">Or</p>' + alternatives.map(function(guess){
          return '<button class="alt-guess" type="button" data-inbox-pick data-qloo-id="' + attr(guess.qloo_id) + '">' +
            '<span class="alt-name">' + esc(guess.name || "Unnamed") + "</span>" +
            '<span class="alt-meta">' + esc(guessMeta(guess)) + "</span>" +
          "</button>";
        }).join("")
      : "";
    return '<div class="inbox-stack" data-left="' + items.length + '"><article class="inbox-card">' +
      '<p class="sentence">' + sentenceHTML(item.sentence, item.mention) + "</p>" +
      '<p class="didyoumean">Did you mean</p>' +
      bestHTML +
      altHTML +
      '<p class="inline-error" data-inbox-error role="alert" hidden></p>' +
      '<button class="pk-else" type="button" data-inbox-else><span aria-hidden="true">/</span>' + esc(t("Something else")) + "</button>" +
      '<div class="inbox-actions">' +
        '<button class="btn btn-primary" type="button" data-inbox-yes' + (best ? "" : " disabled") + ">Yes, that</button>" +
        '<button class="btn btn-outline" type="button" data-inbox-no>Not a thing</button>' +
        '<button class="text-btn" type="button" data-inbox-keep>' + esc(t("Keep as my own thing")) + '</button>' +
      "</div>" +
      (items.length > 1 ? '<div class="keep-all"><button class="text-btn" type="button" data-inbox-keepall>Keep all guesses</button></div>' : "") +
    "</article></div>";
  }
  function upNextHTML(){
    const rest = items.slice(1, 5);
    if (!rest.length) return "";
    return '<section class="r7-upnext"><h3 class="r7-section"><span>Up next</span><span class="r7-count num">' + esc(String(items.length - 1)) + '</span></h3>' +
      '<ol class="r7-upnext-list">' + rest.map(function(item, i){
        const g = (Array.isArray(item.guesses) ? item.guesses : [])[0];
        return '<li><span class="r7-upnext-n num">' + String(resolved + i + 2).padStart(2, "0") + '</span>' +
          '<span class="r7-upnext-body"><span class="r7-upnext-q" translate="no">' + sentenceHTML(item.sentence, item.mention) + '</span>' +
          (g ? '<span class="r7-upnext-g"><span>Guess</span> <b translate="no">' + esc(g.name || "Unnamed") + '</b></span>' : "") + '</span></li>';
      }).join("") + (items.length > 5 ? '<li class="r7-upnext-more"><span>' + esc("+" + (items.length - 5) + " more") + '</span></li>' : "") +
      '</ol></section>';
  }
  function syncBadge(){
    state.inboxCount = items.length;
    updateInboxBadge();
  }
  function paint(){
    if (!bodyEl) return;
    if (!items.length) {
      if (countEl) countEl.textContent = "";
      const mast = view.querySelector(".r7-inbox-mast"); if (mast) mast.hidden = true;
      bodyEl.innerHTML = resolved > 0 ? doneHTML() : emptyHTML();
      syncBadge();
      return;
    }
    if (countEl) countEl.textContent = Math.min(resolved + 1, total) + " of " + total;
    const bar = view.querySelector("[data-inbox-progress]");
    if (bar) bar.style.width = Math.round(100 * resolved / Math.max(1, total)) + "%";
    bodyEl.innerHTML = itemHTML(items[0]) + '<p class="fx-swipe-hint">' + esc(t("Swipe right to keep · left if it is not a thing")) + "</p>" + upNextHTML();
    syncBadge();
  }
  function disableCurrent(){
    const cardEl = bodyEl.querySelector(".inbox-card");
    if (!cardEl) return;
    Array.prototype.forEach.call(cardEl.querySelectorAll("button"), function(button){ button.disabled = true; });
  }
  function showActionError(message){
    const err = bodyEl.querySelector("[data-inbox-error]");
    if (err) {
      err.textContent = message || t("That did not go through. Try again.");
      err.hidden = false;
    }
    const cardEl = bodyEl.querySelector(".inbox-card");
    if (cardEl) Array.prototype.forEach.call(cardEl.querySelectorAll("button"), function(button){ button.disabled = false; });
  }

  async function act(action, qlooId, picked){
    if (busy || !items.length) return;
    const item = items[0];
    busy = true;
    disableCurrent();
    try {
      const body = { action: action };
      if (action === "accept" && qlooId) body.qloo_id = qlooId;
      if (action === "accept" && picked) { body.pick = true; body.type = picked.type; }
      const data = await api("/api/inbox/" + encodeURIComponent(item.id), { method: "POST", body: body });
      if (data && data.error) throw new Error(data.error);
      if (!isCurrent(token)) return;
      items = items.filter(function(x){ return String(x.id) !== String(item.id); });
      resolved += 1;
      busy = false;
      paint();
      refreshMe();
      toast(action === "reject" ? "Set aside." : "Kept.", {
        actionLabel: "Undo",
        duration: 10000,
        onAction: function(){ undo(item.id); },
      });
    } catch (e) {
      if (!isCurrent(token)) return;
      busy = false;
      showActionError(e && e.message === "not found"
        ? "That item is no longer here. It may have been handled already."
        : t("That did not go through. Try again."));
    }
  }

  async function keepAll(){
    if (busy || !items.length) return;
    busy = true;
    disableCurrent();
    try {
      const data = await api("/api/inbox/accept_all", { method: "POST" });
      if (data && data.error) throw new Error(data.error);
      if (!isCurrent(token)) return;
      const count = items.length;
      items = [];
      resolved += count;
      busy = false;
      paint();
      refreshMe();
      toast("All guesses kept.");
    } catch (e) {
      if (!isCurrent(token)) return;
      busy = false;
      showActionError(t("That did not go through. Try again."));
    }
  }

  async function undo(itemId){
    try {
      const data = await api("/api/inbox/" + encodeURIComponent(itemId), { method: "POST", body: { action: "undo" } });
      if (data && data.error) throw new Error(data.error);
      if (!isCurrent(token)) return;
      await load({ quiet: true });
      toast("Back in the pile.");
    } catch (e) {
      if (!isCurrent(token)) return;
      toast("That could not be undone.");
      load({ quiet: true });
    }
  }

  async function load(opts){
    const quiet = !!(opts && opts.quiet);
    if (!quiet) {
      if (countEl) countEl.textContent = "";
      if (bodyEl) bodyEl.innerHTML = '<div class="skeleton sk-inbox"></div>';
    }
    try {
      const data = await api("/api/inbox", { signal: ac.signal });
      if (!isCurrent(token)) return;
      items = Array.isArray(data && data.items) ? data.items : [];
      total = items.length;
      resolved = 0;
      paint();
    } catch (e) {
      if (!isCurrent(token) || isAbort(e)) return;
      if (quiet) {
        toast("The inbox did not refresh.");
        return;
      }
      if (bodyEl) {
        bodyEl.innerHTML = errorBlock("The inbox did not load. Check your connection, then try again.", "inbox");
      }
    }
  }

  on(view, "click", function(e){
    const pick = e.target.closest("[data-inbox-pick]");
    if (pick) { act("accept", pick.getAttribute("data-qloo-id")); return; }
    if (e.target.closest("[data-inbox-yes]")) {
      const best = items[0] && Array.isArray(items[0].guesses) ? items[0].guesses[0] : null;
      if (best) act("accept", best.qloo_id);
      return;
    }
    if (e.target.closest("[data-inbox-no]")) { act("reject"); return; }
    if (e.target.closest("[data-inbox-keep]")) { act("keep"); return; }
    if (e.target.closest("[data-inbox-else]")) {
      const it = items[0]; if (!it || !window.Picker) return;
      Picker.open({ mode: "sheet", title: "Which one did you mean?", query: it.mention || "", onPick: function(r){ act("accept", r.qloo_id, r); } });
      return;
    }
    if (e.target.closest("[data-inbox-keepall]")) { keepAll(); }
  });
  bindRetries({ inbox: load });
  load();
}



