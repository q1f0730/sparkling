function renderNotes(){
  const token = beginView();
  setShell({ title: "Notes", tabs: true, active: "notes" });
  view.className = "view";
  const ac = abortable();

  const draft = readDraft();
  let link = safeHttpUrl(draft.link);
  let initialText = String(draft.text || "");
  if (!link) {
    const justUrl = urlOnly(initialText);
    if (justUrl) { link = justUrl; initialText = ""; }
  }

  view.innerHTML =
    '<div data-greeting><div class="skeleton sk-greeting"></div><div class="skeleton sk-greeting short"></div></div>' +
    '<div data-didyougo></div>' +
    '<div class="notes-tools">' +
      '<div class="chips-scroll" data-filter-row>' +
        '<button class="chip" type="button" data-filter="all" aria-pressed="true">All</button>' +
        '<button class="chip" type="button" data-filter="cards" aria-pressed="false">With cards</button>' +
        '<button class="chip" type="button" data-filter="photos" aria-pressed="false">Photos</button>' +
        '<button class="chip" type="button" data-filter="plain" aria-pressed="false">Plain notes</button>' +
      "</div>" +
      '<button class="search-toggle" type="button" data-search-toggle aria-expanded="false" aria-controls="notes-search-row" aria-label="Search notes">' + icons.search + "</button>" +
    "</div>" +
    '<div class="search-row" id="notes-search-row" hidden>' +
      searchFieldHTML("notes-search", "") +
      '<button class="icon-plain" type="button" data-search-close aria-label="Close search">' + icons.close + "</button>" +
    "</div>" +
    '<div data-notes-list><div class="skeleton sk-note"></div><div class="skeleton sk-note"></div><div class="skeleton sk-note"></div></div>';

  const ta = view.querySelector("[data-compose-text]");
  const saveBtn = view.querySelector("[data-save]");
  const saveError = view.querySelector("[data-save-error]");
  const linkSlot = view.querySelector("[data-link-slot]");
  const listEl = view.querySelector("[data-notes-list]");
  const searchToggle = view.querySelector("[data-search-toggle]");
  const searchRow = view.querySelector("#notes-search-row");
  const searchInput = view.querySelector("#notes-search");
  let searchOpen = false;
  let searchTimer = null;
  let notes = [];
  let baseCount = null;
  let filter = "all";
  let query = "";
  let loading = false;
  let saving = false;
  let loadSeq = 0;
  let greetingNotes = null;
  let greetingCards = null;
  let initialRetry = true;
  let compactGreeting = false;

  function paintLinkChip(){
    if (!linkSlot) return;
    linkSlot.innerHTML = composeLinkChipHTML(link);
    linkSlot.hidden = !link;
  }
  function resizeTextarea(){
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(210, Math.max(55, ta.scrollHeight)) + "px";
  }
  function showSaveError(msg){
    if (!saveError) return;
    saveError.textContent = msg || "";
    saveError.hidden = !msg;
  }
  function persistDraft(){ writeDraft(ta.value, link); }
  function setFilterUI(){
    Array.prototype.forEach.call(view.querySelectorAll("[data-filter]"), function(b){
      b.setAttribute("aria-pressed", b.getAttribute("data-filter") === filter ? "true" : "false");
    });
  }
  function setListLoading(){
    if (!listEl) return;
    listEl.setAttribute("aria-busy", "true");
    listEl.innerHTML = '<div class="skeleton sk-note"></div><div class="skeleton sk-note"></div><div class="skeleton sk-note"></div>';
  }
  function setListError(){
    if (!listEl) return;
    listEl.removeAttribute("aria-busy");
    listEl.innerHTML = errorBlock("Your notes did not load. Check your connection, then try again.", initialRetry ? "initial" : "notes");
  }
  function paintGreeting(){
    const slot = view.querySelector("[data-greeting]");
    if (!slot) return;
    const text = greetingText(greetingNotes, greetingCards);
    const cut = text.indexOf(". ");
    const now = Date.now();
    slot.innerHTML = '<p class="r7-eyebrow r7-notes-eyebrow"><span>Notebook</span><span class="r7-sep" aria-hidden="true"></span><span>' + esc(weekdayShort(now)) + '</span><span>' + esc(formatDate(now)) + '</span></p>' +
      (cut > 0
        ? '<h2 class="greeting r7-greeting"><span>' + esc(text.slice(0, cut + 1)) + "</span>" + (LANG === "zh" ? "" : " ") + "<em>" + esc(text.slice(cut + 2)) + "</em></h2>"
        : '<h2 class="greeting r7-greeting">' + esc(text) + "</h2>");
  }
  function emptyStateHTML(){
    if (query) {
      return '<div class="state">' +
        '<p class="state-copy">No notes mention that yet.</p>' +
        '<div class="state-actions"><button class="btn btn-sm" type="button" data-clear-search>Clear search</button></div>' +
      "</div>";
    }
    if (filter !== "all") {
      return '<div class="state">' +
        '<p class="state-copy">No notes under this filter yet.</p>' +
        '<div class="state-actions"><button class="btn btn-sm" type="button" data-show-all>Show all notes</button></div>' +
      "</div>";
    }
    return '<div class="state"><p class="state-copy">Nothing here yet. Write one line about something you watched, heard, read or visited. Sparkling will take it from there.</p></div>';
  }
  function paintTimeline(enterId){
    if (!listEl) return;
    listEl.removeAttribute("aria-busy");
    if (window.Capture && Capture.merge) notes = Capture.merge(notes);
    if (!notes.length) { listEl.innerHTML = emptyStateHTML(); return; }
    const ordered = notes.slice().sort(function(a, b){ return (Number(b.created_at) || 0) - (Number(a.created_at) || 0); });
    const groups = new Map();
    ordered.forEach(function(n){
      const day = startOfDay(n.created_at);
      const key = Number.isFinite(day) ? String(day) : "earlier";
      if (!groups.has(key)) groups.set(key, { label: Number.isFinite(day) ? formatDayLabel(n.created_at) : "Earlier", items: [] });
      groups.get(key).items.push(n);
    });
    let html = "";
    groups.forEach(function(group){
      html += '<section class="day-group"><h2 class="day-label"><span>' + esc(group.label) + '</span><span class="r7-count num">' + esc(group.items.length + " " + plural(group.items.length, "note", "notes")) + "</span></h2>" +
        group.items.map(function(n){ return noteHTML(n, { enter: String(n.id) === String(enterId) }); }).join("") +
      "</section>";
    });
    listEl.innerHTML = html;
    if (window.Capture) Capture.remount();
  }
  function paintDidYouGo(){
    const slot = view.querySelector("[data-didyougo]");
    if (!slot) return;
    const rec = readDidYouGo();
    if (!rec) { slot.innerHTML = ""; return; }
    slot.innerHTML = '<div class="didyougo">' +
      '<p class="didyougo-q">Did you go to ' + esc(rec.place) + "?</p>" +
      '<div class="didyougo-actions">' +
        '<button class="btn btn-sm" type="button" data-dyg-yes>Yes, add a line</button>' +
        '<button class="btn btn-sm btn-ghost" type="button" data-dyg-no>Didn\'t go</button>' +
        '<span class="spacer"></span>' +
        '<button class="dismiss-btn" type="button" data-dyg-dismiss aria-label="Dismiss">' + icons.close + "</button>" +
      "</div>" +
      '<p class="inline-error" data-dyg-error role="alert" hidden></p>' +
    "</div>";
  }

  async function loadInitial(){
    const seq = ++loadSeq;
    initialRetry = true;
    if (listEl) {
      listEl.setAttribute("aria-busy", "true");
      listEl.innerHTML = '<div class="skeleton sk-note"></div><div class="skeleton sk-note"></div><div class="skeleton sk-note"></div>';
    }
    let nres;
    let cres;
    try {
      const results = await Promise.allSettled([
        api("/api/notes?filter=all", { signal: ac.signal }),
        api("/api/cards?type=all", { signal: ac.signal }),
      ]);
      nres = results[0];
      cres = results[1];
    } catch (e) { return; }
    if (!isCurrent(token) || seq !== loadSeq) return;
    if (nres && nres.status === "fulfilled") {
      const data = nres.value || {};
      notes = Array.isArray(data.notes) ? data.notes : [];
      normalizeMentionCounts(notes);
      baseCount = notes.length;
      greetingNotes = notes;
      NOTES_LAST = notes;
      initialRetry = false;
    } else {
      notes = NOTES_LAST || [];
      baseCount = NOTES_LAST ? NOTES_LAST.length : null;
      greetingNotes = NOTES_LAST;
    }
    if (cres && cres.status === "fulfilled") {
      const data = cres.value || {};
      greetingCards = Array.isArray(data.cards) ? data.cards : [];
    } else {
      greetingCards = null;
    }
    paintGreeting();
    if (nres && nres.status === "fulfilled") {
      paintTimeline();
    } else if (NOTES_LAST) {
      /* The last notebook is all we have: paint it and say once, above it, that it may be old. */
      notes = NOTES_LAST;
      paintTimeline();
      if (listEl) {
        const note = document.createElement("p");
        note.className = "stale-note";
        note.setAttribute("role", "status");
        const err = nres && nres.reason;
        const online = typeof navigator === "undefined" || navigator.onLine !== false;
        const msg = online && err && err.status
          ? "Couldn't refresh · showing your last copy."
          : "Offline · showing your last copy.";
        note.textContent = t(msg);
        listEl.insertBefore(note, listEl.firstChild);
      }
    } else {
      setListError();
    }
  }

  async function loadNotes(opts){
    const silent = !!(opts && opts.silent);
    const seq = ++loadSeq;
    initialRetry = false;
    if (!silent) setListLoading();
    const params = new URLSearchParams();
    params.set("filter", filter);
    if (query.trim()) params.set("q", query.trim());
    try {
      const data = await api("/api/notes?" + params.toString(), { signal: ac.signal });
      if (!isCurrent(token) || seq !== loadSeq) return;
      notes = Array.isArray(data && data.notes) ? data.notes : [];
      normalizeMentionCounts(notes);
      if (filter === "all" && !query.trim()) baseCount = notes.length;
      paintTimeline();
    } catch (e) {
      if (!isCurrent(token) || seq !== loadSeq || isAbort(e)) return;
      if (silent) toast("Your notes did not refresh.");
      else setListError();
    }
  }

  function applyFilterReset(){
    filter = "all";
    query = "";
    if (searchInput) searchInput.value = "";
    setFilterUI();
  }

  async function pollNote(note){
    if (!note || !note.id) return;
    const id = String(note.id);
    const deadline = Date.now() + 20000;
    while (isCurrent(token) && Date.now() < deadline) {
      try { await sleep(1500, ac.signal); } catch (e) { return; }
      if (!isCurrent(token)) return;
      try {
        const data = await api("/api/notes/" + encodeURIComponent(id), { signal: ac.signal });
        const fresh = data && data.note;
        if (!fresh) return;
        const idx = notes.findIndex(function(n){ return String(n.id) === id; });
        if (idx >= 0) notes[idx] = fresh;
        if (fresh.status !== "pending") {
          replaceNoteInDom(id, fresh, { draw: true, plus: true });
          try {
            if (window.Fx && Fx.grow) {
              const safeId = String(id).replace(/\x22/g, "");
              const nn = view.querySelector("[data-note-id=\"" + safeId + "\"]");
              if (nn) Fx.grow(nn);
            }
          } catch (e) {}
          // older notes of the same card still show the old count, so they get a quiet repaint
          syncMentionCounts(notes, fresh).forEach(function(nid){
            if (String(nid) === id) return;
            const older = notes.find(function(n){ return String(n.id) === String(nid); });
            if (older) replaceNoteInDom(nid, older, {});
          });
          refreshMe();
          return;
        }
      } catch (e) {
        if (isAbort(e)) return;
        if (e.status === 404) return;
      }
    }
  }

  async function saveNote(){
    if (saving) return;
    let raw = ta ? ta.value : "";
    let rawLink = link;
    const justUrl = urlOnly(raw);
    if (justUrl && !rawLink) {
      rawLink = justUrl;
      raw = "";
      link = justUrl;
      paintLinkChip();
      if (ta) ta.value = "";
      resizeTextarea();
      persistDraft();
    }
    const text = raw.trim();
    if (!text && !rawLink) {
      showSaveError("A line or a link is all it needs.");
      if (ta) ta.focus();
      return;
    }
    let payloadText = text;
    if (rawLink) {
      if (!payloadText) payloadText = rawLink;
      else if (payloadText.indexOf(rawLink) < 0) payloadText = payloadText + "\n" + rawLink;
    }
    saving = true;
    showSaveError("");
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving"; }
    const body = { text: payloadText };
    if (rawLink) body.link = rawLink;
    try {
      const data = await api("/api/notes", { method: "POST", body: body, signal: ac.signal });
      const note = data && data.note;
      if (!note) throw new Error("The note did not come back.");
      if (!isCurrent(token)) return;
      if (ta) { ta.value = ""; ta.style.height = ""; }
      link = "";
      paintLinkChip();
      clearDraft();
      resizeTextarea();
      if (filter !== "all" || query) {
        applyFilterReset();
        notes = [note];
        baseCount = baseCount === null ? 1 : baseCount + 1;
        paintTimeline(note.id);
        loadNotes({ silent: true });
      } else {
        notes = [note].concat(notes.filter(function(n){ return String(n.id) !== String(note.id); }));
        baseCount = baseCount === null ? 1 : baseCount + 1;
        paintTimeline(note.id);
      }
      pollNote(note);
    } catch (e) {
      if (!isCurrent(token) || isAbort(e)) return;
      showSaveError("That did not save. Your draft is still here.");
    } finally {
      if (isCurrent(token)) {
        saving = false;
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save"; }
      }
    }
  }


  function openEditNote(note){
    const sheet = openSheet({
      title: "Edit note",
      body:
        '<form data-edit-form>' +
          '<div class="sheet-field"><label for="editNoteText">Note</label><textarea id="editNoteText" data-edit-text data-autofocus>' + esc(note.text || "") + "</textarea></div>" +
          '<p class="inline-error" data-edit-error role="alert" hidden></p>' +
          '<div class="sheet-actions"><button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-primary" type="submit">Save note</button></div>' +
        "</form>",
    });
    const form = sheet.querySelector("[data-edit-form]");
    const area = sheet.querySelector("[data-edit-text]");
    const err = sheet.querySelector("[data-edit-error]");
    const save = sheet.querySelector('button[type="submit"]');
    form.addEventListener("submit", async function(e){
      e.preventDefault();
      const value = area.value.trim();
      if (!value) { err.textContent = "A note needs a line."; err.hidden = false; area.focus(); return; }
      err.hidden = true;
      save.disabled = true;
      const old = save.textContent;
      save.textContent = "Saving";
      try {
        const data = await api("/api/notes/" + encodeURIComponent(note.id), { method: "PATCH", body: { text: value } });
        const fresh = data && data.note;
        if (!fresh) throw new Error("no note");
        const idx = notes.findIndex(function(n){ return String(n.id) === String(note.id); });
        if (idx >= 0) notes[idx] = fresh;
        closeModal();
        replaceNoteInDom(note.id, fresh, {});
        pollNote(fresh);
      } catch (e) {
        err.textContent = t("That did not save. Try again.");
        err.hidden = false;
        save.disabled = false;
        save.textContent = old;
      }
    });
  }

  function openDeleteNote(note){
    confirmSheet({
      title: "Delete this note?",
      copy: "The note and what it added will be removed. This cannot be undone.",
      confirmLabel: "Delete note",
      busyLabel: "Deleting",
      danger: true,
      onConfirm: async function(){
        await api("/api/notes/" + encodeURIComponent(note.id), { method: "DELETE" });
        notes = notes.filter(function(n){ return String(n.id) !== String(note.id); });
        if (baseCount !== null && baseCount > 0) baseCount -= 1;
        paintTimeline();
        toast("Note deleted.");
        refreshMe();
      },
    });
  }

  function openNoteMenu(note){
    if (!note) return;
    const sheet = openMenu("Note", [
      { key: "edit", label: "Edit note" },
      { key: "delete", label: "Delete note", sub: "This cannot be undone.", danger: true },
    ]);
    Array.prototype.forEach.call(sheet.querySelectorAll("[data-menu]"), function(item){
      item.addEventListener("click", function(){
        const key = item.getAttribute("data-menu");
        closeModal();
        if (key === "edit") openEditNote(note);
        else if (key === "delete") openDeleteNote(note);
      });
    });
  }

  async function didYouGoAction(went, reason){
    const rec = readDidYouGo();
    if (!rec) { paintDidYouGo(); return; }
    const wrap = view.querySelector(".didyougo");
    const err = view.querySelector("[data-dyg-error]");
    const buttons = wrap ? wrap.querySelectorAll("button") : [];
    Array.prototype.forEach.call(buttons, function(b){ b.disabled = true; });
    if (err) { err.hidden = true; err.textContent = ""; }
    try {
      await api("/api/plan/" + encodeURIComponent(rec.plan_id) + "/went", { method: "POST", body: { went: went, reason: reason || undefined } });
      if (!isCurrent(token)) return;
      clearDidYouGo();
      paintDidYouGo();
      if (went) {
        Capture.open({ text: "Went to " + String(rec.place) + ". " });
        if (false) {
          ta.value = "Went to " + String(rec.place) + ". ";
          link = "";
          paintLinkChip();
          resizeTextarea();
          persistDraft();
          ta.focus();
        }
        toast("Noted. A line when you are ready.");
      } else {
        toast("Noted.");
      }
    } catch (e) {
      if (!isCurrent(token) || isAbort(e)) return;
      if (err) { err.textContent = t("That did not save. Try again."); err.hidden = false; }
      Array.prototype.forEach.call(buttons, function(b){ b.disabled = false; });
    }
  }

  // Composer setup
  if (ta) {
    ta.value = initialText;
    ta.addEventListener("input", function(){
      persistDraft();
      resizeTextarea();
    });
    ta.addEventListener("paste", function(e){
      const cb = e.clipboardData;
      if (!cb) return;
      const pasted = cb.getData("text");
      const justUrl = urlOnly(pasted);
      if (!justUrl) return;
      e.preventDefault();
      link = justUrl;
      paintLinkChip();
      persistDraft();
    });
    ta.addEventListener("keydown", function(e){
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        saveNote();
      }
    });
    resizeTextarea();
    if (state.focusComposer) {
      state.focusComposer = false;
      setTimeout(function(){ try { ta.focus(); } catch (_) {} }, 30);
    }
  }
  const composer = view.querySelector("[data-composer]");
  if (composer) composer.addEventListener("submit", function(e){ e.preventDefault(); saveNote(); });
  /* A live jot can carry the card's fresh footprint count (4×) while older notes of that card still show 3×.
     Raise the count on every sibling in the feed and quietly repaint the ones on screen. */
  function syncSiblingCounts(note){
    const changed = syncMentionCounts(notes, note);
    changed.forEach(function(nid){
      const older = notes.find(function(n){ return String(n.id) === String(nid); });
      if (older) replaceNoteInDom(nid, older, {});
    });
    return changed;
  }
  /* capture: the + composer adds notes here (FLIP), replaces temp notes, polls recognition */
  Capture.attach({
    add: function(note){
      if (filter !== "all" || query) applyFilterReset();
      notes = [note].concat(notes.filter(function(n){ return String(n.id) !== String(note.id); }));
      baseCount = baseCount === null ? 1 : baseCount + 1;
      syncSiblingCounts(note);
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (_) {}
      if (listEl) Capture.flip(listEl, function(){ paintTimeline(); }, note.id); else paintTimeline();
    },
    replace: function(oldId, note, opts){
      const idx = notes.findIndex(function(n){ return String(n.id) === String(oldId); });
      if (idx >= 0) notes[idx] = note; else notes.unshift(note);
      if (!replaceNoteInDom(oldId, note, opts || {})) paintTimeline();
    },
    remove: function(id){
      notes = notes.filter(function(n){ return String(n.id) !== String(id); });
      if (baseCount !== null && baseCount > 0) baseCount -= 1;
      if (listEl) Capture.flip(listEl, function(){ paintTimeline(); }, null); else paintTimeline();
    },
    poll: function(note){ pollNote(note); },
  });
  onCleanup(function(){ Capture.detach(); });
  if (state.focusComposer) { state.focusComposer = false; setTimeout(function(){ Capture.open(); }, 260); }
  paintLinkChip();
  paintDidYouGo();

  const prompts = [
    "What stayed with you today?",
    "Something you watched, heard, read or found?",
    "Paste a link or drop a screenshot.",
  ];
  let promptIndex = 0;
  const promptTimer = setInterval(function(){
    if (!ta || ta.value.trim()) return;
    promptIndex = (promptIndex + 1) % prompts.length;
    ta.placeholder = prompts[promptIndex];
  }, 5200);
  onCleanup(function(){ clearInterval(promptTimer); });
  onCleanup(function(){ clearTimeout(searchTimer); });

  // Template bindings
  const searchClose = view.querySelector("[data-search-close]");
  function setSearchOpen(open){
    searchOpen = !!open;
    if (searchToggle) searchToggle.setAttribute("aria-expanded", searchOpen ? "true" : "false");
    if (searchRow) searchRow.hidden = !searchOpen;
    if (searchOpen && searchInput) setTimeout(function(){ try { searchInput.focus(); } catch (_) {} }, 20);
  }
  function clearSearch(){
    const had = !!query;
    query = "";
    if (searchInput) searchInput.value = "";
    clearTimeout(searchTimer);
    if (had) loadNotes();
  }
  on(view, "click", function(e){
    const filterBtn = e.target.closest("[data-filter]");
    if (filterBtn) {
      const next = filterBtn.getAttribute("data-filter");
      if (!next || next === filter) return;
      filter = next;
      if (searchInput) query = searchInput.value.trim();
      setFilterUI();
      loadNotes();
      return;
    }
    if (e.target.closest("[data-search-toggle]")) {
      if (searchOpen) { setSearchOpen(false); clearSearch(); }
      else setSearchOpen(true);
      return;
    }
    if (e.target.closest("[data-search-close]")) { setSearchOpen(false); clearSearch(); return; }
    if (e.target.closest("[data-clear-search]")) { setSearchOpen(true); clearSearch(); return; }
    if (e.target.closest("[data-show-all]")) {
      filter = "all";
      setFilterUI();
      loadNotes();
      return;
    }
    if (e.target.closest("[data-open-camera]")) {
      persistDraft();
      go("#/camera");
      return;
    }
    if (e.target.closest("[data-link-remove]")) {
      link = "";
      paintLinkChip();
      persistDraft();
      return;
    }
    const menuBtn = e.target.closest("[data-note-menu]");
    if (menuBtn) {
      const id = menuBtn.getAttribute("data-note-menu");
      const note = notes.find(function(n){ return String(n.id) === String(id); });
      if (note) openNoteMenu(note);
      return;
    }
    if (e.target.closest("[data-dyg-yes]")) { didYouGoAction(true); return; }
    if (e.target.closest("[data-dyg-no]")) {
      const w = view.querySelector(".didyougo");
      if (w && !w.querySelector("[data-dyg-why]")) {
        const q = w.querySelector(".didyougo-q"); if (q) q.textContent = t("What got in the way?");
        const a = w.querySelector(".didyougo-actions");
        a.innerHTML = [["far","Too far"],["taste","Not my taste"],["closed","Closed"],["time","No time"]].map(function(r){ return '<button class="btn btn-sm btn-ghost" type="button" data-dyg-why="' + r[0] + '">' + r[1] + "</button>"; }).join("");
        return;
      }
      didYouGoAction(false); return;
    }
    const whyBtn = e.target.closest("[data-dyg-why]");
    if (whyBtn) { didYouGoAction(false, whyBtn.getAttribute("data-dyg-why")); return; }
    if (e.target.closest("[data-dyg-dismiss]")) {
      clearDidYouGo();
      paintDidYouGo();
      return;
    }
  });
  if (searchClose) searchClose.addEventListener("click", function(){ setSearchOpen(false); clearSearch(); });
  if (searchInput) {
    searchInput.addEventListener("input", function(){
      clearTimeout(searchTimer);
      const value = searchInput.value;
      searchTimer = setTimeout(function(){
        if (!isCurrent(token)) return;
        query = value.trim();
        loadNotes();
      }, 320);
    });
    searchInput.addEventListener("keydown", function(e){
      if (e.key === "Enter") {
        e.preventDefault();
        clearTimeout(searchTimer);
        query = searchInput.value.trim();
        loadNotes();
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        clearSearch();
      }
    });
  }

  // Long press a note to open its menu.
  let pressTimer = null;
  let pressStart = null;
  function clearPress(){ if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } pressStart = null; }
  on(view, "pointerdown", function(e){
    if (pressTimer) clearPress();
    const noteEl = e.target.closest(".note");
    if (!noteEl) return;
    if (e.target.closest("button,a,textarea,input,img")) return;
    const id = noteEl.getAttribute("data-note-id");
    pressStart = { x: e.clientX, y: e.clientY };
    pressTimer = setTimeout(function(){
      pressTimer = null;
      const note = notes.find(function(n){ return String(n.id) === String(id); });
      if (note) openNoteMenu(note);
    }, 540);
  });
  on(view, "pointerup", clearPress);
  on(view, "pointercancel", clearPress);
  on(view, "pointermove", function(e){
    if (!pressStart) return;
    if (Math.abs(e.clientX - pressStart.x) > 8 || Math.abs(e.clientY - pressStart.y) > 8) clearPress();
  });

  bindRetries({
    initial: loadInitial,
    notes: loadNotes,
  });

  loadInitial();
}

