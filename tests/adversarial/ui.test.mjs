// UI: the real SPA served by the real Worker (local, mocked AI/Qloo) driven by headless Chromium.
// Viewports 390x844 (mobile) and 1280x800. XSS rendering, overflow, tab bar, swipe deck, reduced motion, console errors, en/zh.
// Run: node --import ./tests/adversarial/html-loader.mjs tests/adversarial/ui.test.mjs   (VP=mobile|desktop to split)
import http from "node:http";
import { add, ok, eq, runAll } from "./lib.mjs";
import { makeEnv, makeQloo, setQloo, makeCtx, call, newSession, PLACES } from "./harness.mjs";
import worker from "../../src/index.js";
import { chromium } from "/workspace/tools/pw/playwright/driver/package/index.mjs";

export const XSS = ["<script>window.__xss=1</script>", "<img src=x onerror=window.__xss=1>", "<svg onload=window.__xss=1>", "\"><img src=x onerror=window.__xss=1>", "'><svg/onload=window.__xss=1>",
  "javascript:window.__xss=1", "<a href=javascript:window.__xss=1>x</a>", "<iframe src=javascript:window.__xss=1>", "<body onload=window.__xss=1>", "<details open ontoggle=window.__xss=1>",
  "<math><mtext><table><mglyph><style><img src=x onerror=window.__xss=1>", "{{constructor.constructor('window.__xss=1')()}}", "${window.__xss=1}", "<style>body{display:none}</style>", "<marquee onstart=window.__xss=1>",
  "&lt;img src=x onerror=window.__xss=1&gt;", "<img src=x onerror=&#x77;indow.__xss=1>", "<input autofocus onfocus=window.__xss=1>", "<video><source onerror=window.__xss=1>", "<object data=javascript:window.__xss=1>",
  "https://x.com/\"><img src=x onerror=window.__xss=1>", "https://evil.com/?q=<script>window.__xss=1</script>", "<noscript><p title=\"</noscript><img src=x onerror=window.__xss=1>\">", "<!--<img src=x onerror=window.__xss=1>-->",
  "</textarea><img src=x onerror=window.__xss=1>", "</title><img src=x onerror=window.__xss=1>", "<base href=//evil.example/>", "<meta http-equiv=refresh content=0;url=javascript:window.__xss=1>",
  "<form><button formaction=javascript:window.__xss=1>x", "<scr<script>ipt>window.__xss=1</scr</script>ipt>", "<IMG SRC=x OnErRoR=window.__xss=1>", "<img src=x onerror=window['__xss']=1>",
  "<svg><animate onbegin=window.__xss=1 attributeName=x dur=1s>", "<a href=\"data:text/html,<script>window.__xss=1</script>\">d</a>", "<img srcset=x onerror=window.__xss=1>", "<audio src=x onerror=window.__xss=1>",
  "\u202E<img src=x onerror=window.__xss=1>", "javascript&colon;window.__xss=1", "<img src=x:alert(1) onerror=eval('window.__xss=1')>", "<x contenteditable onblur=window.__xss=1>lose focus"];
const LONG = ["Donaudampfschifffahrtsgesellschaftskapitänswitwenrentenversicherungsanstaltsangestelltengewerkschaft", "Rindfleischetikettierungsüberwachungsaufgabenübertragungsgesetz".repeat(3),
  "Grundstücksverkehrsgenehmigungszuständigkeitsübertragungsverordnung und Kraftfahrzeughaftpflichtversicherung", "https://example.com/" + "a".repeat(300), "長".repeat(400), "🎬".repeat(200)];

// ---------- server ----------
const env = makeEnv();
const q = makeQloo(); q.places = PLACES.map((p, i) => (i % 3 === 0 ? { ...p, name: p.name + " <img src=x onerror=window.__xss=1>" } : p)); setQloo(q, env);
const pending = [];
const server = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const r = new Request("http://127.0.0.1" + req.url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body, duplex: "half" });
  const ctx = makeCtx();
  try {
    const out = await worker.fetch(r, env, ctx);
    const h = {}; out.headers.forEach((v, k) => (h[k] = v));
    res.writeHead(out.status, h);
    if (out.body) for await (const c of out.body) res.write(c);
    res.end();
  } catch (e) { res.writeHead(599); res.end(String(e)); }
  pending.push(ctx.drain());
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = "http://127.0.0.1:" + server.address().port;

