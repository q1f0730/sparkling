/* capture:js:begin */
/* capture:ascii — a just-captured photo is read as coloured characters printed on paper, a slow
   reading pass runs while recognition works, then the print develops into the photo.
   Light and pastoral only: paper ground, ink taken from the photo itself. No glow, no scanlines.
   Ported in spirit from Arcadia's AsciiDevelopImage (ramp, contrast stretch, threshold develop). */
var SpAscii = (function(){
  "use strict";
  var RAMP = "#%*+=~-:,. "; // dark -> light: dense ink for shadows, bare paper for highlights
  var PAPER = [246, 241, 231], INK = [42, 38, 32], WASH = [243, 226, 168];
  var CW = 6.6, CH = 11; // cell = DM Mono 11px advance x line
  function clamp(x){ return x < 0 ? 0 : x > 1 ? 1 : x; }
  function smooth(a, b, x){ var t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); }
  function hash01(x, y, s){
    var h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }
  function seedOf(t){ var h = 2166136261; t = String(t || ""); for (var i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return (h >>> 0) % 100000; }
  function noise(x, y, s){
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash01(xi, yi, s), b = hash01(xi + 1, yi, s), c = hash01(xi, yi + 1, s), d = hash01(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function reduced(){ try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; } }

  /* pixels -> cells (cover crop, 2x2 samples per cell), luminance stretched 4th..96th percentile */
  function sample(img, cols, rows){
    var w = cols * 2, h = rows * 2, n = cols * rows;
    var lum = new Float32Array(n), rgb = new Uint8ClampedArray(n * 3), ok = true;
    try {
      var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      var cx = cv.getContext("2d", { willReadFrequently: true });
      var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      var sc = Math.max(w / iw, h / ih), sw = w / sc, sh = h / sc;
      cx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, w, h);
      var d = cx.getImageData(0, 0, w, h).data;
      for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
        var r = 0, g = 0, b = 0;
        for (var dy = 0; dy < 2; dy++) for (var dx = 0; dx < 2; dx++) {
          var o = ((y * 2 + dy) * w + (x * 2 + dx)) * 4, a = d[o + 3] / 255;
          r += d[o] * a + PAPER[0] * (1 - a); g += d[o + 1] * a + PAPER[1] * (1 - a); b += d[o + 2] * a + PAPER[2] * (1 - a);
        }
        var i = y * cols + x; r /= 4; g /= 4; b /= 4;
        rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b;
        lum[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      }
      var s = Float32Array.from(lum).sort(), lo = s[Math.floor(n * 0.04)], hi = s[Math.min(n - 1, Math.floor(n * 0.96))];
      if (hi - lo > 0.02) for (var k = 0; k < n; k++) lum[k] = clamp((lum[k] - lo) / (hi - lo));
    } catch (_) {
      ok = false; // unreadable pixels: a calm neutral field that still develops into the photo
      for (var yy = 0; yy < rows; yy++) for (var xx = 0; xx < cols; xx++) {
        var j = yy * cols + xx, l = 0.84 + 0.05 * Math.sin(xx * 0.11) * Math.sin(yy * 0.17) + 0.08 * (hash01(xx, yy, 7) - 0.5);
        lum[j] = clamp(l); rgb[j * 3] = 150; rgb[j * 3 + 1] = 140; rgb[j * 3 + 2] = 122;
      }
    }
    return { cols: cols, rows: rows, lum: lum, rgb: rgb, ok: ok };
  }
  function glyph(l, shift){
    var last = RAMP.length - 1, i = Math.round(clamp(l) * last) - Math.round(shift || 0);
    return RAMP.charAt(Math.max(0, Math.min(last, i)));
  }
  /* ink: the photo's own colour pulled down toward ink so it reads on paper */
  function inkOf(g, i, raw){
    var k = 0.76 + 0.24 * raw, m = 0.14 * (1 - raw);
    return [g.rgb[i * 3] * k * (1 - m) + INK[0] * m, g.rgb[i * 3 + 1] * k * (1 - m) + INK[1] * m, g.rgb[i * 3 + 2] * k * (1 - m) + INK[2] * m];
  }

  /* host: a positioned box holding the real <img>; returns a controller */
  function mount(host, img, opts){
    var o = opts || {}, style = o.style || "highlight";
    var cv = document.createElement("canvas");
    cv.className = "cap-ascii-canvas"; cv.setAttribute("aria-hidden", "true");
    host.appendChild(cv);
    host.classList.add("cap-ascii-on");
    var ctx = cv.getContext("2d"), dpr = Math.min(2, window.devicePixelRatio || 1);
    var g = null, W = 0, H = 0, ox = 0, oy = 0, cw = CW, chh = CH, mask = null, mctx = null, mdata = null, seed = seedOf(img.currentSrc || img.src), th = null;
    var raf = 0, t0 = performance.now(), phase = "read", dev = null, frozen = o.freezeAt;
    var rm = reduced();
    function layout(){
      var r = host.getBoundingClientRect();
      W = Math.max(40, Math.round(r.width)); H = Math.max(40, Math.round(r.height));
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = W + "px"; cv.style.height = H + "px";
      var cols = Math.max(8, Math.floor(W / CW)), rows = Math.max(6, Math.floor(H / CH));
      cw = W / cols; chh = H / rows; ox = (cw - CW) / 2; oy = chh * 0.8;
      mask = document.createElement("canvas"); mask.width = cols; mask.height = rows;
      mctx = mask.getContext("2d"); mdata = mctx.createImageData(cols, rows);
      g = sample(img, cols, rows);
      th = new Float32Array(cols * rows);
      var asp = W / H, far = Math.hypot(0.5 * asp, 0.5);
      for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
        var u = (x + 0.5) / cols, v = (y + 0.5) / rows;
        var dd = Math.hypot((u - 0.5) * asp, v - 0.5) / far;
        var nn = noise(u * 4.2, v * 4.2, seed) * 0.7 + noise(u * 11, v * 11, seed + 7) * 0.3;
        th[y * cols + x] = clamp(dd * 0.68 + nn * 0.32);
      }
    }
    function draw(now){
      if (!g) return;
      var t = (frozen != null ? frozen : now - t0) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var cols = g.cols, rows = g.rows, S = 0.55;
      var p = 0;
      if (phase === "develop" && dev) {
        var x0 = clamp(((frozen != null ? frozen : now) - dev.start) / dev.ms);
        p = 1 - Math.pow(1 - x0, 1.7);
      }
      if (phase !== "develop") { ctx.fillStyle = "rgb(" + PAPER.join(",") + ")"; ctx.fillRect(0, 0, W, H); }
      ctx.font = "500 11px 'DM Mono', ui-monospace, Menlo, monospace";
      ctx.textBaseline = "alphabetic";
      // reading pass geometry
      var period = 2.6, band = rm ? -99 : ((t / period) % 1) * (rows + 10) - 5;
      var lx = rm ? -99 : (0.5 + 0.34 * Math.sin(t * 0.9)) * cols, ly = rm ? -99 : (0.5 + 0.3 * Math.sin(t * 1.3 + 1)) * rows;
      if (phase === "read" && style === "highlight" && !rm) {
        var by = (band + 0.5) * chh, bh = chh * 3.4, gr = ctx.createLinearGradient(0, by - bh, 0, by + bh);
        gr.addColorStop(0, "rgba(" + WASH.join(",") + ",0)"); gr.addColorStop(0.5, "rgba(" + WASH.join(",") + ",.62)"); gr.addColorStop(1, "rgba(" + WASH.join(",") + ",0)");
        ctx.fillStyle = gr; ctx.fillRect(0, by - bh, W, bh * 2);
      }
      if (phase === "develop") {
        // paper clears cell by cell: one soft mask (a pixel per cell), scaled up smooth -> no seams
        for (var mi = 0, mn = cols * rows; mi < mn; mi++) {
          var ml = clamp((p * (1 + S) - th[mi]) / S), mo = mi * 4;
          mdata.data[mo] = PAPER[0]; mdata.data[mo + 1] = PAPER[1]; mdata.data[mo + 2] = PAPER[2]; mdata.data[mo + 3] = (1 - smooth(0.42, 1, ml)) * 255;
        }
        mctx.putImageData(mdata, 0, 0);
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
        ctx.drawImage(mask, 0, 0, W, H);
      }
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          var i = y * cols + x, l = g.lum[i], k = 0, shift = 0, alpha = 1, paperA = 1, raw = 0;
          if (phase === "read") {
            if (style === "highlight") {
              var dy = Math.abs(y - band); k = dy < 3.2 ? 1 - dy / 3.2 : 0; k = k * k * (3 - 2 * k);
            } else if (style === "loupe") {
              var dl = Math.hypot((x - lx) * CW, (y - ly) * CH) / (Math.min(W, H) * 0.24); k = dl < 1 ? 1 - dl * dl : 0;
            } else {
              var dr = Math.hypot((x / cols - 0.5) * (cols * CW) / (rows * CH), y / rows - 0.5);
              var ring = Math.sin(dr * 26 - t * 3.2); k = ring > 0.82 ? (ring - 0.82) / 0.18 : 0;
            }
            if (style === "loupe") { var rowT = t * 9 - y; alpha = clamp(rowT - (x / cols) * 2); }
            shift = k * 2; raw = k;
            if (!rm && k < 0.05 && hash01(x, y, Math.floor(t * 3)) > 0.992) shift = 1; // a cell re-read now and then
          } else if (phase === "develop") {
            var loc = clamp((p * (1 + S) - th[i]) / S);
            alpha = 1 - smooth(0.25, 0.9, loc);
            shift = loc < 0.4 ? loc / 0.4 * 2 : 2; raw = clamp(loc * 1.6);
          }
          var ch = glyph(l, shift);
          if (ch === " " || alpha <= 0.01) continue;
          var c = inkOf(g, i, raw);
          ctx.fillStyle = "rgba(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + "," + alpha.toFixed(3) + ")";
          ctx.fillText(ch, ox + x * cw, oy + y * chh);
        }
      }

    }
    function loop(now){
      draw(now);
      if (phase === "develop" && dev && now - dev.start >= dev.ms) { finish(); return; }
      if (frozen == null && phase !== "done") raf = requestAnimationFrame(loop);
    }
    function finish(){
      phase = "done"; cancelAnimationFrame(raf);
      host.classList.remove("cap-ascii-on", "cap-developing");
      if (cv.parentNode) cv.parentNode.removeChild(cv);
      if (dev && dev.done) dev.done();
    }
    function start(){
      layout();
      if (frozen != null) { draw(performance.now()); return; }
      raf = requestAnimationFrame(loop);
    }
    if (img.complete && img.naturalWidth) start(); else { img.addEventListener("load", start, { once: true }); img.addEventListener("error", start, { once: true }); }
    return {
      node: cv,
      get phase(){ return phase; },
      develop: function(ms){
        return new Promise(function(done){
          if (phase === "done") return done();
          if (rm) { cv.style.transition = "opacity 260ms ease-out"; cv.style.opacity = "0"; setTimeout(function(){ dev = { done: done }; finish(); }, 280); return; }
          ms = ms || 1700;
          host.style.setProperty("--dev-ms", ms + "ms");
          host.classList.add("cap-developing");
          dev = { start: performance.now(), ms: ms, done: done }; phase = "develop";
          if (frozen != null) { frozen = null; raf = requestAnimationFrame(loop); }
        });
      },
      freeze: function(atMs, ph, devP){ frozen = atMs; if (ph === "develop") { phase = "develop"; dev = { start: atMs - devP * 1700, ms: 1700 }; host.classList.add("cap-developing"); } draw(performance.now()); },
      stop: function(){ phase = "done"; cancelAnimationFrame(raf); },
      relayout: function(){ if (phase !== "done") { layout(); draw(performance.now()); } },
    };
  }
  return { mount: mount, sample: sample, RAMP: RAMP };
})();