/* A fresh note can push a card's count up while older notes still show the old one. Raise the same card's
   mention count on every other note in the feed (never lower it) and hand back the ids that changed. */
function syncMentionCounts(list, fresh){
  const changed = [];
  if (!Array.isArray(list) || !fresh || !Array.isArray(fresh.mentions)) return changed;
  const raised = [];
  fresh.mentions.forEach(function(m){
    if (!m || typeof m !== "object" || !m.card || typeof m.card !== "object") return;
    if (m.card.id === null || m.card.id === undefined || m.card.id === "") return;
    if (typeof m.card.n !== "number" || !Number.isFinite(m.card.n)) return;
    raised.push({ id: String(m.card.id), n: m.card.n });
  });
  if (!raised.length) return changed;
  const freshId = fresh.id === null || fresh.id === undefined ? "" : String(fresh.id);
  list.forEach(function(note){
    if (!note || note === fresh) return;
    if (freshId && note.id !== null && note.id !== undefined && String(note.id) === freshId) return;
    if (!Array.isArray(note.mentions)) return;
    let touched = false;
    note.mentions.forEach(function(m){
      if (!m || typeof m !== "object" || !m.card || typeof m.card !== "object") return;
      const cid = (m.card.id !== null && m.card.id !== undefined && m.card.id !== "")
        ? String(m.card.id)
        : (m.card_id === null || m.card_id === undefined ? "" : String(m.card_id));
      if (!cid) return;
      raised.forEach(function(r){
        if (r.id !== cid) return;
        const cur = Number(m.card.n);
        if (!Number.isFinite(cur) || cur < r.n) { m.card.n = r.n; touched = true; }
      });
    });
    if (touched) changed.push(note.id);
  });
  return changed;
}