// ---------- data ----------
// Server prefs win over local ones, so each language gets its own account (prefs.lang set server-side).
async function seedUser(lang) {
  const S = await newSession(worker, env); const T = S.token;
  await call(worker, env, "PUT", "/api/prefs", { cookie: T, body: { prefs: { lang } } });
  await call(worker, env, "PATCH", "/api/me", { cookie: T, body: { area: "Greenpoint, Brooklyn" } });
  for (const t of ["rewatched In the Mood for Love, perfect", "watched Her again", "Paterson on a rainy Sunday", "Big Thief on repeat", "finally watched Solaris", "Klara and the Sun, slow in the best way"])
    await call(worker, env, "POST", "/api/notes", { cookie: T, body: { text: t } });
  await call(worker, env, "POST", "/api/notes", { cookie: T, body: { text: "card named <img src=x onerror=window.__xss=1> appears" } });
  for (const x of XSS) await call(worker, env, "POST", "/api/notes", { cookie: T, body: { text: x } });
  for (const x of LONG) await call(worker, env, "POST", "/api/notes", { cookie: T, body: { text: x } });
  const cards = (await call(worker, env, "GET", "/api/cards", { cookie: T })).json.cards;
  for (const c of cards) await call(worker, env, "PATCH", "/api/cards/" + c.id, { cookie: T, body: { heart: 1 } });
  const pr = await call(worker, env, "POST", "/api/plan", { cookie: T, body: { area: "Greenpoint, Brooklyn", text: "bookstore then cafe" } });
  const PLAN = pr.text.split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((o) => o.type === "plan")?.plan;
  if (PLAN) await call(worker, env, "POST", `/api/plan/${PLAN.id}/save`, { cookie: T });
  const xssCard = cards.find((c) => /onerror/.test(c.name));
  const inbox = (await call(worker, env, "GET", "/api/inbox", { cookie: T })).json.items.length;
  return { T, PLAN, xssCard, inbox };
}
const USERS = { en: await seedUser("en"), zh: await seedUser("zh") };
const T = USERS.en.T, PLAN = USERS.en.PLAN, xssCard = USERS.en.xssCard, INBOX0 = USERS.en.inbox;
async function freshToken(lang) { const s = await newSession(worker, env); await call(worker, env, "PUT", "/api/prefs", { cookie: s.token, body: { prefs: { lang } } }); return s.token; }

// ---------- browser ----------
const browser = await chromium.launch({ executablePath: "/workspace/tools/chromium/root/usr/lib/chromium/chromium-headless-shell", args: ["--no-sandbox"], env: { ...process.env, LD_LIBRARY_PATH: "/workspace/tools/chromium/root/usr/lib/aarch64-linux-gnu" } });
const VPS = { mobile: { width: 390, height: 844, isMobile: true, hasTouch: true }, desktop: { width: 1280, height: 800 } };
const only = process.env.VP ? [process.env.VP] : Object.keys(VPS);

