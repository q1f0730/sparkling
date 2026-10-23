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

  /* ---- card tile -> detail: the tile lifts and grows into the detail hero, content rises in ---- */
  let pendingEnter = false;
  document.addEventListener("click", function(e){
    const tile = e.target.closest(".card-tile[data-nav]");
    if (!tile || reduced()) return;
    const r = tile.getBoundingClientRect();
    const ghost = tile.cloneNode(true); ghost.className += " fx-ghost"; ghost.removeAttribute("data-nav");
    Object.assign(ghost.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    document.body.appendChild(ghost);
    const vw = Math.min(innerWidth, 480), pad = 20, x0 = (innerWidth - vw) / 2 + pad;
    const top = document.getElementById("chrome") ? document.getElementById("chrome").getBoundingClientRect().bottom + 12 : 80;
    const W = vw - pad * 2;
    const anim = ghost.animate([
      { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px", transform: "perspective(900px) rotateY(0) scale(1)", borderRadius: "18px", opacity: 1 },
      { transform: "perspective(900px) rotateY(-8deg) scale(1.03)", offset: .35 },
      { left: x0 + "px", top: top + "px", width: W + "px", height: Math.round(W * .8) + "px", transform: "perspective(900px) rotateY(0) scale(1)", borderRadius: "20px", opacity: 1 }
    ], { duration: 460, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
    pendingEnter = true;
    anim.onfinish = function(){ ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: "forwards" }).onfinish = function(){ ghost.remove(); }; };
    setTimeout(function(){ if (ghost.isConnected) ghost.remove(); }, 1600);
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

  // note -> card: each newly matched mention lifts off as a small card and flies to the Cards tab
  Fx.grow = function(noteEl){
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var tab = document.querySelector('.tab[data-tab="cards"]');
    if (!tab) return;
    var tr = tab.getBoundingClientRect();
    var ms = noteEl.querySelectorAll(".mention.matched.draw");
    Array.prototype.forEach.call(ms, function(m, i){
      setTimeout(function(){
        var r = m.getBoundingClientRect();
        if (!r.width) return;
        var el = document.createElement("div");
        el.className = "fx-grow";
        var img = m.getAttribute("data-img");
        el.style.cssText = "position:fixed;z-index:9999;pointer-events:none;width:44px;height:62px;border-radius:8px;overflow:hidden;background:#efe6d2 center/cover;box-shadow:0 10px 24px rgba(60,40,10,.28);left:0;top:0;transform-origin:center;";
        if (img) el.style.backgroundImage = "url(" + JSON.stringify(img) + ")";
        else el.innerHTML = '<span style="font:600 11px Fraunces,serif;padding:6px;display:block;color:#5b4a2e">' + (m.textContent||"").slice(0,18).replace(/</g,"") + "</span>";
        document.body.appendChild(el);
        var x0 = r.left + r.width/2 - 22, y0 = r.top + r.height/2 - 31;
        var x1 = tr.left + tr.width/2 - 22, y1 = tr.top + tr.height/2 - 31;
        var an = el.animate([
          { transform: "translate("+x0+"px,"+y0+"px) scale(.2) rotate(-6deg)", opacity: 0 },
          { transform: "translate("+x0+"px,"+(y0-46)+"px) scale(1.25) rotate(-3deg)", opacity: 1, offset: .3 },
          { transform: "translate("+((x0+x1)/2+30)+"px,"+((y0+y1)/2-30)+"px) scale(.8) rotate(8deg)", opacity: 1, offset: .65 },
          { transform: "translate("+x1+"px,"+y1+"px) scale(.15) rotate(14deg)", opacity: 0 }
        ], { duration: 1100, easing: "cubic-bezier(.5,.05,.3,1)" });
        an.onfinish = function(){
          el.remove();
          tab.animate([{transform:"scale(1)"},{transform:"scale(1.25)"},{transform:"scale(1)"}], {duration:360,easing:"ease-out"});
        };
      }, i * 220);
    });
  };
})();
