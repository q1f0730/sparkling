// #/camera must open the composer deterministically: the old flow only set state.capOpen and relied on
// Capture.attach's setTimeout(120) handoff, which loses the open when the notes view re-renders.
// Static checks on the camera case plus a behavioural run of route() with stubs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coreSrc = fs.readFileSync(path.join(ROOT, "src/app/js/core.js"), "utf8");

function cameraCase() {
  const m = coreSrc.match(/case "camera":([^\n]*)/);
  assert.ok(m, "core.js route() has a camera case");
  return m[0];
}

// string/template/comment aware brace matcher, same shape as the front-end check helper
function fnSource(text, name) {
  const re = new RegExp("function\\s+" + name + "\\s*\\(");
  const m = re.exec(text);
  assert.ok(m, "core.js defines " + name);
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

function runRoute(opts) {
  const src = fnSource(coreSrc, "route");
  const calls = [];
  const state = { booted: true, user: { id: 1 } };
  const capture = opts.capture === undefined ? { open: (o) => calls.push(["open", o]) } : opts.capture;
  const doc = {
    getElementById: (id) => (id === "capSheet" ? opts.sheet || null : null),
    querySelector: (sel) => (sel === ".cap-fab" ? opts.fab || null : null),
  };
  const scope = {
    state,
    parseRoute: () => ({ name: "camera" }),
    history: { replaceState: () => calls.push(["replaceState"]) },
    document: doc,
    window: { Capture: capture, scrollTo: () => {} },
    Capture: capture,
    renderNotes: () => calls.push(["renderNotes"]),
    renderOnboarding: () => calls.push(["renderOnboarding"]),
  };
  const proxy = new Proxy(scope, {
    has: (t, k) => typeof k === "string" && k !== "__fn",
    get: (t, k) => (k in t ? t[k] : typeof k === "string" && k in globalThis ? globalThis[k] : () => {}),
  });
  const fn = new Function("__scope", "with (__scope) { " + src + "\n return route; }");
  fn(proxy).call(null);
  return { calls, state };
}

test("camera case clears the capOpen handoff instead of seeding it", () => {
  const line = cameraCase();
  assert.match(line, /state\.capOpen\s*=\s*null/, "camera case must clear state.capOpen: " + line);
  assert.doesNotMatch(line, /state\.capOpen\s*=\s*\{\s*\}/, "camera case must not hand off via state.capOpen = {}");
});

test("camera case calls Capture.open({}) directly after renderNotes()", () => {
  const line = cameraCase();
  const notesAt = line.indexOf("renderNotes()");
  const openAt = line.search(/Capture\.open\(/);
  assert.ok(notesAt >= 0, "camera case renders notes");
  assert.ok(openAt >= 0, "camera case calls Capture.open directly: " + line);
  assert.ok(openAt > notesAt, "Capture.open must come after renderNotes(): " + line);
  assert.match(line, /Capture\.open\(\{\}\)/, "composer opens with empty options: " + line);
});

test("camera case guards a missing Capture and an already-open composer", () => {
  const line = cameraCase();
  assert.match(line, /window\.Capture|typeof Capture/, "camera case checks Capture exists: " + line);
  assert.match(line, /aria-expanded|capSheet|hidden/, "camera case skips when the composer is already open: " + line);
});

test("route() renders notes first, then opens the composer once", () => {
  const { calls, state } = runRoute({});
  const notesAt = calls.findIndex((c) => c[0] === "renderNotes");
  const openAt = calls.findIndex((c) => c[0] === "open");
  assert.ok(notesAt >= 0, "camera route renders notes");
  assert.ok(openAt > notesAt, "composer opens after renderNotes");
  const opens = calls.filter((c) => c[0] === "open");
  assert.equal(opens.length, 1, "exactly one Capture.open call");
  assert.deepEqual(opens[0][1], {});
  assert.equal(state.capOpen, null, "capOpen handoff is cleared");
});

test("route() does nothing when the composer is already open", () => {
  const { calls } = runRoute({ fab: { getAttribute: () => "true" } });
  assert.equal(calls.filter((c) => c[0] === "open").length, 0, "no second open when already open");
  assert.ok(calls.some((c) => c[0] === "renderNotes"), "camera route still renders notes");
});

test("route() survives when Capture is not loaded yet", () => {
  const { calls, state } = runRoute({ capture: null, fab: null });
  assert.equal(calls.filter((c) => c[0] === "open").length, 0);
  assert.ok(calls.some((c) => c[0] === "renderNotes"), "camera route still renders notes");
  assert.equal(state.capOpen, null);
});