async function visit(vpName, hash, { lang = "en", reduced = false, token, after } = {}) {
  token = token || USERS[lang].T;
  const vp = VPS[vpName];
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch, reducedMotion: reduced ? "reduce" : "no-preference", deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: "sp", value: token, url: BASE }]);
  await ctx.addInitScript((l) => { try { localStorage.setItem("sparkling.prefs", JSON.stringify({ lang: l })); } catch (_) {} window.alert = window.confirm = window.prompt = () => { window.__xss = 1; }; }, lang);
  await ctx.route("**/*", (route) => (route.request().url().startsWith(BASE) ? route.continue() : route.abort()));
  const page = await ctx.newPage();
  const errors = [], dialogs = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR_FAILED|ERR_BLOCKED/.test(m.text())) errors.push("console: " + m.text()); });
  page.on("dialog", (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  await page.goto(BASE + "/" + hash, { waitUntil: "load" });
  await page.waitForTimeout(1200);
  if (after) await after(page);
  const info = await page.evaluate(() => {
    const se = document.scrollingElement;
    const tabs = document.getElementById("tabs");
    const tr = tabs && !tabs.hidden ? tabs.getBoundingClientRect() : null;
    const over = []; document.querySelectorAll("body *").forEach((e) => { if (!e.offsetParent) return; const r = e.getBoundingClientRect(); if (r.width && r.right > innerWidth + 2 && getComputedStyle(e).position !== "fixed") over.push((e.className || e.tagName) + "@" + Math.round(r.right)); });
    const live = [...document.querySelectorAll("*")].filter((e) => [...e.attributes].some((a) => /^on/i.test(a.name) && /__xss/.test(a.value)) || (e.tagName === "SCRIPT" && /__xss/.test(e.textContent)) || (/^(IFRAME|OBJECT|EMBED|BASE|META)$/.test(e.tagName) && /javascript|evil/.test(e.outerHTML)));
    const anims = document.getAnimations ? document.getAnimations().filter((a) => a.playState === "running" && a.effect && a.effect.getTiming && a.effect.getTiming().iterations === Infinity).length : 0;
    const noteTexts = [...document.querySelectorAll(".note-text")].map((e) => e.textContent);
    return { xss: window.__xss, scrollW: se.scrollWidth, innerW: innerWidth, innerH: innerHeight, over: over.slice(0, 6), tabs: tr && { top: tr.top, bottom: tr.bottom, h: tr.height, text: tabs.innerText }, live: live.map((e) => e.outerHTML.slice(0, 80)), anims, lang: document.documentElement.lang, noteTexts, hash: location.hash, body: document.body.innerText.slice(0, 20000) };
  });
  await ctx.close();
  return { ...info, errors, dialogs };
}

const SCREENS = [["notes", "#/notes"], ["cards", "#/cards"], ["threads", "#/threads"], ["inbox", "#/inbox"], ["plan", "#/plan"], ["settings", "#/settings"], ["card_xss", (l) => "#/cards/" + (USERS[l].xssCard?.id || "none")], ["plan_result", (l) => "#/plan/" + (USERS[l].PLAN?.id || "none")]];
const H = (h, l) => (typeof h === "function" ? h(l) : h);
const memo = new Map();
const V = (key, ...a) => { if (!memo.has(key)) memo.set(key, visit(...a)); return memo.get(key); };

for (const vp of only) for (const lang of ["en", "zh"]) for (const [sn, hash] of SCREENS) {
  const k = `${vp}:${lang}:${sn}`; const get = () => V(k, vp, H(hash, lang), { lang });
  add("ui.screen", k + ":no_console_errors", async () => { const r = await get(); eq(r.errors.length, 0, r.errors.join(" | ")); });
  add("ui.xss", k + ":no_script_exec", async () => { const r = await get(); ok(r.xss === undefined && !r.dialogs.length, "XSS executed"); });
  add("ui.xss", k + ":no_live_payload_nodes", async () => { const r = await get(); eq(r.live.length, 0, r.live.join(" | ")); });
  add("ui.overflow", k + ":no_horizontal_overflow", async () => { const r = await get(); ok(r.scrollW <= r.innerW + 1, `scrollWidth ${r.scrollW} > ${r.innerW}; ${r.over.join(",")}`); });
  add("ui.i18n", k + ":html_lang", async () => { const r = await get(); eq(r.lang, lang === "zh" ? "zh-CN" : "en"); });
  if (vp === "mobile" && ["notes", "cards", "plan"].includes(sn)) {
    add("ui.tabbar", k + ":tabbar_in_viewport", async () => { const r = await get(); ok(r.tabs && r.tabs.bottom <= r.innerH + 1 && r.tabs.top > r.innerH / 2, JSON.stringify(r.tabs)); });
    add("ui.tabbar", k + ":tabbar_tall_enough", async () => { const r = await get(); ok(r.tabs && r.tabs.h >= 44, "tab bar height " + r.tabs?.h); });
    add("ui.i18n", k + ":tab_labels_lang", async () => { const r = await get(); const t = r.tabs?.text || ""; if (lang === "zh") ok(/笔记/.test(t) && /卡片/.test(t) && !/\bNotes\b|\bCards\b/.test(t), t); else ok(/Notes/.test(t) && /Cards/.test(t), t); });
  }
}
// every XSS payload is rendered literally in the notes list (both viewports)
for (const vp of only) XSS.forEach((x, i) => add("ui.xss_literal", `${vp}:payload${i}`, async () => {
  const r = await V(`${vp}:en:notes`, vp, "#/notes", { lang: "en" });
  ok(r.noteTexts.some((t) => t.includes(x.trim().slice(0, 18).replace(/\u202E/g, "")) || t.includes(x.replace(/\u202E/g, "").slice(0, 18))), "payload not shown as text: " + x.slice(0, 30));
}));
// long German-like / unbroken strings: no overflow on notes, cards, plan (area set to a long word)
for (const vp of only) LONG.forEach((s, i) => {
  add("ui.long_strings", `${vp}:notes_long${i}`, async () => { const r = await V(`${vp}:en:notes`, vp, "#/notes", { lang: "en" }); ok(r.scrollW <= r.innerW + 1, "overflow " + r.over.join(",")); ok(r.noteTexts.some((t) => t.includes(s.slice(0, 20))), "long note missing"); });
});
for (const vp of only) for (const lang of ["en", "zh"]) {
  const k = `${vp}:${lang}:area_long`;
  add("ui.long_strings", k, async () => {
    const tok = await freshToken(lang); await call(worker, env, "PATCH", "/api/me", { cookie: tok, body: { area: LONG[0] + " " + LONG[1] } });
    const r = await visit(vp, "#/plan", { lang, token: tok }); ok(r.scrollW <= r.innerW + 1, "overflow " + r.over.join(",")); eq(r.errors.length, 0, r.errors.join("|"));
  });
}
// reduced motion: no infinite running animations on any main screen
for (const vp of only) for (const [sn, hash] of SCREENS.slice(0, 6)) add("ui.reduced_motion", `${vp}:${sn}`, async () => { const r = await visit(vp, H(hash, "en"), { reduced: true }); eq(r.anims, 0, "infinite animations running under reduced motion"); });
// tab bar navigation
for (const vp of only) for (const tab of ["notes", "cards", "plan"]) add("ui.tabbar", `${vp}:click_${tab}`, async () => {
  const r = await visit(vp, "#/settings", { after: async (p) => { await p.goto(BASE + "/#/notes"); await p.waitForTimeout(500); const b = p.locator(`#tabs [data-tab="${tab}"]`); if (await b.isVisible()) { await b.click(); await p.waitForTimeout(500); } } });
  if (vp === "mobile") eq(r.hash, "#/" + tab); else ok(r.errors.length === 0);
});
// language switch at runtime through the settings row keeps the app working
for (const vp of only) for (const [from, to] of [["en", "zh"], ["zh", "en"]]) add("ui.i18n", `${vp}:switch_${from}_to_${to}`, async () => {
  const r = await visit(vp, "#/settings", { lang: from, token: await freshToken(from), after: async (p) => { await p.evaluate((l) => { const b = document.querySelector(`[data-st-pick="lang"][data-value="${l}"]`); if (b) b.click(); else if (window.setLang) window.setLang(l); }, to); await p.waitForTimeout(300); await p.goto(BASE + "/#/notes"); await p.waitForTimeout(800); } });
  eq(r.errors.length, 0, r.errors.join("|")); eq(r.lang, to === "zh" ? "zh-CN" : "en", "lang after switch");
});
// swipe deck: drag right keeps (inbox shrinks), drag left rejects
if (only.includes("mobile")) for (const dir of ["right", "left"]) add("ui.swipe", "inbox_" + dir, async () => {
  const S3 = await newSession(worker, env);
  for (const t of ["finally watched Solaris", "Solaris again, the other one?"]) await call(worker, env, "POST", "/api/notes", { cookie: S3.token, body: { text: t } });
  const before = (await call(worker, env, "GET", "/api/inbox", { cookie: S3.token })).json.items.length;
  ok(before > 0, "no inbox items to swipe");
  const r = await visit("mobile", "#/inbox", { token: S3.token, after: async (p) => {
    const card = p.locator(".inbox-stack > *").first(); const bx = await card.boundingBox(); if (!bx) throw new Error("no card");
    const x = bx.x + bx.width / 2, y = bx.y + bx.height / 3, dx = dir === "right" ? 180 : -180;
    await p.mouse.move(x, y); await p.mouse.down(); for (let i = 1; i <= 10; i++) await p.mouse.move(x + (dx * i) / 10, y + 1); await p.mouse.up(); await p.waitForTimeout(1200);
  } });
  await Promise.all(pending.splice(0));
  const after = (await call(worker, env, "GET", "/api/inbox", { cookie: S3.token })).json.items.length;
  ok(after < before, `inbox ${before} -> ${after}`); eq(r.errors.length, 0, r.errors.join("|"));
});
// negative controls: prove the XSS / overflow detectors fire on a page that really is broken
for (const [n, html, want] of [["exec", "<img src=x onerror=window.__xss=1>", "xss"], ["live_node", "<div onclick=\"window.__xss=1\">x</div>", "live"], ["overflow", "<div style='width:3000px'>wide</div>", "overflow"]])
  add("ui.control", n, async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
    await p.setContent("<body>" + html + "</body>"); await p.waitForTimeout(200);
    const r = await p.evaluate(() => ({ xss: window.__xss, live: [...document.querySelectorAll("*")].filter((e) => [...e.attributes].some((a) => /^on/i.test(a.name) && /__xss/.test(a.value))).length, sw: document.scrollingElement.scrollWidth, iw: innerWidth }));
    await ctx.close();
    if (want === "xss") eq(r.xss, 1, "exec detector blind"); if (want === "live") ok(r.live > 0, "live-node detector blind"); if (want === "overflow") ok(r.sw > r.iw + 1, "overflow detector blind");
  });
add("ui.fixture", "inbox_has_items", () => ok(INBOX0 > 0));
add("ui.fixture", "plan_made", () => ok(PLAN && PLAN.stops.length > 0));
add("ui.fixture", "xss_card_exists", () => ok(xssCard, "no XSS-named card"));

await runAll("ui" + (process.env.VP ? "-" + process.env.VP : ""), { timeout: 60000, concurrency: 4 });
await browser.close(); server.close();
process.exit(0);
