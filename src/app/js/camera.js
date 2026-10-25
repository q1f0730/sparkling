/* ---------------------------------------------------------------------------
   Camera
   --------------------------------------------------------------------------- */
function renderCamera(){
  const token = beginView();
  setShell({ title: "Photo", back: "#/notes", tabs: false });

  view.innerHTML =
    '<div class="screen-head"><p class="sub">A photo joins your notes. Sparkling reads any text in it, then looks for something it recognises.</p></div>' +
    '<div class="camera-sheet">' +
      '<div class="cam-frame" data-cam-frame></div>' +
      '<div class="filmstrip" data-cam-strip hidden></div>' +
      '<div class="cam-controls">' +
        '<button class="btn btn-sm" type="button" data-cam-take>' + icons.camera + "Take a photo</button>" +
        '<button class="btn btn-sm" type="button" data-cam-choose>' + icons.photo + "Choose from library</button>" +
        '<button class="text-btn" type="button" data-cam-remove hidden>' + t("Remove photo") + "</button>" +
      "</div>" +
      '<input class="file-input-hidden" type="file" accept="image/*" capture="environment" data-cam-take-input tabindex="-1" aria-hidden="true">' +
      '<input class="file-input-hidden" type="file" accept="image/*" multiple data-cam-choose-input tabindex="-1" aria-hidden="true">' +
      '<p class="cam-fallback" data-cam-fallback>' + t("If your camera does not open, choose a photo from your library instead.") + '</p>' +
      '<div class="cam-caption"><textarea data-cam-caption rows="2" maxlength="1000" placeholder="' + attr(t("Add a few words, or just save")) + '" aria-label="' + attr(t("Add a few words, or just save")) + '"></textarea></div>' +
      '<p class="inline-error" data-cam-error role="alert" hidden></p>' +
      '<div class="cam-save-row">' +
        '<button class="btn btn-primary" type="button" data-cam-save disabled>' + t("Save photo") + '</button>' +
        '<span class="tiny" data-cam-count>No photo chosen</span>' +
      "</div>" +
    "</div>" +
    '<div data-cam-saved></div>';

  const frameEl = view.querySelector("[data-cam-frame]");
  const stripEl = view.querySelector("[data-cam-strip]");
  const captionEl = view.querySelector("[data-cam-caption]");
  const saveBtn = view.querySelector("[data-cam-save]");
  const countEl = view.querySelector("[data-cam-count]");
  const removeBtn = view.querySelector("[data-cam-remove]");
  const errorEl = view.querySelector("[data-cam-error]");
  const fallbackEl = view.querySelector("[data-cam-fallback]");
  const savedEl = view.querySelector("[data-cam-saved]");
  const takeInput = view.querySelector("[data-cam-take-input]");
  const chooseInput = view.querySelector("[data-cam-choose-input]");

  let selected = [];
  let current = 0;
  let saved = [];
  let nextKey = 1;
  const urls = [];

  function emptyFrameHTML(){
    return '<div class="cam-empty">' + icons.camera + "<p>Add a photo of a page, a poster, a screen or a place.</p></div>";
  }
  function showError(msg){
    if (!errorEl) return;
    errorEl.textContent = msg || "";
    errorEl.hidden = !msg;
  }
  function isImageFile(file){
    if (!file) return false;
    if (file.type && file.type.indexOf("image/") === 0) return true;
    return /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i.test(file.name || "");
  }
  function paintFrame(){
    if (!frameEl) return;
    if (!selected.length) {
      frameEl.innerHTML = emptyFrameHTML();
      current = 0;
    } else {
      if (current < 0) current = 0;
      if (current >= selected.length) current = selected.length - 1;
      const item = selected[current];
      frameEl.innerHTML = '<img class="cam-preview" src="' + attr(item.url) + '" alt="Photo ready to save">';
    }
    if (removeBtn) {
      removeBtn.hidden = !selected.length;
      removeBtn.textContent = selected.length > 1 ? t("Remove this photo") : t("Remove photo");
    }
    if (saveBtn) {
      saveBtn.disabled = !selected.length;
      saveBtn.textContent = selected.length > 1 ? t("Save " + selected.length + " photos") : t("Save photo");
    }
    if (countEl) {
      countEl.textContent = !selected.length
        ? "No photo chosen"
        : selected.length + " " + plural(selected.length, "photo", "photos");
    }
    if (stripEl) {
      stripEl.hidden = selected.length < 2;
      stripEl.innerHTML = selected.length > 1
        ? selected.map(function(item, i){
            return '<img class="strip-img" src="' + attr(item.url) + '" alt="Photo ' + (i + 1) + '" data-cam-pick="' + i + '" role="button" tabindex="0" aria-label="Show photo ' + (i + 1) + '">';
          }).join("")
        : "";
    }
  }
  function addFiles(fileList){
    const files = fileList ? Array.prototype.slice.call(fileList) : [];
    if (!files.length) return;
    let problem = "";
    let added = 0;
    files.forEach(function(file){
      if (!isImageFile(file)) { problem = "Only image files can be added."; return; }
      if (file.size > 8 * 1024 * 1024) { problem = "One photo was larger than 8 MB, so it stayed out."; return; }
      const url = URL.createObjectURL(file);
      urls.push(url);
      selected.push({ key: nextKey++, file: file, url: url });
      added += 1;
    });
    if (added) current = selected.length - 1;
    showError(problem);
    paintFrame();
  }
  function removeCurrent(){
    if (!selected.length) return;
    selected.splice(current, 1);
    if (current >= selected.length) current = selected.length - 1;
    if (current < 0) current = 0;
    showError("");
    paintFrame();
  }

  function sourceRowHTML(item){
    const card = item.card;
    const thumb =
      '<div class="cam-thumb-wrap ' + (card ? typeClass(card.type) : "") + '">' +
        '<img class="cam-thumb" src="' + attr(item.url) + '" alt="Photo saved to your notes" loading="lazy">' +
        (item.state === "reading" ? '<span class="scan" aria-hidden="true"></span>' : "") +
        (card ? '<span class="corner-tab" aria-hidden="true"></span>' : "") +
      "</div>";
    let body = "";
    if (item.state === "uploading") {
      body = '<p class="cam-state-title">Saving the photo.</p><p class="cam-state-copy">It will join your notes in a moment.</p>';
    } else if (item.state === "reading") {
      body = '<p class="cam-state-title">Saved to your notes.</p><p class="cam-state-copy">reading the text...</p>';
    } else if (item.state === "failed") {
      body = '<p class="cam-state-title">That photo did not go through.</p>' +
        '<p class="cam-state-copy">' + esc(item.error || "Check your connection, then try again.") + "</p>" +
        '<div class="cam-actions-end"><button class="btn btn-sm" type="button" data-cam-retry="' + attr(item.key) + '">Try again</button></div>';
    } else if (item.state === "timeout") {
      body = '<p class="cam-state-title">Saved to your notes.</p>' +
        '<p class="cam-state-copy">Sparkling is still reading in the background. The card will appear when it is ready.</p>' +
        '<div class="cam-actions-end"><button class="btn btn-sm" type="button" data-nav="#/notes">See notes</button></div>';
    } else if (card) {
      body = '<p class="cam-state-title">Saved. This looks like</p>' +
        '<p class="cam-match-name">' + esc(card.name) + "</p>" +
        '<p class="cam-match-type">' + esc(cardContext(card)) + "</p>" +
        '<div class="cam-actions-end">' +
          '<button class="btn btn-sm" type="button" data-nav="#/cards/' + encodeURIComponent(card.id) + '">Open card</button>' +
          '<button class="btn btn-sm btn-ghost" type="button" data-nav="#/notes">See notes</button>' +
        "</div>";
    } else if (item.cardId) {
      body = '<p class="cam-state-title">Saved to your notes.</p><p class="cam-state-copy">A card was made from this photo.</p>' +
        '<div class="cam-actions-end">' +
          '<button class="btn btn-sm" type="button" data-nav="#/cards/' + encodeURIComponent(item.cardId) + '">Open card</button>' +
          '<button class="btn btn-sm btn-ghost" type="button" data-nav="#/notes">See notes</button>' +
        "</div>";
    } else if (item.readFailed) {
      body = '<p class="cam-state-title">Saved to your notes.</p>' +
        '<p class="cam-state-copy">Recognition did not finish this time. The photo and your words are safe in Notes.</p>' +
        '<div class="cam-actions-end"><button class="btn btn-sm" type="button" data-nav="#/notes">See notes</button></div>';
    } else {
      body = '<p class="cam-state-title">Saved to your notes.</p>' +
        '<p class="cam-state-copy">No card this time. The photo and your words are safe in Notes.</p>' +
        '<div class="cam-actions-end"><button class="btn btn-sm" type="button" data-nav="#/notes">See notes</button></div>';
    }
    return '<div class="cam-saved" data-cam-saved-key="' + attr(item.key) + '">' + thumb + '<div class="cam-state">' + body + "</div></div>";
  }
  function paintSaved(){
    if (!savedEl) return;
    savedEl.innerHTML = saved.map(sourceRowHTML).join("");
  }

  async function settleItem(item, note){
    if (!isCurrent(token)) return;
    item.noteId = note.id;
    if (note.status === "failed") {
      item.state = "done";
      item.readFailed = true;
      paintSaved();
      return;
    }
    const matched = (Array.isArray(note.mentions) ? note.mentions : []).filter(function(m){
      return m && m.state === "matched" && m.card_id != null;
    });
    if (matched.length) {
      item.cardId = matched[0].card_id;
      try {
        const data = await api("/api/cards/" + encodeURIComponent(matched[0].card_id));
        if (!isCurrent(token)) return;
        if (data && data.card) item.card = data.card;
      } catch (_) {}
    }
    if (!isCurrent(token)) return;
    item.state = "done";
    paintSaved();
    refreshMe();
  }

  async function trackItem(item){
    const deadline = Date.now() + 30000;
    while (isCurrent(token) && Date.now() < deadline) {
      await sleep(1600);
      if (!isCurrent(token) || !item.noteId) return;
      try {
        const data = await api("/api/notes/" + encodeURIComponent(item.noteId));
        if (!isCurrent(token)) return;
        const note = data && data.note;
        if (!note) return;
        if (note.status === "pending") continue;
        await settleItem(item, note);
        return;
      } catch (e) {
        if (!isCurrent(token) || (e && e.status === 401)) return;
        if (e && e.status === 404) {
          item.state = "timeout";
          paintSaved();
          return;
        }
      }
    }
    if (!isCurrent(token)) return;
    item.state = "timeout";
    paintSaved();
  }

  async function uploadItem(item){
    if (!isCurrent(token)) return;
    item.state = "uploading";
    item.error = "";
    paintSaved();
    try {
      const fd = new FormData();
      fd.append("file", item.file, item.file.name || "photo.jpg");
      fd.append("caption", item.caption || "");
      const data = await api("/api/notes/photo", { method: "POST", body: fd });
      if (!isCurrent(token)) return;
      if (data && data.error) throw new Error(data.error);
      const note = data && data.note;
      if (!note || !note.id) throw new Error("The note did not come back.");
      item.noteId = note.id;
      if (note.status === "pending") {
        item.state = "reading";
        paintSaved();
        await trackItem(item);
      } else {
        await settleItem(item, note);
      }
    } catch (e) {
      if (!isCurrent(token)) return;
      item.state = "failed";
      if (e && (e.status === 413 || (e.status === 400 && /large|8 MB/i.test(e.message || "")))) {
        item.error = "That photo is too large. Keep it under 8 MB.";
      } else if (e && e.status === 401) {
        item.error = "Your session ended. Open the notebook again to save this photo.";
      } else {
        item.error = "Check your connection, then try again.";
      }
      paintSaved();
    }
  }

  async function runBatch(list){
    for (let i = 0; i < list.length; i++) {
      if (!isCurrent(token)) break;
      await uploadItem(list[i]);
    }
    if (!isCurrent(token)) return;
    refreshMe();
    const bad = list.filter(function(item){ return item.state === "failed"; }).length;
    if (bad) {
      showError(bad + " " + plural(bad, "photo", "photos") + " did not go through. Try again below.");
    } else {
      showError("");
      toast("Saved to your notes.");
    }
  }

  function startSave(){
    if (!selected.length) return;
    const caption = captionEl ? captionEl.value.trim() : "";
    const batch = selected.map(function(entry){ return { entry: entry, caption: caption }; });
    selected = [];
    current = 0;
    if (captionEl) captionEl.value = "";
    paintFrame();
    showError("");
    const created = batch.map(function(pair){
      return {
        key: pair.entry.key,
        file: pair.entry.file,
        url: pair.entry.url,
        caption: pair.caption,
        state: "uploading",
        error: "",
        noteId: null,
        cardId: null,
        card: null,
        readFailed: false,
      };
    });
    saved = created.concat(saved);
    paintSaved();
    runBatch(created);
  }

  paintFrame();

  on(view, "click", function(e){
    if (e.target.closest("[data-cam-take]")) { if (takeInput) takeInput.click(); return; }
    if (e.target.closest("[data-cam-choose]")) { if (chooseInput) chooseInput.click(); return; }
    if (e.target.closest("[data-cam-remove]")) { removeCurrent(); return; }
    if (e.target.closest("[data-cam-save]")) { startSave(); return; }
  });
  on(takeInput, "change", function(){
    addFiles(takeInput.files);
    takeInput.value = "";
  });
  on(chooseInput, "change", function(){
    addFiles(chooseInput.files);
    chooseInput.value = "";
  });
  on(stripEl, "click", function(e){
    const pick = e.target.closest("[data-cam-pick]");
    if (!pick) return;
    const index = Number(pick.getAttribute("data-cam-pick"));
    if (!Number.isFinite(index)) return;
    current = clamp(index, 0, Math.max(0, selected.length - 1));
    paintFrame();
  });
  on(stripEl, "keydown", function(e){
    if (e.key !== "Enter" && e.key !== " ") return;
    const pick = e.target.closest("[data-cam-pick]");
    if (!pick) return;
    e.preventDefault();
    const index = Number(pick.getAttribute("data-cam-pick"));
    if (!Number.isFinite(index)) return;
    current = clamp(index, 0, Math.max(0, selected.length - 1));
    paintFrame();
  });
  on(savedEl, "click", function(e){
    const retry = e.target.closest("[data-cam-retry]");
    if (!retry) return;
    const key = retry.getAttribute("data-cam-retry");
    const item = saved.find(function(x){ return String(x.key) === String(key); });
    if (!item || item.state !== "failed") return;
    showError("");
    uploadItem(item).then(function(){
      if (!isCurrent(token)) return;
      if (item.state !== "failed") toast("Saved to your notes.");
      const bad = saved.filter(function(x){ return x.state === "failed"; }).length;
      if (!bad) showError("");
    });
  });

  if (navigator.permissions && navigator.permissions.query) {
    try {
      navigator.permissions.query({ name: "camera" }).then(function(status){
        if (!isCurrent(token) || !fallbackEl) return;
        function apply(){
          if (status.state === "granted") {
            fallbackEl.hidden = true;
          } else if (status.state === "denied") {
            fallbackEl.hidden = false;
            fallbackEl.textContent = t("Camera access is off for this site. You can still choose a photo from your library.");
          } else {
            fallbackEl.hidden = false;
            fallbackEl.textContent = t("If your camera does not open, choose a photo from your library instead.");
          }
        }
        apply();
        if (typeof status.addEventListener === "function") {
          status.addEventListener("change", apply);
          onCleanup(function(){ try { status.removeEventListener("change", apply); } catch (_) {} });
        }
      }).catch(function(){});
    } catch (_) {}
  }

  onCleanup(function(){
    urls.forEach(function(url){ try { URL.revokeObjectURL(url); } catch (_) {} });
  });
}