/* capture: the + button and the frosted composer (design/capture/FLOW.md, pick V1).
   One composer for the whole app, built once. renderNotes attaches a feed adapter while Notes is on screen. */
const Capture = (function(){
  const IC = {
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4.5H7.5A1.5 1.5 0 0 0 6 6v12a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 18V8.5z"/><path d="M14 4.5v4h4"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 18.5v-13M6.5 11 12 5.5l5.5 5.5"/></svg>',
  };
  const MAX_PHOTOS = 4, MAX_BYTES = 8 * 1024 * 1024, MIN_READ_MS = 1200, READ_DEADLINE_MS = 25000;
  const IMG_RE = /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i, TEXT_RE = /\.(txt|md|markdown|csv|json|text)$/i;
  const URL_RE = /https?:\/\/[^\s<>"']+/gi;
  let fab = null, veil = null, sheet = null, ta = null, sendBtn = null, linksEl = null, thumbsEl = null, errEl = null, hintEl = null;
  let inCamera = null, inPhoto = null, inFile = null;
  let feed = null, isOpen = false, files = [], nextKey = 1, tmpSeq = 1, lastFocus = null, onNotes = false;
  let tags = [], mirrorEl = null, slashEl = null, tagsEl = null, slashAt = -1;   // "/" tags: { qloo_id, name, type, year, image, sub }
  const local = {};   // note id -> { img, file, reading, state, ctl, host, readStart, text, link, tries }
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
  const reduced = function(){ try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; } };
  const desk = function(){ try { return matchMedia("(min-width:1024px)").matches; } catch (_) { return false; } };

  function build(){
    if (fab) return;
    fab = document.createElement("button");
    fab.type = "button"; fab.className = "cap-fab"; fab.hidden = true;
    fab.setAttribute("aria-controls", "capSheet"); fab.setAttribute("aria-expanded", "false"); fab.setAttribute("aria-haspopup", "dialog");
    fab.innerHTML = IC.plus + '<span class="cap-fab-dot" aria-hidden="true" hidden></span>';
    veil = document.createElement("div"); veil.className = "cap-veil"; veil.hidden = true;
    sheet = document.createElement("div");
    sheet.className = "cap-sheet"; sheet.id = "capSheet"; sheet.hidden = true;
    sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "false");
    sheet.innerHTML =
      '<div class="cap-grab" aria-hidden="true"></div>' +
      '<div class="cap-field"><div class="cap-mirror" aria-hidden="true" data-cap-mirror></div><textarea class="cap-text" rows="3" data-cap-text></textarea></div>' +
      '<p class="cap-slash" data-cap-slash></p>' +
      '<div class="cap-tags" data-cap-tags hidden></div>' +
      '<div class="cap-links" data-cap-links hidden></div>' +
      '<div class="cap-thumbs" data-cap-thumbs hidden></div>' +
      '<p class="cap-err" data-cap-err role="status" hidden></p>' +
      '<div class="cap-bar">' +
        '<button class="cap-tool" type="button" data-cap-camera>' + icons.camera + "</button>" +
        '<button class="cap-tool" type="button" data-cap-photo>' + icons.photo + "</button>" +
        '<button class="cap-tool" type="button" data-cap-file>' + IC.file + "</button>" +
        '<span class="cap-sp"></span><span class="cap-hint" data-cap-hint aria-hidden="true"></span>' +
        '<button class="cap-send" type="button" data-cap-send disabled>' + IC.send + "</button>" +
      "</div>" +
      '<input type="file" accept="image/*" capture="environment" hidden data-in-camera tabindex="-1">' +
      '<input type="file" accept="image/*" multiple hidden data-in-photo tabindex="-1">' +
      '<input type="file" multiple hidden data-in-file tabindex="-1">';
    document.body.appendChild(veil); document.body.appendChild(sheet); document.body.appendChild(fab);
    ta = sheet.querySelector("[data-cap-text]"); sendBtn = sheet.querySelector("[data-cap-send]");
    linksEl = sheet.querySelector("[data-cap-links]"); thumbsEl = sheet.querySelector("[data-cap-thumbs]"); errEl = sheet.querySelector("[data-cap-err]");
    hintEl = sheet.querySelector("[data-cap-hint]");
    mirrorEl = sheet.querySelector("[data-cap-mirror]"); slashEl = sheet.querySelector("[data-cap-slash]"); tagsEl = sheet.querySelector("[data-cap-tags]");
    inCamera = sheet.querySelector("[data-in-camera]"); inPhoto = sheet.querySelector("[data-in-photo]"); inFile = sheet.querySelector("[data-in-file]");

    fab.addEventListener("click", function(){ open(); });
    veil.addEventListener("click", function(){ close(); });
    ta.addEventListener("input", function(e){ saveDraft(); sync(); grow(); paintTags(); if (!e.isComposing) slashCheck(); });
    ta.addEventListener("compositionend", function(){ slashCheck(); });
    ta.addEventListener("scroll", function(){ if (mirrorEl) mirrorEl.scrollTop = ta.scrollTop; });
    ta.addEventListener("click", function(){ slashCheck(); });
    ta.addEventListener("keyup", function(e){ if (/^Arrow(Left|Right)$|^Home$|^End$/.test(e.key)) slashCheck(); });
    ta.addEventListener("blur", function(){ setTimeout(function(){ if (document.activeElement !== ta && window.Picker && Picker.isInline()) Picker.close("blur"); }, 120); });
    ta.addEventListener("paste", function(e){
      const cb = e.clipboardData; if (!cb) return;
      const imgs = Array.prototype.filter.call(cb.files || [], function(f){ return isImage(f); });
      if (imgs.length) { e.preventDefault(); addFiles(imgs); }
    });
    ta.addEventListener("keydown", function(e){
      if (window.Picker && Picker.isInline() && Picker.keydown(e)) return;
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
    });
    sheet.addEventListener("keydown", function(e){
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key === "Tab") trap(e);
    });
    sheet.addEventListener("dragover", function(e){ e.preventDefault(); });
    sheet.addEventListener("drop", function(e){ e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files); });
    sheet.addEventListener("click", function(e){
      if (e.target.closest("[data-cap-camera]")) { inCamera.click(); return; }
      if (e.target.closest("[data-cap-photo]")) { inPhoto.click(); return; }
      if (e.target.closest("[data-cap-file]")) { inFile.click(); return; }
      if (e.target.closest("[data-cap-send]")) { send(); return; }
      const rm = e.target.closest("[data-cap-rm]");
      if (rm) { const k = Number(rm.getAttribute("data-cap-rm")); files = files.filter(function(f){ return f.key !== k; }); paintThumbs(); sync(); ta.focus(); return; }
      const rt = e.target.closest("[data-cap-rmtag]");
      if (rt) { const id = rt.getAttribute("data-cap-rmtag"); tags = tags.filter(function(g){ return g.qloo_id !== id; }); saveTags(); paintTags(); ta.focus(); return; }
      const rl = e.target.closest("[data-cap-rmlink]");
      if (rl) { const u = rl.getAttribute("data-cap-rmlink"); ta.value = ta.value.split(u).join("").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim(); saveDraft(); sync(); grow(); ta.focus(); }
    });
    [inCamera, inPhoto, inFile].forEach(function(inp){
      inp.addEventListener("change", function(){ addFiles(inp.files); inp.value = ""; });
    });
    // the sheet sits above the on-screen keyboard
    if (window.visualViewport) {
      const vv = window.visualViewport;
      const kb = function(){ const h = Math.max(0, window.innerHeight - vv.height - vv.offsetTop); sheet.style.setProperty("--cap-kb", (h > 60 ? h : 0) + "px"); };
      vv.addEventListener("resize", kb); vv.addEventListener("scroll", kb);
    }
    // swipe the sheet down to close (mobile)
    let y0 = null;
    sheet.addEventListener("touchstart", function(e){ if (e.target.closest(".cap-grab") || (e.target === sheet)) y0 = e.touches[0].clientY; }, { passive: true });
    sheet.addEventListener("touchmove", function(e){ if (y0 == null) return; const d = Math.max(0, e.touches[0].clientY - y0); sheet.style.transform = "translateY(" + d + "px)"; }, { passive: true });
    sheet.addEventListener("touchend", function(e){ if (y0 == null) return; const d = (e.changedTouches[0].clientY - y0); y0 = null; sheet.style.transform = ""; if (d > 80) close(); });
    document.addEventListener("keydown", function(e){
      if (e.key !== "n" && e.key !== "N") return;
      if (e.metaKey || e.ctrlKey || e.altKey || isOpen || !state.user) return;
      const a = document.activeElement;
      if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
      if (document.querySelector("dialog[open]")) return;
      e.preventDefault(); openAnywhere();
    });
    document.addEventListener("click", function(e){
      const r = e.target.closest("[data-cap-retry]");
      if (r) { retry(r.getAttribute("data-cap-retry")); return; }
      const d = e.target.closest("[data-cap-discard]");
      if (d) discard(d.getAttribute("data-cap-discard"));
    });
    window.addEventListener("online", function(){ Object.keys(local).forEach(function(id){ if (local[id].state === "offline") retry(id); }); });
    window.addEventListener("hashchange", function(){ if (isOpen) close(true); });
  }

  function labels(){
    if (!sheet) return;
    fab.setAttribute("aria-label", t("New note"));
    fab.title = t("New note") + (desk() ? " (N)" : "");
    sheet.setAttribute("aria-label", t("New note"));
    ta.setAttribute("aria-label", t("Write a note"));
    ta.placeholder = t("What stayed with you today?");
    sheet.querySelector("[data-cap-camera]").setAttribute("aria-label", t("Take a photo"));
    sheet.querySelector("[data-cap-photo]").setAttribute("aria-label", t("Add a photo"));
    sheet.querySelector("[data-cap-file]").setAttribute("aria-label", t("Attach a file"));
    sendBtn.setAttribute("aria-label", t("Save note"));
    hintEl.textContent = t(isMac ? "\u2318\u21b5 to save" : "Ctrl \u21b5 to save");
    slashEl.innerHTML = LANG === "zh" ? "输入 <kbd>/</kbd> 标记具体的人或作品" : "Type <kbd>/</kbd> to tag something";
  }
  function isImage(f){ return !!f && ((f.type && f.type.indexOf("image/") === 0) || IMG_RE.test(f.name || "")); }
  function isText(f){ return !!f && ((f.type && /^text\/|json/.test(f.type)) || TEXT_RE.test(f.name || "")); }
  function showErr(msg, soft){ errEl.textContent = msg || ""; errEl.hidden = !msg; errEl.classList.toggle("soft", !!soft); }
  function addFiles(list){
    const arr = Array.prototype.slice.call(list || []);
    if (!arr.length) return;
    let msg = "", soft = false;
    arr.forEach(function(f){
      if (isImage(f)) {
        if (f.size > MAX_BYTES) { msg = t("A photo over 8 MB stayed out."); return; }
        if (files.length >= MAX_PHOTOS) { msg = t("Four photos per note is the limit."); return; }
        files.push({ key: nextKey++, file: f, url: URL.createObjectURL(f) });
      } else if (isText(f) && f.size < 200000) {
        f.text().then(function(txt){
          const add = String(txt || "").trim().slice(0, 4000);
          if (!add) return;
          ta.value = (ta.value.trim() ? ta.value.replace(/\s+$/, "") + "\n\n" : "") + add;
          saveDraft(); sync(); grow();
          const nm = f.name || "file";
          showErr(LANG === "zh" ? "已加入 " + nm + " 里的文字。" : "Added the text from " + nm + ".", true);
        });
      } else {
        msg = t("Sparkling keeps photos and text files for now.");
      }
    });
    if (msg) showErr(msg, soft); else showErr("");
    paintThumbs(); sync();
    if (isOpen) ta.focus();
  }
  function paintThumbs(){
    thumbsEl.hidden = !files.length;
    thumbsEl.innerHTML = files.map(function(f, i){
      return '<span class="cap-thumb"><img src="' + attr(f.url) + '" alt="' + attr(t("Photo") + " " + (i + 1)) + '">' +
        '<button type="button" data-cap-rm="' + f.key + '" aria-label="' + attr(t("Remove photo")) + '">' + icons.close + "</button></span>";
    }).join("");
  }
  function urlsIn(text){ const m = String(text || "").match(URL_RE) || []; return m.map(function(u){ return u.replace(/[.,;:!?)\]}'"]+$/, ""); }).filter(function(u, i, a){ return safeHttpUrl(u) && a.indexOf(u) === i; }); }
  function sync(){
    const text = ta.value.trim(), links = urlsIn(ta.value);
    sendBtn.disabled = !(text || files.length);
    linksEl.hidden = !links.length;
    linksEl.innerHTML = links.slice(0, 3).map(function(u){
      return '<span class="cap-link">' + icons.link + '<span translate="no">' + esc(linkHost(u)) + "</span>" +
        '<button type="button" data-cap-rmlink="' + attr(u) + '" aria-label="' + attr(t("Remove link")) + '">' + icons.close + "</button></span>";
    }).join("");
    fab.querySelector(".cap-fab-dot").hidden = isOpen || !(text || files.length);
    if (slashEl) slashEl.hidden = !!ta.value;
  }
  /* ---- "/" tags ---- */
  function tagKey(){ return draftKey() + ".tags"; }
  function saveTags(){ try { if (tags.length) localStorage.setItem(tagKey(), JSON.stringify(tags)); else localStorage.removeItem(tagKey()); } catch (_) {} }
  function loadTags(){ if (tags.length) return; try { const v = JSON.parse(localStorage.getItem(tagKey()) || "[]"); if (Array.isArray(v)) tags = v.filter(function(g){ return g && g.qloo_id && g.name; }); } catch (_) {} }
  /** tags whose name is still in the text, with their spans (left to right, no overlaps) */
  function liveTags(text){
    const out = [], used = [];
    tags.forEach(function(g){
      let from = 0, at = -1;
      while ((at = text.indexOf(g.name, from)) >= 0) {
        const end = at + g.name.length;
        if (!used.some(function(u){ return at < u[1] && end > u[0]; })) break;
        from = at + 1;
      }
      if (at >= 0) { used.push([at, at + g.name.length]); out.push({ g: g, start: at, end: at + g.name.length }); }
    });
    return out.sort(function(a, b){ return a.start - b.start; });
  }
  function paintTags(){
    if (!mirrorEl) return;
    const text = ta.value, live = liveTags(text);
    if (live.length !== tags.length) { tags = live.map(function(x){ return x.g; }); saveTags(); }
    let html = "", pos = 0;
    live.forEach(function(x){ html += esc(text.slice(pos, x.start)) + '<mark class="' + typeClass(x.g.type) + '">' + esc(text.slice(x.start, x.end)) + "</mark>"; pos = x.end; });
    mirrorEl.innerHTML = html + esc(text.slice(pos)) + "\u200b";
    mirrorEl.scrollTop = ta.scrollTop;
    tagsEl.hidden = !live.length;
    tagsEl.innerHTML = live.map(function(x){
      const g = x.g, img = imgSrc(g.image);
      return '<span class="cap-tag">' + (img ? '<img src="' + attr(img) + '" alt="" onerror="this.remove()">' : "<i></i>") +
        '<span translate="no">' + esc(g.name) + "</span><em>" + esc(t(typeLabel(g.type))) + "</em>" +
        '<button type="button" data-cap-rmtag="' + attr(g.qloo_id) + '" aria-label="' + attr(t("Remove tag")) + '">' + icons.close + "</button></span>";
    }).join("");
  }
  /** "/" at the start or after a space opens the picker; the text after it is the query */
  function slashCheck(){
    if (!window.Picker || !isOpen) return;
    const caret = ta.selectionStart || 0;
    if (caret !== ta.selectionEnd) { if (Picker.isInline()) Picker.close("select"); return; }
    const before = ta.value.slice(0, caret);
    const m = before.match(/(^|\s)\/([^\s\/][^\n\/]{0,39})?$/);
    if (!m || /\s{2}$/.test(before) || (m[2] || "").split(" ").length > 4) { slashAt = -1; if (Picker.isInline()) Picker.close("text"); return; }
    const q = m[2] || "";
    const at = caret - q.length - 1;
    if (Picker.isInline() && at === slashAt) { Picker.setQuery(q); return; }
    slashAt = at;
    Picker.open({ mode: "inline", anchor: ta, query: q, onPick: function(r){ pickTag(r, at); }, onClose: function(){ slashAt = -1; } });
  }
  function pickTag(r, at){
    const caret = ta.selectionStart || 0;
    const v = ta.value;
    if (v.charAt(at) !== "/") return;
    const name = String(r.name || "").trim(); if (!name) return;
    const after = v.slice(caret);
    const ins = name + (/^\s/.test(after) ? "" : " ");
    ta.value = v.slice(0, at) + ins + after;
    tags = tags.filter(function(g){ return g.qloo_id !== r.qloo_id; });
    tags.push({ qloo_id: r.qloo_id, name: name, type: r.type, year: r.year || undefined, image: r.image || undefined, sub: r.sub || undefined });
    slashAt = -1;
    const pos = at + ins.length;
    try { ta.focus(); ta.setSelectionRange(pos, pos); } catch (_) {}
    saveTags(); saveDraft(); sync(); grow(); paintTags();
  }
  function grow(){ ta.style.height = "auto"; ta.style.height = Math.min(220, Math.max(76, ta.scrollHeight)) + "px"; }
  function saveDraft(){ try { writeDraft(ta.value, ""); } catch (_) {} }
  function loadDraft(){
    if (ta.value) return;
    const d = readDraft();
    let text = String(d.text || "");
    if (d.link && text.indexOf(d.link) < 0) text = (text ? text.replace(/\s+$/, "") + " " : "") + d.link;
    ta.value = text;
  }
  function trap(e){
    const f = Array.prototype.filter.call(sheet.querySelectorAll("button:not([disabled]),textarea"), function(el){ return el.offsetParent !== null; });
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function springFrom(){
    const a = fab.getBoundingClientRect(), b = sheet.getBoundingClientRect();
    const fx = a.width ? a.left + a.width / 2 : b.right - 28, fy = a.height ? a.top + a.height / 2 : b.bottom - 28;
    return { dx: fx - (b.left + b.width / 2), dy: fy - (b.top + b.height / 2), s: Math.max(0.08, 56 / Math.max(b.width, 1)) };
  }

  function open(opts){
    build(); labels();
    const o = opts || {};
    if (isOpen) { if (o.text) { ta.value = o.text + ta.value; sync(); } ta.focus(); return; }
    isOpen = true; lastFocus = document.activeElement;
    if (sheet.getAnimations) sheet.getAnimations().forEach(function(a){ a.cancel(); });
    loadDraft();
    if (o.text && ta.value.indexOf(o.text) < 0) ta.value = o.text + ta.value;
    loadTags(); paintTags();
    sheet.hidden = false; veil.hidden = false;
    fab.classList.add("is-open"); fab.setAttribute("aria-expanded", "true");
    paintThumbs(); sync(); grow(); showErr("");
    requestAnimationFrame(function(){ veil.classList.add("on"); });
    if (!reduced() && sheet.animate) {
      const f = springFrom();
      sheet.animate([
        { transform: "translate(" + f.dx + "px," + f.dy + "px) scale(" + f.s + ")", opacity: 0, borderRadius: "40px" },
        { opacity: 1, offset: 0.35 },
        { transform: "none", opacity: 1, borderRadius: getComputedStyle(sheet).borderRadius },
      ], { duration: 420, easing: "cubic-bezier(.2,1.12,.3,1)" });
    }
    setTimeout(function(){ try { ta.focus(); const n = ta.value.length; ta.setSelectionRange(n, n); } catch (_) {} }, reduced() ? 0 : 60);
  }
  function close(silent){
    if (!isOpen) return;
    isOpen = false;
    if (window.Picker && Picker.isInline()) Picker.close("composer");
    saveDraft();
    fab.classList.remove("is-open"); fab.setAttribute("aria-expanded", "false");
    veil.classList.remove("on");
    const done = function(){ if (isOpen) return; sheet.hidden = true; veil.hidden = true; sync(); };
    if (!reduced() && sheet.animate && !silent) {
      const f = springFrom();
      const a = sheet.animate([{ transform: "none", opacity: 1 }, { transform: "translate(" + f.dx + "px," + f.dy + "px) scale(" + f.s + ")", opacity: 0 }],
        { duration: 260, easing: "cubic-bezier(.5,0,.75,.2)" });
      a.onfinish = done;
    } else done();
    if (!silent) { try { (fab.hidden ? lastFocus : fab).focus({ preventScroll: true }); } catch (_) {} }
  }
  function openAnywhere(opts){
    if (onNotes) { open(opts); return; }
    state.capOpen = opts || {};
    go("#/notes");
  }

  /* ---- sending: optimistic note at the top of the feed ---- */
  function tempNote(id, text, link, withPhoto){
    return { id: id, text: text, link: link || null, created_at: Date.now(), status: "pending", mentions: [], card_count: 0, kind: withPhoto ? "photo" : (link ? "link" : "text") };
  }
  function send(){
    const raw = ta.value.trim();
    if (!raw && !files.length) { ta.focus(); return; }
    const links = urlsIn(raw), link = links[0] || "";
    const tagged = liveTags(raw).map(function(x){ return { qloo_id: x.g.qloo_id, name: x.g.name, type: x.g.type, year: x.g.year, image: x.g.image }; });
    const jobs = [];
    if (!files.length) jobs.push({ text: raw, link: link, file: null, url: null, tags: tagged });
    else files.forEach(function(f, i){ jobs.push({ text: i === 0 ? raw : "", link: i === 0 ? link : "", file: f.file, url: f.url, tags: i === 0 ? tagged : [] }); });
    if (window.Picker && Picker.isInline()) Picker.close("send");
    ta.value = ""; files = []; tags = []; saveTags(); clearDraft(); paintThumbs(); paintTags(); showErr(""); sync();
    close(true);
    // collapse back into the + (the note itself is the confirmation)
    if (!reduced() && sheet.animate) {
      sheet.hidden = false;
      const f = springFrom();
      const a = sheet.animate([{ transform: "none", opacity: 1 }, { transform: "translate(" + f.dx + "px," + f.dy + "px) scale(" + f.s + ")", opacity: 0 }], { duration: 300, easing: "cubic-bezier(.4,0,.2,1)" });
      a.onfinish = function(){ if (isOpen) return; sheet.hidden = true; veil.hidden = true; };
    } else { sheet.hidden = true; veil.hidden = true; }
    try { fab.focus({ preventScroll: true }); } catch (_) {}
    const ids = jobs.map(function(j){
      const id = "tmp-" + (tmpSeq++);
      local[id] = { img: j.url, file: j.file, reading: !!j.file, big: !!j.file, state: "saving", text: j.text, link: j.link, tags: j.tags || [], tries: 0 };
      return id;
    });
    // newest on top: add the last first so the first photo ends up highest
    for (let i = jobs.length - 1; i >= 0; i--) {
      const j = jobs[i];
      if (feed) feed.add(tempNote(ids[i], j.text, j.link, !!j.file));
    }
    if (!feed) { toast(t("Saving your note.")); }
    (async function(){ for (let i = 0; i < ids.length; i++) await deliver(ids[i]); })();
  }
  async function deliver(id){
    const L = local[id]; if (!L) return;
    L.tries += 1; L.state = "saving"; render(id);
    if (navigator.onLine === false) { L.state = "offline"; stopReading(L); render(id); return; }
    try {
      let data;
      if (L.file) {
        const fd = new FormData();
        fd.append("file", L.file, L.file.name || "photo.jpg");
        fd.append("caption", L.text || "");
        if (L.tags && L.tags.length) fd.append("tags", JSON.stringify(L.tags));
        data = await api("/api/notes/photo", { method: "POST", body: fd });
      } else {
        let text = L.text; const body = { text: text };
        if (L.link) body.link = L.link;
        if (L.tags && L.tags.length) body.tags = L.tags;
        data = await api("/api/notes", { method: "POST", body: body });
      }
      if (data && data.error) throw new Error(data.error);
      const note = data && data.note;
      if (!note || !note.id) throw new Error("no note");
      const real = String(note.id);
      local[real] = L; delete local[id];
      L.state = "sent";
      if (feed) feed.replace(id, note, {});
      if (L.file) await readPhoto(real, note);
      else if (feed) feed.poll(note); else refreshMe();
    } catch (e) {
      L.state = (navigator.onLine === false || (e && e.offline)) ? "offline" : "failed";
      L.err = e && (e.status === 413 || /large|8 MB/i.test(e.message || "")) ? "large" : "";
      stopReading(L);
      render(id);
    }
  }
  function stopReading(L){ if (L.ctl) { try { L.ctl.stop(); } catch (_) {} } }
  async function readPhoto(id, note){
    const L = local[id]; if (!L) return;
    if (!L.readStart) L.readStart = Date.now();
    let fresh = note;
    const deadline = Date.now() + READ_DEADLINE_MS;
    while (fresh && fresh.status === "pending" && Date.now() < deadline) {
      await sleep(1400);
      try { const d = await api("/api/notes/" + encodeURIComponent(id)); if (d && d.note) fresh = d.note; else break; }
      catch (e) { if (e && e.status === 404) return; }
    }
    const wait = MIN_READ_MS - (Date.now() - L.readStart);
    if (wait > 0) await sleep(wait);
    const cap = L.host && L.host.querySelector(".cap-reading");
    if (cap) cap.classList.add("off");
    if (L.ctl) { try { await L.ctl.develop(1700); } catch (_) {} }
    L.reading = false; L.ctl = null;
    await settle(L);
    L.big = false;
    if (feed && fresh) {
      feed.replace(id, fresh, { draw: true, plus: true });
      try { if (window.Fx && Fx.grow) { const nn = document.querySelector('#view [data-note-id="' + id.replace(/"/g, "") + '"]'); if (nn) Fx.grow(nn); } } catch (_) {}
      if (fresh.status === "pending") feed.poll(fresh);
    }
    refreshMe();
  }
  /* the print settles into the feed's usual 74 px thumbnail */
  function settle(L){
    return new Promise(function(done){
      const host = L.host, img = host && host.querySelector(".note-photo");
      if (!host || !img || !document.body.contains(host) || reduced()) return done();
      setTimeout(function(){
        const r = host.getBoundingClientRect();
        host.style.width = r.width + "px"; host.style.height = r.height + "px"; host.style.aspectRatio = "auto";
        img.style.width = r.width + "px"; img.style.height = r.height + "px";
        host.offsetWidth; // commit the start size
        host.classList.add("cap-settle");
        host.style.width = "74px"; host.style.height = "74px"; host.style.borderRadius = "11px";
        img.style.width = "74px"; img.style.height = "74px";
        setTimeout(done, 520);
      }, 450);
    });
  }
  function retry(id){
    const L = local[id]; if (!L || L.state === "saving") return;
    if (L.host) { const c = L.host.querySelector(".cap-ascii-canvas"); if (c) c.remove(); L.host = null; }
    L.ctl = null; L.readStart = 0; L.reading = !!L.file; L.big = !!L.file;
    deliver(id);
  }
  function discard(id){
    const L = local[id]; if (!L) return;
    stopReading(L); delete local[id];
    if (feed) feed.remove(id);
  }
  function render(id){
    const L = local[id]; if (!L || !feed) return;
    feed.replace(id, tempNote(id, L.text, L.link, !!L.file), {});
  }

  /* ---- hooks used by noteHTML / paintTimeline ---- */
  /* temp notes still in flight survive a feed reload */
  function merge(list){
    const have = {}; list.forEach(function(n){ have[String(n.id)] = 1; });
    const extra = Object.keys(local).filter(function(id){ return id.indexOf("tmp-") === 0 && !have[id]; }).map(function(id){ const L = local[id]; return tempNote(id, L.text, L.link, !!L.file); });
    return extra.length ? extra.concat(list) : list;
  }
  function localFor(id){ return local[String(id)] || null; }
  function mediaHTML(id){
    const L = local[String(id)]; if (!L || !L.img) return "";
    const live = L.reading && L.state !== "failed" && L.state !== "offline";
    return '<div class="note-media cap-media' + (L.reading || L.big ? " cap-big" : "") + '" data-cap-media="' + attr(id) + '"><img class="note-photo" src="' + attr(L.img) + '" alt="' + attr(t("Photo attached to this note")) + '">' +
      (live ? '<span class="cap-reading" aria-live="polite"><i aria-hidden="true"></i><span>' + esc(t(L.state === "saving" ? "Saving the photo" : "Reading the picture")) + "</span></span>" : "") + "</div>";
  }
  function footHTML(id){
    const L = local[String(id)]; if (!L) return "";
    if (L.state === "saving") return '<span class="note-count cap-state">' + esc(t("Saving")) + "…</span>";
    if (L.state === "offline") return '<span class="note-count cap-state"><b>' + esc(t("Waiting for a connection")) + '</b><button type="button" class="cap-act quiet" data-cap-discard="' + attr(id) + '">' + esc(t("Discard")) + "</button></span>";
    if (L.state === "failed") return '<span class="note-count cap-state"><b>' + esc(t(L.err === "large" ? "Too large to save" : "Didn't save")) + '</b><button type="button" class="cap-act" data-cap-retry="' + attr(id) + '">' + esc(t("Retry")) + '</button><button type="button" class="cap-act quiet" data-cap-discard="' + attr(id) + '">' + esc(t("Discard")) + "</button></span>";
    return "";
  }
  /* after any repaint: put the live print back, or start one */
  function remount(){
    Array.prototype.forEach.call(document.querySelectorAll("#view [data-cap-media]"), function(ph){
      const id = ph.getAttribute("data-cap-media"), L = local[id];
      if (!L) return;
      if (L.host && L.host !== ph && L.host.querySelector(".cap-ascii-canvas")) {
        // keep the running print; refresh its caption
        const cap = ph.querySelector(".cap-reading"), old = L.host.querySelector(".cap-reading");
        if (old && cap) old.replaceWith(cap); else if (old && !cap) old.remove(); else if (cap && !old) L.host.appendChild(cap);
        L.host.setAttribute("data-cap-media", id);
        ph.replaceWith(L.host);
        return;
      }
      L.host = ph;
      if (L.reading && !L.ctl && window.SpAscii && L.state !== "failed" && L.state !== "offline") {
        const img = ph.querySelector("img");
        L.ctl = SpAscii.mount(ph, img, { style: "highlight" });
        if (!L.readStart) L.readStart = Date.now();
      }
    });
    Array.prototype.forEach.call(document.querySelectorAll("#view [data-note-id]"), function(n){
      const L = local[n.getAttribute("data-note-id")];
      n.classList.toggle("cap-temp", !!L && (L.state === "saving" || L.state === "failed" || L.state === "offline"));
      n.classList.toggle("cap-failed", !!L && (L.state === "failed" || L.state === "offline"));
    });
  }
  /* FLIP: older notes glide down, the new one rises in */
  function flip(container, mutate, newId){
    const before = {};
    Array.prototype.forEach.call(container.querySelectorAll("[data-note-id]"), function(n){ before[n.getAttribute("data-note-id")] = n.getBoundingClientRect().top; });
    mutate();
    if (reduced()) return;
    Array.prototype.forEach.call(container.querySelectorAll("[data-note-id]"), function(n){
      const id = n.getAttribute("data-note-id"), top = n.getBoundingClientRect().top;
      if (id === String(newId)) {
        n.classList.add("cap-arrive");
        n.animate([{ transform: "translateY(18px) scale(.985)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 460, easing: "cubic-bezier(.2,.9,.25,1)" }).onfinish = function(){ n.classList.remove("cap-arrive"); };
      } else if (before[id] != null && Math.abs(before[id] - top) > 1) {
        n.animate([{ transform: "translateY(" + (before[id] - top) + "px)" }, { transform: "none" }], { duration: 420, easing: "cubic-bezier(.2,.8,.25,1)" });
      }
    });
  }

  function attach(adapter){
    build(); labels(); feed = adapter; onNotes = true;
    document.documentElement.classList.add("cap-on");
    fab.hidden = false; sync();
    const pending = state.capOpen; state.capOpen = null;
    if (pending) setTimeout(function(){ open(pending); }, 120);
  }
  function detach(){
    feed = null; onNotes = false;
    document.documentElement.classList.remove("cap-on");
    if (fab) { if (isOpen) close(true); fab.hidden = true; }
  }
  return { open: openAnywhere, close: close, attach: attach, detach: detach, localFor: localFor, mediaHTML: mediaHTML, footHTML: footHTML, remount: remount, flip: flip, merge: merge, labels: labels };
})();
window.Capture = Capture;

/* capture:js:end */
