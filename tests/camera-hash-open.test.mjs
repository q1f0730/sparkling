// In-app navigation to #/camera left the composer closed: core.js route() opened it synchronously
// inside the hashchange event, then capture.js's own hashchange listener (registered later) ran
// `if (isOpen) close(true)` in the same event and shut it again. The camera open must be deferred
// past the current event when the route came from a hashchange.
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

// route() runs with stubs; setTimeout is captured so the deferred open never fires by itself.
function runRoute(opts) {
  const src = fnSource(coreSrc, "route");
  const calls = [];
  const timers = [];
  const state = { booted: true, user: { id: 1 } };
  const capture = opts && opts.capture !== undefined ? opts.capture : { open: (o) => calls.push(["open", o]) };
  const doc = {
    querySelector: (sel) => (sel === ".cap-fab" ? (opts && opts.fab) || null : null),
  };
  const scope = {
    state,
    parseRoute: () => ({ name: "camera" }),
    history: { replaceState: () => calls.push(["replaceState"]) },
    document: doc,
    window: { Capture: capture, scrollTo: () => {} },
    Capture: capture,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    renderNotes: () => calls.push(["renderNotes"]),
    renderOnboarding: () => calls.push(["renderOnboarding"]),
    openCameraWhenReady: () => calls.push(["retry"]),
  };
  const proxy = new Proxy(scope, {
    has: (t, k) => typeof k === "string" && k !== "__fn",
    get: (t, k) => (k in t ? t[k] : typeof k === "string" && k in globalThis ? globalThis[k] : () => {}),
  });
  const factory = new Function("__scope", "with (__scope) { " + src + "\n return route; }");
  return { route: factory(proxy), calls, timers, state };
}

test("camera case defers Capture.open inside setTimeout(..., 0)", () => {
  const line = cameraCase();
  const m = /setTimeout\(\s*function\s*\(\)\s*\{([^]{0,400}?)Capture\.open\(/.exec(line);
  assert.ok(m, "Capture.open must run inside a setTimeout callback: " + line);
  assert.doesNotMatch(m[1], /\}\s*,\s*\d+\s*\)/, "Capture.open must be inside the callback, not after it");
  assert.match(line, /\},\s*0\s*\)/, "the deferral is a zero-delay timeout");
});

test("the hashchange listener asks route() to defer the camera open", () => {
  const m = /addEventListener\("hashchange",\s*function\s*\(\)\s*\{([^]{0,300}?)\}\);/.exec(coreSrc);
  assert.ok(m, "core.js registers a hashchange listener");
  assert.match(m[1], /route\(\s*true\s*\)/, "hashchange navigation defers the camera open: " + m[1]);
});

test("route(true) leaves the composer closed until the event ends, then opens once", () => {
  const { route, calls, timers } = runRoute({});
  route(true);
  assert.equal(calls.filter((c) => c[0] === "open").length, 0, "no synchronous open inside the hashchange event");
  assert.ok(calls.some((c) => c[0] === "renderNotes"), "notes render immediately");
  assert.equal(timers.length, 1, "exactly one deferred open is scheduled");
  assert.equal(timers[0].ms, 0, "deferred by a zero-delay timeout");
  timers[0].fn();
  const opens = calls.filter((c) => c[0] === "open");
  assert.equal(opens.length, 1, "the timeout opens the composer once");
  assert.deepEqual(opens[0][1], {});
});

test("route(true) keeps the already-open guard in the deferred callback", () => {
  const { route, calls, timers } = runRoute({ fab: { getAttribute: () => "true" } });
  route(true);
  assert.equal(timers.length, 1, "the deferral is still scheduled");
  timers[0].fn();
  assert.equal(calls.filter((c) => c[0] === "open").length, 0, "no second open when aria-expanded is true");
});

test("a direct route() (boot) still opens synchronously", () => {
  const { route, calls, timers } = runRoute({});
  route();
  const opens = calls.filter((c) => c[0] === "open");
  assert.equal(opens.length, 1, "boot does not wait for a timer");
  assert.deepEqual(opens[0][1], {});
  assert.equal(timers.length, 0, "nothing is deferred for a direct call");
});
