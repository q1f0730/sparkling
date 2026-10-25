// Probe 10-25 17:35, offline (every API request aborted, en+zh): #/threads quietly kept showing its
// in-memory copy — the catch in threads.js rendered nothing, so the list looked live when it was old.
// The catch must mark a painted cached list once with <p class="stale-note" role="status">, and a later
// successful load must drop that mark.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const threadsSrc = fs.readFileSync(path.join(ROOT, "src/app/js/threads.js"), "utf8");
const EN = "Offline · showing your last copy.";
const ZH = "离线 · 显示的是上次的内容。";

// string/template/comment aware brace matcher, same shape as the front-end check helper
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

// load() runs with stubs; paint/skeleton/error helpers are replaced so only the catch's own marking is checked.
function runLoad(opts) {
  // fnSource starts at `function`, dropping the `async` keyword the module uses on load()
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

const offline = () => Promise.reject(new Error("offline"));

test("threads.js carries the en→zh entry for the stale note", () => {
  const m = /Object\.assign\(ZH,\s*\{[^}]*"Offline · showing your last copy\.":\s*"离线 · 显示的是上次的内容。"/.exec(threadsSrc);
  assert.ok(m, 'Object.assign(ZH, { "Offline · showing your last copy.": "离线 · 显示的是上次的内容。" }) at the top of threads.js');
});

test("the catch marks a cached list as the last copy and does not return silently", () => {
  const load = fnSource(threadsSrc, "load");
  const c = load.slice(load.indexOf("catch"));
  assert.match(c, /stale-note/, "the catch mentions .stale-note: " + c.slice(0, 300));
  assert.ok(c.includes('t("' + EN + '")'), "the note goes through t() so zh reads as Chinese");
  assert.ok(!/\}\s*if \(cached\) return;/.test(c), "no silent return after paint(cached)");
});

test("a successful load removes the stale note", () => {
  const load = fnSource(threadsSrc, "load");
  const beforeCatch = load.slice(0, load.indexOf("catch"));
  assert.match(beforeCatch, /\.stale-note/, "the try branch removes any .stale-note");
});

test("offline with a cached copy shows the note once, above the painted list (en)", async () => {
  const cached = { threads: [{ tag: "Slow burn" }] };
  const painted = [];
  const { load, threadsEl } = runLoad({
    cache: { all: cached },
    api: offline,
    paint: (d) => { painted.push(d); threadsEl.innerHTML = '<article class="thread">PAINTED</article>'; },
  });
  await load();
  assert.equal(painted.length, 1, "the cached copy is still painted");
  assert.match(threadsEl.innerHTML, /PAINTED/, "the list stays on screen");
  assert.equal(threadsEl._kids.length, 1, "exactly one marker is added");
  const note = threadsEl._kids[0];
  assert.equal(note.className, "stale-note");
  assert.equal(note.tagName, "p");
  assert.equal(note.getAttribute("role"), "status");
  assert.equal(note.innerHTML, EN);
  assert.equal(threadsEl.firstChild, note, "the note sits at the top of the list");
});

test("offline twice in a row still shows the note only once", async () => {
  const { load, threadsEl } = runLoad({
    cache: { all: { threads: [{ tag: "Slow burn" }] } },
    api: offline,
    paint: (d) => { threadsEl.innerHTML = '<article class="thread">PAINTED</article>'; void d; },
  });
  await load();
  await load();
  assert.equal(threadsEl._kids.filter((k) => k.className === "stale-note").length, 1, "one marker, not two");
});

test("offline with a cached copy reads in zh", async () => {
  const { load, threadsEl } = runLoad({
    cache: { all: { threads: [{ tag: "Slow burn" }] } },
    api: offline,
    paint: () => { threadsEl.innerHTML = "PAINTED"; },
    t: (s) => (s === EN ? ZH : s),
  });
  await load();
  assert.equal(threadsEl._kids.length, 1);
  assert.equal(threadsEl._kids[0].innerHTML, ZH);
});

test("a later successful fetch drops the stale mark", async () => {
  const threadsEl = makeEl();
  // first pass: offline, cached list painted, note inserted
  const first = runLoad({
    el: threadsEl,
    cache: { all: { threads: [{ tag: "Slow burn" }] } },
    api: offline,
    paint: () => { threadsEl.innerHTML = "PAINTED"; },
  });
  await first.load();
  assert.equal(threadsEl._kids.length, 1, "the marker is there while offline");
  // second pass on the same element: the paint stub keeps prior children, so only the success
  // branch itself can take the marker down
  const second = runLoad({
    el: threadsEl,
    cache: { all: { threads: [{ tag: "Slow burn" }] } },
    api: () => Promise.resolve({ threads: [{ tag: "Slow burn" }, { tag: "New" }] }),
    paint: () => {},
  });
  await second.load();
  assert.equal(threadsEl._kids.filter((k) => k.className === "stale-note").length, 0, "success removes the mark");
});
