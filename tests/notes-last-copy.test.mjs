// Probe 10-26 09:30 (zh, 390px, API 503 and offline): after the notebook had
// loaded once, coming back to #/notes with the API down wiped the list and
// showed only the error block - the user's own notebook vanished, while Threads
// keeps its last copy. notes.feed.js must remember the last fulfilled notes
// response and repaint it with one honest stale-note line when a later
// loadInitial() fails.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const NOTES = fs.readFileSync(path.join(ROOT, "src", "app", "js", "notes.feed.js"), "utf8");

const START = "async function loadInitial(";
const END = "async function loadNotes(";

function loadInitialBody(){
  const i = NOTES.indexOf(START);
  const j = NOTES.indexOf(END, i);
  assert.ok(i > -1 && j > i, "could not find loadInitial in src/app/js/notes.feed.js");
  return NOTES.slice(i, j);
}

// A tiny element stub: innerHTML swaps its children, insertBefore puts the
// stale note in front of the painted list.
function fakeEl(){
  const el = {
    attrs: {},
    _children: [],
    _html: "",
    setAttribute(k, v){ el.attrs[k] = v; },
    removeAttribute(k){ delete el.attrs[k]; },
    get firstChild(){ return el._children[0] || null; },
    insertBefore(node, ref){
      const at = ref ? el._children.indexOf(ref) : -1;
      el._children.splice(at < 0 ? 0 : at, 0, node);
    },
    querySelector(){ return null; },
  };
  Object.defineProperty(el, "innerHTML", {
    get(){ return el._html; },
    set(v){ el._html = String(v); el._children = v ? [{ html: String(v) }] : []; },
  });
  return el;
}

// Run the real loadInitial() body with stubbed neighbours so the behaviour is
// exercised, not just grepped. NOTES_LAST persists across calls in one sandbox.
function sandbox(nextNotes, nav){
  const listEl = fakeEl();
  const created = [];
  const calls = { grease: 0, paint: 0, error: 0 };
  const doc = {
    createElement(tag){
      const n = { tagName: tag, className: "", textContent: "", attrs: {}, setAttribute(k, v){ n.attrs[k] = v; } };
      created.push(n);
      return n;
    },
  };
  const factory = new Function(
    "NOTES_LAST", "api", "normalizeMentionCounts", "paintGreeting", "paintTimeline", "setListError",
    "listEl", "document", "t", "esc", "navigator",
    "let notes = [];\n" +
    "let baseCount = null;\n" +
    "let greetingNotes = null;\n" +
    "let greetingCards = null;\n" +
    "let initialRetry = true;\n" +
    "let loadSeq = 0;\n" +
    "const token = {};\n" +
    "const ac = { signal: null };\n" +
    "function isCurrent(){ return true; }\n" +
    loadInitialBody() + "\n" +
    "return { loadInitial: loadInitial, notes: function(){ return notes; }, last: function(){ return NOTES_LAST; } };"
  );
  const api = function(url, call){
    if (url.indexOf("/api/notes") === 0) return nextNotes(call);
    return Promise.resolve({ cards: [] });
  };
  let served = 0;
  const sb = factory(
    null,
    function(url){ return api(url, served++); },
    function(){},
    function(){ calls.grease++; },
    function(){ calls.paint++; listEl.innerHTML = "<section>painted</section>"; },
    function(){ calls.error++; listEl.innerHTML = "ERROR BLOCK"; },
    listEl,
    doc,
    function(s){ return s; },
    function(s){ return s; },
    nav
  );
  return { sb: sb, listEl: listEl, created: created, calls: calls };
}

const notesPayload = { notes: [{ id: 1, text: "one" }, { id: 2, text: "two" }] };

test("loadInitial remembers the last fulfilled notes list at module level", async () => {
  const box = sandbox(function(){ return Promise.resolve(notesPayload); }, { onLine: true });
  await box.sb.loadInitial();
  assert.equal(box.calls.paint, 1);
  assert.equal(box.calls.error, 0);
  assert.deepEqual(box.sb.last(), notesPayload.notes, "NOTES_LAST keeps the fulfilled notes");
  assert.equal(box.listEl._children[0].className, undefined, "a fresh paint has no stale-note wrapper");
});

