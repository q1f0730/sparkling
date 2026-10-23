/* Sparkling service worker (served as /sw.js). Offline shell; the API is never cached. */
const VERSION = "__VERSION__";
const SHELL = "sp-shell-" + VERSION, FONTS = "sp-fonts-v1";
const PRECACHE = ["/", "/pf.css", "/pf.js", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon-180.png", "/icons/favicon-32.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("sp-shell-") && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const offlineJSON = () => new Response(JSON.stringify({ error: "You are offline. Your notes are safe; try again when you are back online.", offline: true }),
  { status: 503, headers: { "content-type": "application/json" } });

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  // Google Fonts: stale-while-revalidate
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(FONTS).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) { e.respondWith(fetch(req).catch(offlineJSON)); return; }
  if (url.pathname.startsWith("/media/")) return;
  // app shell: network first (fresh deploys win), cached shell when offline
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((r) => { if (r.ok) caches.open(SHELL).then((c) => c.put("/", r.clone())); return r; })
      .catch(() => caches.match("/", { ignoreSearch: true })));
    return;
  }
  // static platform assets: cache first
  if (/^\/(pf\.css|pf\.js|manifest\.webmanifest|icons\/|splash\/)/.test(url.pathname)) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((r) => {
      if (r.ok) { const cp = r.clone(); caches.open(SHELL).then((c) => c.put(req, cp)); } return r; })));
  }
});
