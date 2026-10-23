/* Sparkling platform layer (served as /pf.js). Desktop rail, install prompt, offline state,
   service worker registration, Chromium-only lens filter for the glass tab pill.
   Platform detection runs inline in <head> (see head.html) so CSS applies before first paint. */
(function () {
  "use strict";
  var d = document.documentElement;
  var zh = function () { return /^zh/i.test(d.lang || ""); };
  var T = function (en, cn) { return zh() ? cn : en; };
  var STAR = '<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M512 150 Q540 484 874 512 Q540 540 512 874 Q484 540 150 512 Q484 484 512 150Z" fill="#3e5a2e"/><g transform="translate(742 282) scale(.26) translate(-512 -512)"><path d="M512 150 Q540 484 874 512 Q540 540 512 874 Q484 540 150 512 Q484 484 512 150Z" fill="#c99a3a"/></g></svg>';
  var DL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 19.5h14"/></svg>';

  // ---- service worker (offline shell)
  if ("serviceWorker" in navigator && window.isSecureContext && !/[?&]nosw=1/.test(location.search)) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(function () {}); });
  }

  // ---- offline state
  function net() { d.classList.toggle("pf-offline", navigator.onLine === false); }
  window.addEventListener("online", net); window.addEventListener("offline", net);

  // ---- install prompt (Android / desktop Chrome); Safari gets a hint instead
  var deferred = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; sync(); });
  window.addEventListener("appinstalled", function () { deferred = null; d.classList.add("pf-standalone"); sync(); });

  var rail, nav, btn, hint, chip;
  function build() {
    var bar = document.createElement("div"); bar.className = "pf-offline-bar"; bar.setAttribute("role", "status");
    bar.textContent = T("Offline. Your notes are safe; changes wait for a connection.", "离线中。笔记已保存，联网后继续同步。");
    document.body.appendChild(bar);

    rail = document.createElement("aside"); rail.className = "pf-rail"; rail.setAttribute("aria-label", "Sparkling");
    rail.innerHTML = '<div class="pf-word">' + STAR + '<span>Sparkling</span></div>' +
      '<p class="pf-tag"></p><nav class="pf-nav" aria-label="Sections"></nav>' +
      '<div class="pf-foot"><button class="pf-install" type="button" hidden>' + DL + '<span></span></button>' +
      '<p class="pf-hint" hidden></p><span class="pf-chip"><i></i><b style="font-weight:400"></b></span></div>';
    document.body.appendChild(rail);
    nav = rail.querySelector(".pf-nav"); btn = rail.querySelector(".pf-install"); hint = rail.querySelector(".pf-hint"); chip = rail.querySelector(".pf-chip b");
    btn.addEventListener("click", function () {
      if (!deferred) return; deferred.prompt();
      deferred.userChoice.finally(function () { deferred = null; sync(); });
    });
    var tabs = document.getElementById("tabs");
    if (tabs) new MutationObserver(sync).observe(tabs, { subtree: true, attributes: true, attributeFilter: ["aria-current", "hidden"], childList: true, characterData: true });
    new MutationObserver(sync).observe(d, { attributes: true, attributeFilter: ["lang", "class"] });
    sync();
  }

  function sync() {
    if (!rail) return;
    rail.querySelector(".pf-tag").textContent = T("Keep the things that stay with you.", "留住那些一直留在你心里的东西。");
    var tabs = document.getElementById("tabs");
    nav.hidden = !tabs || tabs.hidden;
    var src = tabs ? tabs.querySelectorAll(".tab") : [];
    var html = "";
    for (var i = 0; i < src.length; i++) {
      var t = src[i], svg = t.querySelector("svg");
      var label = (t.textContent || "").trim();
      html += '<button type="button" data-pf-tab="' + t.getAttribute("data-tab") + '"' + (t.getAttribute("aria-current") === "page" ? ' aria-current="page"' : "") + ">" +
        (svg ? svg.outerHTML : "") + "<span>" + label.replace(/</g, "&lt;") + "</span></button>";
    }
    if (nav.__h !== html) {
      nav.__h = html; nav.innerHTML = html;
      Array.prototype.forEach.call(nav.querySelectorAll("button"), function (b) {
        b.addEventListener("click", function () {
          var t = document.querySelector('#tabs .tab[data-tab="' + b.getAttribute("data-pf-tab") + '"]'); if (t) t.click();
        });
      });
    }
    var standalone = d.classList.contains("pf-standalone");
    btn.hidden = !deferred || standalone;
    btn.querySelector("span").textContent = T("Install Sparkling", "安装 Sparkling");
    var os = d.getAttribute("data-os"), safari = /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Edg/.test(navigator.userAgent);
    var h = "";
    if (!standalone && !deferred && os === "macos" && safari) h = T("Install: File > Add to Dock.", "安装：文件 > 添加到程序坞。");
    hint.hidden = !h; hint.textContent = h;
    chip.textContent = navigator.onLine === false ? T("Offline", "离线") : T("Works offline", "可离线使用");
  }

  // ---- Chromium-only lens: displacement map refracting what sits behind the glass pill.
  // Safari does not support url() in backdrop-filter, so Apple Safari keeps the rim-light lens from pf.css.
  function lens() {
    var ua = navigator.userAgent;
    if (!d.classList.contains("pf-glass") || !/Chrome\//.test(ua) ) return;
    if (matchMedia("(prefers-reduced-transparency: reduce)").matches) return;
    var c = document.createElement("canvas"); c.width = 128; c.height = 64; var x = c.getContext("2d");
    var img = x.createImageData(128, 64);
    for (var j = 0; j < 64; j++) for (var i = 0; i < 128; i++) {
      var nx = (i - 63.5) / 63.5, ny = (j - 31.5) / 31.5, r = Math.min(1, Math.sqrt(nx * nx + ny * ny));
      var k = Math.pow(r, 3); // stronger bend near the rim
      var o = (j * 128 + i) * 4;
      img.data[o] = 128 - nx * k * 110; img.data[o + 1] = 128 - ny * k * 110; img.data[o + 2] = 128; img.data[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    var ns = "http://www.w3.org/2000/svg";
    var s = document.createElementNS(ns, "svg"); s.setAttribute("width", "0"); s.setAttribute("height", "0"); s.setAttribute("aria-hidden", "true");
    s.style.position = "absolute";
    s.innerHTML = '<filter id="pf-lens" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">' +
      '<feImage href="' + c.toDataURL() + '" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="m"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="m" scale="14" xChannelSelector="R" yChannelSelector="G"/></filter>';
    document.body.appendChild(s);
    d.classList.add("pf-lens");
  }

  function start() { net(); build(); lens(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
