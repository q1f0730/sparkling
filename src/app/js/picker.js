/* picker:js:begin */
/* picker: the "/" catalogue search (10-24). One popover for the whole app.
   inline: anchored above the caret of a textarea (the composer); the query lives in the textarea after "/".
   sheet:  its own search field (Inbox "Something else", card "Not this?"). */
const Picker = (function(){
  const TYPES = [["all", "All"], ["person", "People"], ["film", "Film"], ["tv", "TV"], ["music", "Music"], ["book", "Books"], ["place", "Places"]];
  const DEBOUNCE = 200;
  let pop = null, veil = null, head = null, inputEl = null, chipsEl = null, listEl = null, footEl = null;
  let S = { open: false, mode: "inline", type: "all", q: "", results: [], active: 0, loading: false, error: "", onPick: null, onClose: null, anchor: null, timer: 0, seq: 0, ctl: null, last: "" };
  const memo = new Map();
  const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
  function desk(){ try { return matchMedia("(min-width:1024px)").matches; } catch (_) { return false; } }

  function build(){
    if (pop) return;
    veil = document.createElement("div"); veil.className = "pk-veil"; veil.hidden = true;
    pop = document.createElement("div"); pop.className = "pk"; pop.hidden = true; pop.id = "pkPop";
    pop.innerHTML =
      '<div class="pk-head" data-pk-head><p class="pk-title" data-pk-title></p>' +
        '<label class="pk-search"><span class="pk-slash" aria-hidden="true">/</span><input type="search" autocomplete="off" spellcheck="false" data-pk-input></label></div>' +
      '<div class="pk-chips" role="tablist" data-pk-chips></div>' +
      '<div class="pk-list" role="listbox" id="pkList" data-pk-list></div>' +
      '<p class="pk-foot" data-pk-foot></p>';
    document.body.appendChild(veil); document.body.appendChild(pop);
    head = pop.querySelector("[data-pk-head]"); inputEl = pop.querySelector("[data-pk-input]");
    chipsEl = pop.querySelector("[data-pk-chips]"); listEl = pop.querySelector("[data-pk-list]"); footEl = pop.querySelector("[data-pk-foot]");
    // keep the composer's caret: taps inside the popover never steal focus in inline mode
    pop.addEventListener("mousedown", function(e){ if (S.mode === "inline" && !e.target.closest("input")) e.preventDefault(); });
    pop.addEventListener("click", function(e){
      const c = e.target.closest("[data-pk-type]");
      if (c) { S.type = c.getAttribute("data-pk-type"); S.active = 0; paintChips(); search(true); if (S.mode === "sheet") inputEl.focus(); return; }
      const r = e.target.closest("[data-pk-i]");
      if (r) { choose(Number(r.getAttribute("data-pk-i"))); return; }
    });
    pop.addEventListener("pointermove", function(e){
      const r = e.target.closest("[data-pk-i]"); if (!r) return;
      const i = Number(r.getAttribute("data-pk-i")); if (i !== S.active) { S.active = i; mark(); }
    });
    inputEl.addEventListener("input", function(e){ if (e.isComposing) return; setQuery(inputEl.value); });
    inputEl.addEventListener("compositionend", function(){ setQuery(inputEl.value); });
    inputEl.addEventListener("keydown", function(e){ keydown(e); });
    veil.addEventListener("click", function(){ close("dismiss"); });
    window.addEventListener("resize", function(){ if (S.open) place(); });
    window.addEventListener("hashchange", function(){ if (S.open) close("route"); });
    if (window.visualViewport) window.visualViewport.addEventListener("resize", function(){ if (S.open) place(); });
  }

  function open(o){
    build();
    o = o || {};
    if (S.ctl) { try { S.ctl.abort(); } catch (_) {} }
    S = Object.assign({}, S, { open: true, mode: o.mode === "sheet" ? "sheet" : "inline", type: o.type || "all", q: "", results: [], active: 0, loading: false, error: "", onPick: o.onPick || null, onClose: o.onClose || null, anchor: o.anchor || null, last: "" });
    pop.className = "pk pk-" + S.mode;
    pop.setAttribute("role", S.mode === "sheet" ? "dialog" : "group");
    pop.setAttribute("aria-label", t(o.title || "Tag something"));
    head.hidden = S.mode !== "sheet";
    pop.querySelector("[data-pk-title]").textContent = o.title ? t(o.title) : "";
    inputEl.placeholder = t("Search the taste catalogue");
    inputEl.setAttribute("aria-label", t("Search the taste catalogue"));
    inputEl.setAttribute("aria-controls", "pkList");
    if (S.anchor) { S.anchor.setAttribute("aria-controls", "pkList"); S.anchor.setAttribute("aria-expanded", "true"); S.anchor.setAttribute("aria-autocomplete", "list"); }
    paintChips(); pop.hidden = false; veil.hidden = S.mode !== "sheet";
    if (S.mode === "sheet") { inputEl.value = o.query || ""; setTimeout(function(){ try { inputEl.focus(); inputEl.select(); } catch (_) {} }, 30); }
    setQuery(o.query || "", true);
    place();
    if (!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) && pop.animate)
      pop.animate([{ opacity: 0, transform: S.mode === "sheet" && !desk() ? "translateY(24px)" : "translateY(6px) scale(.985)" }, { opacity: 1, transform: "none" }], { duration: 180, easing: "cubic-bezier(.2,.9,.25,1)" });
  }
  function close(reason){
    if (!S.open) return;
    S.open = false; clearTimeout(S.timer);
    if (S.ctl) { try { S.ctl.abort(); } catch (_) {} }
    pop.hidden = true; veil.hidden = true;
    if (S.anchor) { S.anchor.setAttribute("aria-expanded", "false"); S.anchor.removeAttribute("aria-activedescendant"); }
    const cb = S.onClose; S.onClose = null;
    if (cb) try { cb(reason || "close"); } catch (_) {}
  }
  function isOpen(){ return S.open; }
  function isInline(){ return S.open && S.mode === "inline"; }

  function setQuery(q, now){
    q = String(q || "").replace(/\s+/g, " ").replace(/^\s+/, "").slice(0, 60);
    if (q === S.q && !now) { place(); return; }
    S.q = q; S.active = 0;
    clearTimeout(S.timer);
    if (!q.trim()) { S.results = []; S.loading = false; S.error = ""; paint(); return; }
    const key = S.type + "|" + q.trim().toLowerCase();
    if (memo.has(key)) { S.results = memo.get(key); S.loading = false; S.error = ""; paint(); return; }
    S.loading = true; paint();
    S.timer = setTimeout(function(){ search(false); }, now ? 0 : DEBOUNCE);
  }
  async function search(force){
    const q = S.q.trim(); if (!q) { paint(); return; }
    const key = S.type + "|" + q.toLowerCase();
    if (memo.has(key) && !force) { S.results = memo.get(key); S.loading = false; paint(); return; }
    if (memo.has(key)) { S.results = memo.get(key); S.loading = false; S.error = ""; paint(); return; }
    if (S.ctl) { try { S.ctl.abort(); } catch (_) {} }
    const ctl = new AbortController(); S.ctl = ctl;
    const seq = ++S.seq;
    S.loading = true; S.error = ""; paint();
    try {
      const d = await api("/api/catalogue?q=" + encodeURIComponent(q) + "&type=" + encodeURIComponent(S.type) + (LANG === "zh" ? "&lang=zh" : ""), { signal: ctl.signal });
      if (seq !== S.seq || !S.open) return;
      const rows = pickerRelevant(Array.isArray(d && d.results) ? d.results : [], q);
      memo.set(key, rows); if (memo.size > 80) memo.delete(memo.keys().next().value);
      S.results = rows; S.loading = false; S.active = 0;
    } catch (e) {
      if (isAbort(e) || seq !== S.seq) return;
      S.loading = false; S.error = t("The catalogue did not answer. Keep typing to try again.");
    }
    paint();
  }

  function metaLine(r){
    const bits = [t(typeLabel(r.type))];
    if (r.sub) bits.push(r.type === "person" || r.type === "music" ? t(r.sub) : r.sub);
    else if (r.year) bits.push(String(r.year));
    return bits.join(" \u00b7 ");
  }
  function paintChips(){
    chipsEl.innerHTML = TYPES.map(function(x){
      return '<button type="button" role="tab" class="pk-chip" data-pk-type="' + x[0] + '" aria-selected="' + (S.type === x[0]) + '" tabindex="-1">' + esc(t(x[1])) + "</button>";
    }).join("");
  }
  function paint(){
    if (!pop) return;
    const q = S.q.trim();
    let html = "";
    if (!q) html = '<p class="pk-empty">' + esc(t(S.mode === "sheet" ? "Type a name to search." : "Type a name: a person, film, song, book or place.")) + "</p>";
    else if (S.error) html = '<p class="pk-empty">' + esc(S.error) + "</p>";
    else if (S.loading && !S.results.length) html = '<div class="pk-skel" aria-hidden="true"><i></i><i></i><i></i></div><p class="pk-sr" role="status">' + esc(t("Searching")) + "\u2026</p>";
    else if (!S.results.length) html = '<p class="pk-empty">' + esc(LANG === "zh" ? "口味目录里没有叫“" + q + "”的。" : "Nothing called \u201c" + q + "\u201d in the taste catalogue.") + "</p>";
    else html = S.results.map(function(r, i){
      const img = imgSrc(r.image);
      return '<button type="button" role="option" class="pk-row" id="pk-o' + i + '" data-pk-i="' + i + '" aria-selected="' + (i === S.active) + '" tabindex="-1">' +
        '<span class="pk-thumb ' + typeClass(r.type) + '">' + (img ? '<img src="' + attr(img) + '" alt="" loading="lazy" onerror="this.remove()">' : "") + '<b aria-hidden="true">' + esc(String(r.name || "?").charAt(0)) + "</b></span>" +
        '<span class="pk-main"><span class="pk-name" translate="no">' + esc(r.name || "") + "</span>" +
        '<span class="pk-meta">' + esc(metaLine(r)) + "</span></span></button>";
    }).join("");
    listEl.innerHTML = html;
    listEl.classList.toggle("is-busy", !!(S.loading && S.results.length));
    footEl.textContent = desk() ? t("\u2191\u2193 move \u00b7 \u21b5 pick \u00b7 esc close") : "";
    footEl.hidden = !desk() || !S.results.length;
    mark(); place();
  }
  function mark(){
    Array.prototype.forEach.call(listEl.querySelectorAll("[data-pk-i]"), function(el){
      const on = Number(el.getAttribute("data-pk-i")) === S.active;
      el.setAttribute("aria-selected", on ? "true" : "false");
      if (on) { try { el.scrollIntoView({ block: "nearest" }); } catch (_) {} }
    });
    const id = S.results.length ? "pk-o" + S.active : "";
    [S.anchor, inputEl].forEach(function(el){ if (!el) return; if (id) el.setAttribute("aria-activedescendant", id); else el.removeAttribute("aria-activedescendant"); });
  }
  function choose(i){
    const r = S.results[i]; if (!r) return;
    const cb = S.onPick; S.onClose = null;
    close("pick");
    if (cb) cb(r);
  }
  /** Keys while open. Returns true when the picker used the key. */
  function keydown(e){
    if (!S.open) return false;
    if (e.isComposing) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!S.results.length) return false;
      e.preventDefault();
      S.active = (S.active + (e.key === "ArrowDown" ? 1 : -1) + S.results.length) % S.results.length; mark(); return true;
    }
    if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      if (!S.results.length) { if (S.mode === "sheet") { e.preventDefault(); return true; } return false; }
      e.preventDefault(); choose(S.active); return true;
    }
    if (e.key === "Tab" && S.results.length && S.mode === "inline") { e.preventDefault(); choose(S.active); return true; }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close("escape"); return true; }
    return false;
  }

  /* caret position inside a textarea, in viewport px */
  function caretRect(ta){
    const r = ta.getBoundingClientRect(), cs = getComputedStyle(ta);
    const m = document.createElement("div");
    ["boxSizing", "width", "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "borderTopWidth", "borderLeftWidth", "textIndent", "wordSpacing"].forEach(function(k){ m.style[k] = cs[k]; });
    m.style.position = "fixed"; m.style.visibility = "hidden"; m.style.whiteSpace = "pre-wrap"; m.style.wordWrap = "break-word"; m.style.overflow = "hidden";
    m.style.left = r.left + "px"; m.style.top = r.top + "px";
    m.textContent = ta.value.slice(0, ta.selectionStart || 0);
    const s = document.createElement("span"); s.textContent = "\u200b"; m.appendChild(s);
    document.body.appendChild(m);
    const sr = s.getBoundingClientRect(); m.remove();
    return { left: sr.left, top: sr.top - ta.scrollTop, height: sr.height || parseFloat(cs.lineHeight) || 20 };
  }
  function place(){
    if (!S.open || !pop) return;
    pop.style.left = pop.style.top = pop.style.right = pop.style.bottom = pop.style.width = pop.style.maxHeight = "";
    if (S.mode === "sheet") return; // CSS places the sheet
    const vw = window.innerWidth, vv = window.visualViewport;
    const top0 = vv ? vv.offsetTop : 0;
    const a = S.anchor ? caretRect(S.anchor) : { left: 20, top: window.innerHeight - 200, height: 20 };
    const w = desk() ? 380 : Math.min(vw - 20, 520);
    const left = desk() ? Math.max(12, Math.min(a.left - 22, vw - w - 12)) : Math.max(10, (vw - w) / 2);
    // sit above the composer itself, not over its top edge
    const box = S.anchor && S.anchor.closest ? S.anchor.closest(".cap-sheet") : null;
    const ceil = box ? Math.min(a.top, box.getBoundingClientRect().top) : a.top;
    const room = ceil - top0 - 18;
    pop.style.width = w + "px"; pop.style.left = left + "px";
    pop.style.maxHeight = Math.max(160, Math.min(desk() ? 420 : 340, room)) + "px";
    const h = pop.offsetHeight;
    pop.style.top = Math.max(top0 + 8, ceil - h - 10) + "px";
  }
  return { open: open, close: close, isOpen: isOpen, isInline: isInline, setQuery: setQuery, keydown: keydown, place: place };
})();

/* Catalogue answers are fuzzy by design: "Normal People" also returns "Axwell · DJ". Keep the rows that
   share a real word (>= 3 letters) with the query; CJK and wordless queries pass through, and an empty
   filter falls back to the raw rows, because an empty picker is worse than a fuzzy one. */
function pickerRelevant(rows, q){
  const list = Array.isArray(rows) ? rows : [];
  const query = String(q == null ? "" : q);
  if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(query)) return list;
  const keys = (query.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(function(w){ return w.length >= 3; });
  if (!keys.length) return list;
  const out = list.filter(function(r){
    const name = String(r && r.name != null ? r.name : "").toLowerCase();
    const words = name.match(/[\p{L}\p{N}]+/gu) || [];
    return words.some(function(w){ return keys.indexOf(w) >= 0; });
  });
  return out.length ? out : list;
}

window.Picker = Picker;

/* picker:js:end */
