// Probe 10-26 09:10 (en+zh, 390+1440): with the API answering 503 while the device is ONLINE,
// #/threads still showed its cached list under "Offline · showing your last copy." — wrong: the
// user is not offline, the server failed. The load() catch must choose the stale-note copy from
// navigator.onLine and the HTTP status api() puts on the error (e.status).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const threadsSrc = fs.readFileSync(path.join(ROOT, "src/app/js/threads.js"), "utf8");
const EN_OFF = "Offline · showing your last copy.";
const EN_ERR = "Couldn't refresh · showing your last copy.";
const ZH_OFF = "离线 · 显示的是上次的内容。";
const ZH_ERR = "没能刷新 · 显示的是上次的内容。";

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// string/template/comment aware brace matcher (same shape as the front-end check helper)
function fnSource(text, name) {
  const re = new RegExp("function\\s+" + name + "\\s*\\(");
  const m = re.exec(text);
  assert.ok(m, "threads.js defines " + name);
  let i = text.indexOf("{", m.index), depth = 0, q = null;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (q) { if (c === "\\") { j++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; continue; }
    if (c === "/" && text[j + 1] === "/") { j = text.indexOf("\n", j); continue; }
    if (c === "/" && text[j + 1] === "*") { j = text.indexOf("*/", j) + 1; continue; }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(m.index, j + 1);
  }
  return null;
}

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function makeEl() {
  const kids = [];
  const el = {
    _kids: kids,
    _html: "",
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); kids.length = 0; },
    querySelector(sel) { return sel === ".stale-note" ? kids.find((k) => k.className === "stale-note") || null : null; },
    insertBefore(node, ref) {
      const i = ref ? kids.indexOf(ref) : -1;
      if (i < 0) kids.unshift(node); else kids.splice(i, 0, node);
      node._parent = el;
      return node;
    },
    appendChild(node) { kids.push(node); node._parent = el; return node; },
    get firstChild() { return kids[0] || null; },
  };
  return el;
}

function makeNode(tag) {
  return {
    tagName: tag, className: "", _html: "", textContent: "", _attrs: {}, _parent: null,
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k]; },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); },
    remove() {
      const p = this._parent;
      if (p) { const i = p._kids.indexOf(this); if (i >= 0) p._kids.splice(i, 1); }
      this._parent = null;
    },
  };
}

// load() runs with stubs; paint is replaced so only the catch's own marking is checked.
function runLoad(opts) {
  const src = "async " + fnSource(threadsSrc, "load");
  const threadsEl = opts.el || makeEl();
  const scope = {
    loadSeq: 0,
    THREADS_CACHE: opts.cache || {},
    period: "all",
    token: 1,
    ac: { signal: {} },
    threadsEl,
    noteEl: makeEl(),
    navigator: opts.navigator || { onLine: true },
    isCurrent: () => true,
    isAbort: () => false,
    threadsSkeletonHTML: () => '<div class="skeleton"></div>',
    errorBlock: (msg) => '<div class="empty">' + msg + "</div>",
    api: opts.api,
    paint: opts.paint,
    esc,
    t: opts.t || ((s) => s),
    document: { createElement: (tag) => makeNode(tag) },
  };
  const proxy = new Proxy(scope, {
    has: (t, k) => typeof k === "string" && k !== "__fn",
    get: (t, k) => (k in t ? t[k] : typeof k === "string" && k in globalThis ? globalThis[k] : () => {}),
  });
  const factory = new Function("__scope", "with (__scope) { " + src + "\n return load; }");
  return { load: factory(proxy), threadsEl, scope };
}

const cache = () => ({ all: { threads: [{ tag: "Slow burn" }] } });
const http503 = () => { const e = new Error("Request failed (503)"); e.status = 503; return Promise.reject(e); };
const network = () => Promise.reject(new TypeError("Failed to fetch"));

test("threads.js keeps both stale-note copies", () => {
  assert.ok(threadsSrc.includes('"' + EN_OFF + '"'), "offline copy kept");
  assert.ok(threadsSrc.includes('"' + EN_ERR + '"'), "server-error copy present");
});

test("the zh dictionary has the server-error copy right next to the offline one", () => {
  assert.ok(
    new RegExp('Object\\.assign\\(ZH,[^)]*"' + escRe(EN_OFF) + '":\\s*"' + escRe(ZH_OFF) + '"').test(threadsSrc),
    "offline en→zh entry"
  );
  assert.ok(
    new RegExp('Object\\.assign\\(ZH,[^)]*"' + escRe(EN_ERR) + '":\\s*"' + escRe(ZH_ERR) + '"').test(threadsSrc),
    "server-error en→zh entry in Object.assign(ZH, ...) at the top of threads.js"
  );
});

test("the catch checks navigator.onLine and the HTTP status on the error", () => {
  const load = fnSource(threadsSrc, "load");
  const c = load.slice(load.indexOf("catch"));
  assert.match(c, /navigator\.onLine/, "catch looks at navigator.onLine");
  assert.match(c, /e\.status/, "catch looks at the status api() puts on the error");
  assert.ok(c.includes('t("' + EN_ERR + '")'), "the server-error copy is shown through t()");
  assert.ok(c.includes('t("' + EN_OFF + '")'), "the offline copy is still shown through t()");
});

test("online + HTTP 503 with a cached list says it could not refresh", async () => {
  const { load, threadsEl } = runLoad({
    cache: cache(),
    navigator: { onLine: true },
    api: http503,
    paint: () => { threadsEl.innerHTML = "PAINTED"; },
  });
  await load();
  assert.equal(threadsEl._kids.length, 1);
  assert.equal(threadsEl._kids[0].className, "stale-note");
  assert.equal(threadsEl._kids[0].innerHTML, esc(EN_ERR));
});

test("a network failure without a status still reads as offline (device may be online)", async () => {
  const { load, threadsEl } = runLoad({
    cache: cache(),
    navigator: { onLine: true },
    api: network,
    paint: () => { threadsEl.innerHTML = "PAINTED"; },
  });
  await load();
  assert.equal(threadsEl._kids.length, 1);
  assert.equal(threadsEl._kids[0].innerHTML, EN_OFF);
});

test("navigator.onLine === false wins even when the error carries a status", async () => {
  const { load, threadsEl } = runLoad({
    cache: cache(),
    navigator: { onLine: false },
    api: http503,
    paint: () => { threadsEl.innerHTML = "PAINTED"; },
  });
  await load();
  assert.equal(threadsEl._kids.length, 1);
  assert.equal(threadsEl._kids[0].innerHTML, EN_OFF);
});

test("the server-error copy translates through t() in zh", async () => {
  const { load, threadsEl } = runLoad({
    cache: cache(),
    navigator: { onLine: true },
    api: http503,
    paint: () => { threadsEl.innerHTML = "PAINTED"; },
    t: (s) => (s === EN_ERR ? ZH_ERR : s === EN_OFF ? ZH_OFF : s),
  });
  await load();
  assert.equal(threadsEl._kids.length, 1);
  assert.equal(threadsEl._kids[0].innerHTML, ZH_ERR);
});

test("still shows the note only once across repeated failures", async () => {
  const { load, threadsEl } = runLoad({
    cache: cache(),
    navigator: { onLine: true },
    api: http503,
    paint: () => { threadsEl.innerHTML = "PAINTED"; },
  });
  await load();
  await load();
  assert.equal(threadsEl._kids.filter((k) => k.className === "stale-note").length, 1, "one marker, not two");
});