test("an online 503 repaints the last notebook with the refresh stale note first", async () => {
  const err = new Error("503");
  err.status = 503;
  const box = sandbox(function(call){ return call === 0 ? Promise.resolve(notesPayload) : Promise.reject(err); }, { onLine: true });
  await box.sb.loadInitial();
  box.sb.loadInitial();
  await new Promise(function(r){ setTimeout(r, 0); });
  assert.equal(box.calls.error, 0, "the error block must not replace the notebook");
  assert.equal(box.calls.paint, 2, "the last copy is painted again");
  assert.deepEqual(box.sb.notes(), notesPayload.notes, "the notebook survives the failed load");
  const first = box.listEl.firstChild;
  assert.ok(first && first.tagName === "p", "a <p> stale note is the first child of the list");
  assert.equal(first.className, "stale-note");
  assert.equal(first.attrs.role, "status");
  assert.equal(first.textContent, "Couldn't refresh · showing your last copy.");
});

test("offline (navigator.onLine === false) says offline instead of blaming the refresh", async () => {
  const err = new Error("offline");
  err.status = 0;
  const box = sandbox(function(call){ return call === 0 ? Promise.resolve(notesPayload) : Promise.reject(err); }, { onLine: false });
  await box.sb.loadInitial();
  box.sb.loadInitial();
  await new Promise(function(r){ setTimeout(r, 0); });
  assert.equal(box.sb.notes().length, 2);
  assert.equal(box.listEl.firstChild.textContent, "Offline · showing your last copy.");
});

test("online without an HTTP status also reads as offline", async () => {
  const box = sandbox(function(call){ return call === 0 ? Promise.resolve(notesPayload) : Promise.reject(new Error("down")); }, { onLine: true });
  await box.sb.loadInitial();
  box.sb.loadInitial();
  await new Promise(function(r){ setTimeout(r, 0); });
  assert.equal(box.listEl.firstChild.textContent, "Offline · showing your last copy.");
});

test("a first load with nothing remembered still shows the error block", async () => {
  const box = sandbox(function(){ return Promise.reject(new Error("down")); }, { onLine: true });
  await box.sb.loadInitial();
  assert.equal(box.calls.error, 1, "setListError() stays the fallback without a last copy");
  assert.equal(box.calls.paint, 0);
  assert.equal(box.created.length, 0, "no stale note without a last copy");
  assert.equal(box.listEl.innerHTML, "ERROR BLOCK");
});

test("module-level NOTES_LAST is declared above renderNotes()", () => {
  // declared at the end of picker.js (the module before notes.feed.js) so notes.feed.js keeps its manifest anchor first
  const APP = fs.readFileSync(path.join(ROOT, "src", "app.html"), "utf8");
  const decl = APP.match(/^(?:let|var)\s+NOTES_LAST\b/m);
  assert.ok(decl, "NOTES_LAST must be a module-level declaration at column 0");
  assert.ok(APP.indexOf(decl[0]) < APP.indexOf("function renderNotes("), "declared above renderNotes()");
});

test("both stale lines are translated and already in the 简体中文 table", () => {
  const body = loadInitialBody();
  for (const key of ["Couldn't refresh · showing your last copy.", "Offline · showing your last copy."]) {
    assert.ok(body.indexOf('"' + key + '"') > -1, "loadInitial must choose " + JSON.stringify(key));
  }
  assert.match(body, /textContent\s*=\s*t\(/, "the chosen copy goes through t()");
  const HTML = fs.readFileSync(path.join(ROOT, "src", "app.html"), "utf8");
  const start = HTML.indexOf("const ZH = {");
  const end = HTML.indexOf("/* DOM pass: translate exact UI strings");
  assert.ok(start > -1 && end > start, "could not find the i18n block in src/app.html");
  // Both keys are added by threads.js after the base table; keep its one-line Object.assign.
  const extra = HTML.match(/Object\.assign\(ZH, \{[^\n]*Couldn't refresh · showing your last copy\.[^\n]*\}\);/);
  assert.ok(extra, "src/app.html must add both stale-copy keys to ZH");
  const i18n = new Function("LANG", HTML.slice(start, end) + "\n" + extra[0] + "\nreturn { ZH: ZH, t: t };")("zh");
  for (const key of ["Couldn't refresh · showing your last copy.", "Offline · showing your last copy."]) {
    assert.match(i18n.ZH[key] || "", /[\u4e00-\u9fff]/, "no 简体中文 text for " + JSON.stringify(key));
    assert.equal(i18n.t(key), i18n.ZH[key]);
  }
});