/* The first load can hand back one card with different counts (today's note 4x, an older note 3x). Raise every
   note of that card to the largest n seen, never lower, and hand back the ids of the notes that changed. */
function normalizeMentionCounts(list){
  const changed = [];
  if (!Array.isArray(list)) return changed;
  const top = {};
  const rows = [];
  list.forEach(function(note){
    if (!note || typeof note !== "object" || !Array.isArray(note.mentions)) return;
    note.mentions.forEach(function(m){
      if (!m || typeof m !== "object" || !m.card || typeof m.card !== "object") return;
      const cid = (m.card.id !== null && m.card.id !== undefined && m.card.id !== "")
        ? String(m.card.id)
        : (m.card_id === null || m.card_id === undefined ? "" : String(m.card_id));
      if (!cid) return;
      const n = Number(m.card.n);
      if (Number.isFinite(n) && (top[cid] === undefined || n > top[cid])) top[cid] = n;
      rows.push({ note: note, card: m.card, cid: cid });
    });
  });
  const hit = [];
  rows.forEach(function(r){
    const wanted = top[r.cid];
    if (wanted === undefined) return;
    const cur = Number(r.card.n);
    if (Number.isFinite(cur) && cur >= wanted) return;
    r.card.n = wanted;
    if (hit.indexOf(r.note) < 0) hit.push(r.note);
  });
  hit.forEach(function(note){
    changed.push(note.id);
  });
  return changed;
}

