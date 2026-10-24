/* ==== r6 motion layer (original implementation; look inspired by RewampUI, rewampui.com) ====
   Liquid gradient + paper strata (WebGL1, one tiny full-screen quad each, half-res, paused offscreen),
   word reveal, morphing tab blob (two-edge spring), inbox deck swipe, card->detail hero, slide to confirm. */
(function(){
  const RM = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  const reduced = function(){ return !!RM.matches; };
  const Fx = window.Fx = {};

  /* ---- colours from the B tokens (works for Light / Paper / System-dark) ---- */
  const cv = document.createElement("canvas").getContext("2d");
  function rgb(name){
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#f3eee3";
    cv.fillStyle = "#000"; cv.fillStyle = v; const s = cv.fillStyle;
    if (s[0] === "#") return [1, 3, 5].map(function(i){ return parseInt(s.substr(i, 2), 16) / 255; });
    const m = s.match(/[\d.]+/g) || [0, 0, 0]; return [m[0] / 255, m[1] / 255, m[2] / 255];
  }
  function palette(){
    return { paper: rgb("--b-paper"), sage: rgb("--b-sage"), sageInk: rgb("--b-sage-ink"), clay: rgb("--b-clay"), clayInk: rgb("--b-clay-ink"), butter: rgb("--b-butter"), butterInk: rgb("--b-butter-ink"), card: rgb("--b-card") };
  }

  const VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
  const COMMON = "precision mediump float;uniform vec2 uR;uniform float uT;uniform vec2 uP;uniform float uE;uniform float uK;" +
    "uniform vec3 cPaper,cSage,cSageI,cClay,cClayI,cButter,cButterI,cCard;" +
    "float bl(vec2 u,vec2 c,float r){vec2 d=u-c;return exp(-dot(d,d)/(r*r));}";
  /* liquid: three drifting colour pools + one that trails the finger, inside a slowly warped field */
  const LIQUID = COMMON + "void main(){vec2 uv=gl_FragCoord.xy/uR;float a=uR.x/uR.y;vec2 p=vec2(uv.x*a,uv.y);float t=uT;" +
    "vec2 w=p+.07*vec2(sin(p.y*3.1+t*.33),cos(p.x*2.6-t*.29))+.025*vec2(sin(p.y*7.3+t*.7),cos(p.x*6.1-t*.55));" +
    "vec3 sage=mix(cSage,cSageI,.34),clay=mix(cClay,cClayI,.2),butter=mix(cButter,cButterI,.08);" +
    "vec3 c=cPaper;" +
    "c=mix(c,sage,.9*bl(w,vec2(a*(.18+.1*sin(t*.21)),.78+.09*cos(t*.17)),.55));" +
    "c=mix(c,butter,.85*bl(w,vec2(a*(.86+.08*cos(t*.19)),.42+.12*sin(t*.23)),.5));" +
    "c=mix(c,clay,.8*bl(w,vec2(a*(.5+.2*sin(t*.13+1.)),.06+.08*cos(t*.27)),.48));" +
    "vec2 cp=vec2(uP.x*a,uP.y);vec3 warm=mix(mix(cClay,cClayI,.34),butter,.3);c=mix(c,warm,(.74+.2*uE)*bl(w,cp,(.4+.1*uE)*uK));c=mix(c,mix(cCard,vec3(1.),.4),.5*bl(w,cp+vec2(-.05,.06)*uK,.16*uK));" +
    "c=mix(c,clay,.35*uE*bl(w,cp+vec2(.12,-.08),.18));" +
    "gl_FragColor=vec4(c,1.);}";
  /* paper strata: five cut sheets stepping down to the lower right, soft shadow under each, light rim on the cut */
  const PAPER = COMMON + "vec2 rot(vec2 p,float a){float s=sin(a),c=cos(a);return vec2(p.x*c-p.y*s,p.x*s+p.y*c);}" +
    "void main(){vec2 uv=gl_FragCoord.xy/uR;float a=uR.x/uR.y;vec2 p=rot((uv-vec2(.5))*vec2(a,1.)*2.,-.42);float t=uT*.32;" +
    "vec3 pal[5];pal[0]=mix(cPaper,cSage,.65);pal[1]=mix(cPaper,cButter,.85);pal[2]=mix(cSage,cSageI,.1);pal[3]=mix(cPaper,cClay,.9);pal[4]=mix(cClay,cClayI,.12);" +
    "vec3 c=cPaper;" +
    "for(int i=0;i<5;i++){float f=float(i);float base=-.12-f*.22;" +
    "float wv=sin(p.x*1.7+t*.9+f*.85)*.1+cos(p.x*3.3-t*.7+f*1.2)*.03+sin(p.x*.8+t*.45)*.05;" +
    "float d=(base+wv)-p.y;" +
    "float sh=smoothstep(-.16,0.,d)*(1.-step(0.,d));c=mix(c,c*vec3(.84,.81,.76),sh*.42);" +
    "vec3 lc=pal[i];lc=mix(lc,lc*.96,clamp(d*.5,0.,1.));lc+=vec3(.16)*smoothstep(.02,.002,d)*smoothstep(-.004,.002,d);" +
    "c=mix(c,lc,smoothstep(-.004,.004,d));}" +
    "gl_FragColor=vec4(c,1.);}";

  const live = new Set();
  function mount(host, kind){
    if (!host || host.querySelector(":scope > .fx-bg")) return;
    host.classList.add("fx-host");
    const bg = document.createElement("div");
    bg.className = "fx-bg"; bg.setAttribute("aria-hidden", "true");
    host.insertBefore(bg, host.firstChild);
    const canvas = document.createElement("canvas");
    let gl = null;
    try { gl = canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: "low-power" }); } catch (_) {}
    if (!gl) { bg.classList.add("fx-static"); return; }
    function sh(type, src){ const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; }
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, kind === "paper" ? PAPER : LIQUID);
    if (!vs || !fs) { bg.classList.add("fx-static"); return; }
    const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { bg.classList.add("fx-static"); return; }
    gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {}; ["uR", "uT", "uP", "uE", "uK", "cPaper", "cSage", "cSageI", "cClay", "cClayI", "cButter", "cButterI", "cCard"].forEach(function(n){ U[n] = gl.getUniformLocation(pr, n); });
    function colours(){ const c = palette(); gl.uniform3fv(U.cPaper, c.paper); gl.uniform3fv(U.cSage, c.sage); gl.uniform3fv(U.cSageI, c.sageInk); gl.uniform3fv(U.cClay, c.clay); gl.uniform3fv(U.cClayI, c.clayInk); gl.uniform3fv(U.cButter, c.butter); gl.uniform3fv(U.cButterI, c.butterInk); gl.uniform3fv(U.cCard, c.card); }
    colours();
    bg.appendChild(canvas);
    const scale = kind === "paper" ? Math.min(devicePixelRatio || 1, 1.5) : 0.5; /* liquid is pure blur: half-res is free quality */
    function size(){ const r = bg.getBoundingClientRect(); const w = Math.max(2, Math.round(r.width * scale)), h = Math.max(2, Math.round(r.height * scale)); if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); gl.uniform2f(U.uR, w, h); gl.uniform1f(U.uK, Math.max(.35, Math.min(1, 190 / Math.max(1, r.height)))); } }
    size();
    /* pointer: spring-follow (low stiffness, light damping = liquid lag) */
    const st = { x: .62, y: .45, vx: 0, vy: 0, tx: .62, ty: .45, e: 0, touched: 0, visible: true, raf: 0, t0: performance.now(), last: performance.now() };
    function onMove(e){ const r = bg.getBoundingClientRect(); if (!r.width) return; st.tx = (e.clientX - r.left) / r.width; st.ty = 1 - (e.clientY - r.top) / r.height; st.touched = performance.now(); }
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    const io = "IntersectionObserver" in window ? new IntersectionObserver(function(en){ st.visible = en[0].isIntersecting; if (st.visible) kick(); }, { threshold: 0 }) : null;
    if (io) io.observe(bg);
    function draw(now){
      const dt = Math.min(.05, (now - st.last) / 1000); st.last = now;
      const t = (now - st.t0) / 1000;
      if (now - st.touched > 2600) { st.tx = .55 + .3 * Math.sin(t * .23); st.ty = .5 + .25 * Math.cos(t * .31); }
      const k = 46, d = 10; /* stiffness, damping */
      st.vx += ((st.tx - st.x) * k - st.vx * d) * dt; st.vy += ((st.ty - st.y) * k - st.vy * d) * dt;
      st.x += st.vx * dt; st.y += st.vy * dt;
      st.e += (Math.min(1, Math.hypot(st.vx, st.vy) * .9) - st.e) * Math.min(1, dt * 4);
      gl.uniform1f(U.uT, t + 7); gl.uniform2f(U.uP, st.x, st.y); gl.uniform1f(U.uE, st.e);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function frame(now){
      st.raf = 0;
      if (!bg.isConnected) return destroy();
      if (!st.visible || document.hidden) return;
      size(); draw(now);
      st.raf = requestAnimationFrame(frame);
    }
    function kick(){ if (reduced()) { size(); draw(st.t0 + 4000); return; } if (!st.raf) { st.last = performance.now(); st.raf = requestAnimationFrame(frame); } }
    function destroy(){
      live.delete(inst);
      window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerdown", onMove);
      if (io) io.disconnect(); if (st.raf) cancelAnimationFrame(st.raf);
      const lose = gl.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext();
    }
    const inst = { kick: kick, destroy: destroy, host: host, colours: function(){ colours(); kick(); } };
    live.add(inst);
    kick();
  }
  document.addEventListener("visibilitychange", function(){ if (!document.hidden) live.forEach(function(i){ i.kick(); }); });
  Fx.mount = mount;
  Fx.recolour = function(){ live.forEach(function(i){ i.colours(); }); };

  /* ---- word reveal (CJK: per character) ---- */
  function reveal(el, perChar){
    if (!el || el.dataset.fxRv) return;
    el.dataset.fxRv = "1";
    if (reduced()) return;
    const label = el.textContent;
    let i = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function(node){
      const parts = node.nodeValue.match(/[\u3000-\u9fff\uff00-\uffef]|[^\s\u3000-\u9fff\uff00-\uffef]+|\s+/g) || [];
      const frag = document.createDocumentFragment();
      parts.forEach(function(tok){
        if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(tok)); return; }
        const pieces = perChar && !/[\u3000-\u9fff]/.test(tok) ? Array.from(tok) : [tok];
        const outer = document.createElement("span"); outer.className = "fx-w"; outer.setAttribute("aria-hidden", "true");
        pieces.forEach(function(ch){ const s = document.createElement("span"); s.className = "fx-wi"; s.style.setProperty("--i", i++); s.textContent = ch; if (perChar) { const w = document.createElement("span"); w.className = "fx-w"; w.appendChild(s); outer.appendChild(w); } else outer.appendChild(s); });
        if (perChar) outer.className = "fx-word"; /* keep a word unbreakable */
        frag.appendChild(outer);
      });
      node.parentNode.replaceChild(frag, node);
    });
    el.classList.add(perChar ? "fx-rv-c" : "fx-rv");
    el.setAttribute("translate", "no");
    el.setAttribute("aria-label", label);
  }
  Fx.reveal = reveal;

  /* ---- orb markup ---- */
  Fx.orb = function(size){ return '<span class="fx-orb"' + (size ? ' style="--s:' + size + 'px"' : "") + ' aria-hidden="true"><i></i></span>'; };

  /* ---- scan: enhance whatever the router just rendered ---- */
  function scan(){
    const view = document.getElementById("view");
    if (!view) return;
    const onb = view.querySelector(".onboard:not(.onboard-import)");
    if (onb) { onb.classList.add("fx-fade"); mount(onb, "liquid"); reveal(onb.querySelector(".onboard-headline")); }
    const g = view.querySelector("[data-greeting]");
    if (g) {
      g.classList.add("fx-greet", "fx-fade"); mount(g, "liquid");
      const h = g.querySelector(".greeting"); if (h) reveal(h);
    }
    const th = view.querySelector("[data-threads]");
    if (th) {
      const head = view.querySelector(".cards-head"); if (head) { head.classList.add("fx-paper"); mount(head, "paper"); }
      view.querySelectorAll(".thread-title").forEach(function(t){ reveal(t); });
    }
    const ph = view.querySelector(":scope > .plan-header");
    if (ph) {
      const wrap = document.createElement("div"); wrap.className = "fx-paper";
      ph.parentNode.insertBefore(wrap, ph); wrap.appendChild(ph);
      const meta = wrap.nextElementSibling; if (meta && meta.classList.contains("plan-meta")) wrap.appendChild(meta);
      mount(wrap, "paper"); reveal(ph);
    } else { const p2 = view.querySelector(".fx-paper > .plan-header"); if (p2) reveal(p2); }
    const dt = view.querySelector(".detail-title"); if (dt) reveal(dt, true);
    const pp = view.querySelector(".plan-prompt"); if (pp) reveal(pp);
    view.querySelectorAll(".log-panel .live-dot").forEach(function(d){ const o = document.createElement("span"); o.innerHTML = Fx.orb(34); d.replaceWith(o.firstChild); const s = view.querySelector(".log-panel .log-status"); if (s) s.classList.add("fx-shine"); });
    view.querySelectorAll(".inbox-card:not([data-fx-sw])").forEach(swipe);
    if (pendingEnter && view.querySelector(".detail-title")) { pendingEnter = false; view.classList.add("fx-enter"); setTimeout(function(){ view.classList.remove("fx-enter"); }, 900); }
  }
  let scanQueued = false;
  function queue(){ if (scanQueued) return; scanQueued = true; requestAnimationFrame(function(){ scanQueued = false; try { scan(); } catch (e) { console.warn("fx", e); } }); }
  Fx.scan = queue;

  /* ---- morphing tab blob: left/right edges on separate springs (leading edge quicker) = liquid stretch ---- */
  function tabBlob(){
    const tabs = document.getElementById("tabs"); if (!tabs) return;
    const blob = document.createElement("span"); blob.className = "fx-blob"; blob.setAttribute("aria-hidden", "true");
    tabs.insertBefore(blob, tabs.firstChild);
    const s = { l: 0, r: 0, vl: 0, vr: 0, tl: 0, tr: 0, raf: 0, last: 0, placed: false };
    function target(){
      const a = tabs.querySelector('.tab[aria-current="page"]');
      if (!a || tabs.hidden) { blob.style.opacity = "0"; return; }
      blob.style.opacity = "1";
      const tr = tabs.getBoundingClientRect(), r = a.getBoundingClientRect();
      if (!r.width) return;
      s.tl = r.left - tr.left; s.tr = r.right - tr.left;
      if (!s.placed || reduced()) { s.l = s.tl; s.r = s.tr; s.vl = s.vr = 0; s.placed = true; paint(); return; }
      if (!s.raf) { s.last = performance.now(); s.raf = requestAnimationFrame(step); }
    }
    function paint(){
      const w = s.r - s.l, v = Math.abs(s.vl) + Math.abs(s.vr);
      const sq = Math.min(.14, v / 9000);
      blob.style.width = w + "px";
      blob.style.transform = "translateX(" + s.l + "px) scaleY(" + (1 - sq) + ")";
    }
    function step(now){
      const dt = Math.min(.032, (now - s.last) / 1000); s.last = now;
      const right = s.tl > s.l; /* moving right: right edge leads */
      const kL = right ? 260 : 520, kR = right ? 520 : 260, d = 28;
      s.vl += ((s.tl - s.l) * kL - s.vl * d) * dt; s.vr += ((s.tr - s.r) * kR - s.vr * d) * dt;
      s.l += s.vl * dt; s.r += s.vr * dt;
      paint();
      if (Math.abs(s.tl - s.l) + Math.abs(s.tr - s.r) + Math.abs(s.vl) + Math.abs(s.vr) > .5) s.raf = requestAnimationFrame(step);
      else { s.raf = 0; s.l = s.tl; s.r = s.tr; paint(); }
    }
    new MutationObserver(function(){ requestAnimationFrame(target); }).observe(tabs, { attributes: true, subtree: true, attributeFilter: ["aria-current", "hidden"] });
    window.addEventListener("resize", function(){ s.placed = false; target(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ s.placed = false; target(); });
    target();
    Fx.tabTarget = target;
  }

  /* ---- inbox deck: drag right = keep, left = not a thing ---- */
  function swipe(card){
    card.dataset.fxSw = "1";
    const stack = card.parentNode;
    if (stack && stack.classList.contains("inbox-stack") && !stack.querySelector(".fx-peek")) {
      stack.classList.add("fx-deck");
      const left = Number(stack.getAttribute("data-left") || 2);
      if (left > 1) { const p = document.createElement("div"); p.className = "fx-peek p1"; stack.appendChild(p); }
      if (left > 2) { const p = document.createElement("div"); p.className = "fx-peek p2"; stack.appendChild(p); }
    }
    const yesS = document.createElement("span"); yesS.className = "fx-stamp yes"; yesS.textContent = (window.t ? window.t("Keep") : "Keep");
    const noS = document.createElement("span"); noS.className = "fx-stamp no"; noS.textContent = (window.t ? window.t("Not a thing") : "Not a thing");
    card.appendChild(yesS); card.appendChild(noS);
    let st = null;
    card.addEventListener("pointerdown", function(e){
      if (e.target.closest("button,a,input")) return;
      st = { x: e.clientX, y: e.clientY, id: e.pointerId, dx: 0, drag: false };
    });
    card.addEventListener("pointermove", function(e){
      if (!st || e.pointerId !== st.id) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.drag) { if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3) { st.drag = true; try { card.setPointerCapture(e.pointerId); } catch (_) {} card.style.transition = "none"; } else if (Math.abs(dy) > 12) { st = null; return; } else return; }
      st.dx = dx;
      card.style.transform = "translateX(" + dx + "px) rotate(" + dx / 22 + "deg)";
      yesS.style.opacity = Math.max(0, Math.min(1, dx / 90)); noS.style.opacity = Math.max(0, Math.min(1, -dx / 90));
    });
    function end(){
      if (!st) return; const dx = st.dx, drag = st.drag; st = null;
      if (!drag) return;
      const yes = card.querySelector("[data-inbox-yes]"), no = card.querySelector("[data-inbox-no]");
      const btn = dx > 96 ? yes : dx < -96 ? no : null;
      if (btn && !btn.disabled) {
        card.style.transition = "transform .32s cubic-bezier(.4,0,.2,1), opacity .32s";
        card.style.transform = "translateX(" + (dx > 0 ? 1 : -1) * innerWidth * 1.1 + "px) rotate(" + (dx > 0 ? 18 : -18) + "deg)"; card.style.opacity = "0";
        setTimeout(function(){ btn.click(); }, 260);
      } else {
        card.style.transition = "transform .5s cubic-bezier(.34,1.56,.64,1)"; card.style.transform = ""; yesS.style.opacity = 0; noS.style.opacity = 0;
      }
    }
    card.addEventListener("pointerup", end); card.addEventListener("pointercancel", end);
  }

  /* ---- card tile -> detail: the picture flies to the cover slot, content rises in ----
     Shared element = the image only, never a clone of the tile: the tile's title and counts would reflow
     letter by letter as the box narrows (wide feature card -> small cover). The ghost is a clipped box with the
     image at object-fit:cover, so any aspect change is a crop, not a reflow. No picture -> a colour block, no letters. */
  let pendingEnter = false;
  function tileFace(tile){ return tile.querySelector(".r7-feature-face, .card-face"); }
  function picOf(face){
    const im = face && face.querySelector("img");
    return im && !im.hidden && im.complete && im.naturalWidth > 0 && im.getBoundingClientRect().width > 8 ? im : null;
  }
  function containRect(img, nw, nh){
    /* the phone hero shows the whole poster (object-fit:contain): land on the drawn picture, not its box */
    const b = img.getBoundingClientRect();
    if (getComputedStyle(img).objectFit !== "contain" || !nw || !nh) return b;
    const k = Math.min(b.width / nw, b.height / nh), w = nw * k, h = nh * k;
    return { left: b.left + (b.width - w) / 2, top: b.top + (b.height - h) / 2, width: w, height: h, bottom: b.top + (b.height + h) / 2 };
  }
  document.addEventListener("pointerdown", function(e){
    const tile = e.target.closest && e.target.closest(".card-tile[data-nav]");
    if (tile && window.SpCards) SpCards.prefetch(decodeURIComponent((tile.getAttribute("data-nav") || "").split("/").pop() || ""));
  }, true);
  document.addEventListener("click", function(e){
    const tile = e.target.closest(".card-tile[data-nav]");
    if (!tile || reduced()) return;
    const desk = innerWidth >= 1024;
    pendingEnter = !desk;
    const face = tileFace(tile); if (!face) return;
    const pic = picOf(face);
    if (!pic && !desk) return; /* phone detail without a cover has no slot to land on: content just rises */
    const r0 = (pic || face).getBoundingClientRect();
    if (r0.width < 8 || r0.height < 8) return;
    const r = { left: r0.left, top: r0.top, width: r0.width, height: r0.height };
    const ghost = document.createElement("div");
    ghost.className = "fx-ghost fx-ghost-pic"; ghost.setAttribute("aria-hidden", "true");
    if (pic) { const im = document.createElement("img"); im.alt = ""; im.decoding = "sync"; im.src = pic.currentSrc || pic.src; ghost.appendChild(im); }
    else ghost.style.background = getComputedStyle(face).backgroundColor;
    const rad0 = getComputedStyle(tile).borderTopLeftRadius || "18px";
    Object.assign(ghost.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px", borderRadius: rad0 });
    document.body.appendChild(ghost);
    const nw = pic ? pic.naturalWidth : 0, nh = pic ? pic.naturalHeight : 0;
    const cid = decodeURIComponent((tile.getAttribute("data-nav") || "").split("/").pop() || "");
    const t0 = performance.now();
    function bail(){ ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: "forwards" }).onfinish = function(){ ghost.remove(); }; }
    function findSlot(){
      if (desk) {
        const dk = document.getElementById("dkInsp");
        return dk && !dk.hidden && cid ? dk.querySelector('[data-dk-card="' + (window.CSS && CSS.escape ? CSS.escape(cid) : cid) + '"] .dk-cover') : null;
      }
      return document.querySelector(".view .detail-hero-img img");
    }
    /* start next frame: the pane re-renders on this same click (even for the card already shown), so an
       element found now would be the old one */
    requestAnimationFrame(function seek(){
      let slot = findSlot(); const img = desk ? null : slot;
      if (!slot) { if (performance.now() - t0 < 700) requestAnimationFrame(seek); else bail(); return; }
      const h = img ? containRect(img, nw, nh) : slot.getBoundingClientRect();
      if (h.width < 24 || h.bottom < 0 || h.top > innerHeight) { bail(); return; }
      const rad1 = getComputedStyle(slot).borderTopLeftRadius || "12px";
      slot.style.visibility = "hidden";
      const a2 = ghost.animate([
        { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px", transform: "scale(1)", borderRadius: rad0 },
        { left: (r.left + h.left) / 2 + "px", top: (r.top + h.top) / 2 - 14 + "px", width: (r.width + h.width) / 2 + "px", height: (r.height + h.height) / 2 + "px", transform: "scale(1.02)", offset: .5 },
        { left: h.left + "px", top: h.top + "px", width: h.width + "px", height: h.height + "px", transform: "scale(1)", borderRadius: img ? "6px" : rad1 }
      ], { duration: desk ? 420 : 440, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
      let done = false;
      (function guard(){ /* if the pane swaps the node mid-flight (fresh data), hide the new one too */
        if (done) return; const s2 = findSlot();
        if (s2 && s2 !== slot) { slot.style.visibility = ""; slot = s2; slot.style.visibility = "hidden"; }
        requestAnimationFrame(guard);
      })();
      function land(){ if (done) return; done = true; slot.style.visibility = ""; ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: "forwards" }).onfinish = function(){ ghost.remove(); }; }
      a2.onfinish = land;
      (function safety(){ setTimeout(function(){ if (done) return; if (a2.playState === "running") return safety(); land(); setTimeout(function(){ if (ghost.isConnected) ghost.remove(); }, 300); }, 900); })();
    });
  }, true);

  /* ---- slide to confirm ---- */
  Fx.slideHTML = function(label){
    return '<div class="fx-slide" data-fx-slide><div class="fx-slide-fill"></div><span class="fx-slide-label">' + label + '</span>' +
      '<button class="fx-slide-knob" type="button" aria-label="' + label + '"><svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button></div>';
  };
  Fx.wireSlide = function(root, onDone){
    const el = root.querySelector("[data-fx-slide]"); if (!el) return;
    const knob = el.querySelector(".fx-slide-knob"), fill = el.querySelector(".fx-slide-fill"), label = el.querySelector(".fx-slide-label");
    let st = null, done = false;
    function max(){ return el.clientWidth - knob.offsetWidth - 8; }
    function set(x){ knob.style.transform = "translateX(" + x + "px)"; fill.style.width = (x + 56) + "px"; label.style.opacity = String(1 - Math.min(1, x / max()) * .8); }
    function finish(){ done = true; el.classList.add("fx-done"); set(max()); label.style.opacity = "1"; if (navigator.vibrate) try { navigator.vibrate(12); } catch (_) {} onDone(function(){ done = false; el.classList.remove("fx-done"); el.classList.add("fx-back"); set(0); setTimeout(function(){ el.classList.remove("fx-back"); }, 500); }, label); }
    knob.addEventListener("pointerdown", function(e){ if (done) return; st = { x: e.clientX }; el.classList.remove("fx-back"); try { knob.setPointerCapture(e.pointerId); } catch (_) {} });
    knob.addEventListener("pointermove", function(e){ if (!st) return; set(Math.max(0, Math.min(max(), e.clientX - st.x))); });
    function up(e){ if (!st) return; const x = Math.max(0, Math.min(max(), e.clientX - st.x)); st = null; if (x > max() * .82) finish(); else { el.classList.add("fx-back"); set(0); } }
    knob.addEventListener("pointerup", up); knob.addEventListener("pointercancel", up);
    knob.addEventListener("keydown", function(e){ if ((e.key === "Enter" || e.key === " ") && !done) { e.preventDefault(); finish(); } });
  };

  function boot(){
    const view = document.getElementById("view");
    if (view) new MutationObserver(queue).observe(view, { childList: true, subtree: true });
    tabBlob();
    if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function(){ setTimeout(Fx.recolour, 50); });
    new MutationObserver(function(){ setTimeout(Fx.recolour, 30); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-appearance", "class", "data-theme"] });
    queue();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();

  // fly-deck:js — note -> card. A card that is NEW to the deck lifts off its chip and lands on the Cards nav:
  // the desktop rail item (wide or collapsed) when the rail is shown, else the mobile tab bar. Measure what is actually
  // on screen: the mobile #tabs is display:none on desktop, so it measures 0x0 at (0,0), which used to send the flight
  // to the top-left logo. A repeat mention (footprint appended to an existing card) gets no flight and no nav reaction.
  function deckTarget(){
    var c = [document.querySelector('.pf-rail .pf-nav [data-pf-go="cards"]'), document.querySelector('#tabs:not([hidden]) .tab[data-tab="cards"]')];
    for (var i = 0; i < c.length; i++) {
      var el = c[i]; if (!el) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) continue;
      var ic = el.querySelector("svg"), ir = ic ? ic.getBoundingClientRect() : r;
      if (!ir.width) ir = r;
      return { el: el, x: ir.left + ir.width / 2, y: ir.top + ir.height / 2 };
    }
    return null;
  }
  Fx.deckTarget = deckTarget;
  function land(){ /* fly-deck:waapi */
    var t = deckTarget(); if (!t) return; /* re-measured: the rail re-renders its buttons on route/lang changes */
    var el = t.el, ic = el.querySelector("svg"), rm = false;
    try { rm = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) {}
    if (el.__fxLand) { el.__fxLand.forEach(function(a){ try { a.cancel(); } catch (_) {} }); }
    var old = el.querySelector(".fx-land-dot"); if (old) old.remove();
    /* resolve the warm palette (butter fill, faint butter-ink ring, soft sage halo) to concrete colours for WAAPI */
    var pr = document.createElement("i");
    pr.style.cssText = "position:absolute;visibility:hidden;background-color:color-mix(in srgb,var(--b-butter) 88%,var(--b-card));color:color-mix(in srgb,var(--b-butter-ink) 18%,transparent);border:0 solid color-mix(in srgb,var(--b-sage-ink) 50%,transparent)";
    el.appendChild(pr); var cs = getComputedStyle(pr), fill = cs.backgroundColor, ring = cs.color, halo = cs.borderTopColor; pr.remove();
    el.classList.add("fx-land");
    var dot = document.createElement("i"); dot.className = "fx-land-dot"; dot.setAttribute("aria-hidden", "true"); dot.textContent = "+1";
    var br = el.getBoundingClientRect(), ir = ic ? ic.getBoundingClientRect() : br;
    dot.style.left = Math.round(ir.right - br.left - 1) + "px"; dot.style.top = Math.round(ir.top - br.top - 12) + "px";
    el.appendChild(dot);
    var anims = [];
    /* only a middle keyframe: start and end fall back to the item's own fill/shadow (the active item keeps its card) */
    anims.push(el.animate([{ offset: .22, backgroundColor: fill, boxShadow: "0 0 0 3px " + ring + ",0 8px 22px -8px " + halo }], { duration: rm ? 900 : 1200, easing: "ease-out" }));
    anims.push(dot.animate(rm
      ? [{ opacity: 0 }, { opacity: 1, offset: .15 }, { opacity: 1, offset: .7 }, { opacity: 0 }]
      : [{ opacity: 0, transform: "translateY(4px) scale(.6)" }, { opacity: 1, transform: "none", offset: .15 }, { opacity: 1, transform: "none", offset: .7 }, { opacity: 0, transform: "translateY(-6px)" }],
      { duration: rm ? 1100 : 1400, easing: "ease-out", fill: "forwards" }));
    if (ic && !rm) anims.push(ic.animate([{ transform: "scale(1)" }, { transform: "scale(1.22) rotate(-4deg)", offset: .35 }, { transform: "scale(.96)", offset: .7 }, { transform: "none" }], { duration: 550, easing: "cubic-bezier(.3,1.5,.5,1)" }));
    el.__fxLand = anims;
    anims[1].onfinish = function(){ if (dot.isConnected) dot.remove(); if (el.__fxLand === anims) { el.classList.remove("fx-land"); el.__fxLand = null; } };
    anims[1].oncancel = function(){ if (dot.isConnected) dot.remove(); };
  }
  Fx.landDeck = land;
  function waitAnims(el, cap){
    var list = [];
    try { list = el.getAnimations ? el.getAnimations().filter(function(a){ return a.playState !== "finished"; }) : []; } catch (_) {}
    if (!list.length) return Promise.resolve();
    return Promise.race([Promise.all(list.map(function(a){ return a.finished.catch(function(){}); })), new Promise(function(r){ setTimeout(r, cap); })]);
  }
  Fx.grow = function(noteEl){
    if (!noteEl) return;
    var rm = false; try { rm = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) {}
    var nid = noteEl.getAttribute("data-note-id");
    var fresh = [], seen = {};
    Array.prototype.forEach.call(noteEl.querySelectorAll(".mention.matched.draw[data-card]"), function(m){
      var id = m.getAttribute("data-card");
      if (seen[id]) { if (m.hasAttribute("data-fresh")) seen[id].fresh = true; return; }
      seen[id] = { id: id, m: m, fresh: m.hasAttribute("data-fresh") };
      fresh.push(seen[id]);
    });
    fresh = fresh.filter(function(x){ return x.fresh; });
    if (!fresh.length || !deckTarget()) return;
    function liveNote(){ return noteEl.isConnected ? noteEl : (nid && document.querySelector('#view [data-note-id="' + nid.replace(/"/g, "") + '"]')) || noteEl; }
    function chipOf(id){ var n = liveNote(); return n.querySelector('.grown-chip[data-card="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]'); }
    if (rm) { /* no flight: the nav just fades its glow and +1 in once the chips are in */
      var c0 = chipOf(fresh[0].id);
      (c0 ? waitAnims(c0, 1600) : Promise.resolve()).then(land);
      return;
    }
    fresh.forEach(function(x, i){
      var chip = chipOf(x.id);
      (chip ? waitAnims(chip, 2000) : Promise.resolve()).then(function(){
        setTimeout(function(){ fly(x, i); }, 120 + i * 260);
      });
    });
    function fly(x){
      var chip = chipOf(x.id), src = chip && (chip.querySelector("img") || chip.querySelector(".grown-face") || chip);
      if (!src || !src.getBoundingClientRect().width) src = x.m.isConnected ? x.m : null;
      var t = deckTarget(); if (!src || !t) return;
      var r = src.getBoundingClientRect(); if (!r.width) return;
      var W = 34, H = 46;
      var el = document.createElement("div");
      el.className = "fx-grow"; el.setAttribute("aria-hidden", "true");
      el.style.cssText = "position:fixed;z-index:9999;pointer-events:none;width:" + W + "px;height:" + H + "px;border-radius:7px;overflow:hidden;background:var(--b-butter,#f3e7c2) center/cover;box-shadow:0 0 0 2px var(--b-card,#fffaf0),0 10px 22px -6px rgba(64,50,28,.4);left:0;top:0;transform-origin:center;will-change:transform,opacity;";
      var img = (chip && chip.querySelector("img") && chip.querySelector("img").currentSrc) || x.m.getAttribute("data-img");
      if (img) el.style.backgroundImage = "url(" + JSON.stringify(img) + ")";
      else el.innerHTML = '<span style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;font:400 18px/1 var(--serif,Georgia);color:var(--b-butter-ink,#6e5413)">' + esc1(((chip && chip.querySelector(".grown-name")) || x.m).textContent || "").slice(0, 1) + "</span>";
      document.body.appendChild(el);
      var x0 = r.left + r.width / 2 - W / 2, y0 = r.top + r.height / 2 - H / 2;
      var x1 = t.x - W / 2, y1 = t.y - H / 2;
      /* arc: target above (desktop rail) -> bow upward; target below (mobile tab bar) -> a small hop, then the drop */
      var down = y1 > y0 + 40;
      var mx = down ? x0 + (x1 - x0) * .35 : (x0 + x1) / 2, my = down ? y0 - 34 : Math.min(y0, y1) - Math.min(80, Math.abs(x1 - x0) * .12 + 30);
      /* per-segment easing on a linear timeline: lift (ease-out), arc (ease-in-out), dive (ease-in), short fade -> the nav reacts the moment it arrives */
      var an = el.animate([
        { transform: "translate(" + x0 + "px," + y0 + "px) scale(1)", opacity: 1, easing: "cubic-bezier(.2,.7,.3,1)" },
        { transform: "translate(" + x0 + "px," + (y0 - 14) + "px) scale(1.12) rotate(-4deg)", opacity: 1, offset: .16, easing: "cubic-bezier(.45,0,.55,1)" },
        { transform: "translate(" + mx + "px," + my + "px) scale(.85) rotate(-10deg)", opacity: 1, offset: .58, easing: "cubic-bezier(.5,0,.75,.4)" },
        { transform: "translate(" + x1 + "px," + y1 + "px) scale(.34) rotate(-2deg)", opacity: .95, offset: .9 },
        { transform: "translate(" + x1 + "px," + y1 + "px) scale(.22)", opacity: 0 }
      ], { duration: 820, easing: "linear", fill: "forwards" });
      var done = false;
      function end(){ if (done) return; done = true; el.remove(); land(); }
      an.onfinish = end; setTimeout(end, 1400);
    }
    function esc1(v){ return String(v).replace(/[&<>"]/g, function(c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  };
})();

