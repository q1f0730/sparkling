// Opening #/camera directly can race Capture's script load: the route ran before window.Capture existed
// and the composer stayed closed. The camera route must retry every 100ms for up to 3s until Capture is
// ready, then open once (same fab guard as the direct path).
// Static checks on core.js plus a behavioural run of openCameraWhenReady with stubbed timers.
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

// string/template/comment aware brace matcher (same shape as the front-end check helper)
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

// Runs openCameraWhenReady with fake timers; flushUntil(ms) advances the clock.
function makeHarness() {
  const pending = [];
  const opens = [];
  let now = 0;
  const win = {};
  const document = { querySelector: () => null };
  const setTimeoutStub = (fn, ms) => { pending.push({ fn, ms, at: now + ms }); return pending.length; };
  const src = fnSource(coreSrc, "openCameraWhenReady");
  const factory = new Function("window", "document", "setTimeout", src + "\n return openCameraWhenReady;");
  const fn = factory(win, document, setTimeoutStub);
  const capture = { open: (o) => opens.push(o) };
  function flushUntil(ms) {
    while (pending.length) {
      pending.sort((a, b) => a.at - b.at);
      const next = pending[0];
      if (next.at > ms) break;
      pending.shift();
      now = next.at;
      next.fn();
    }
  }
  return { fn, win, capture, opens, pending, flushUntil, now: () => now, document };
}

test("camera case still opens Capture directly and falls back to openCameraWhenReady", () => {
  const line = cameraCase();
  assert.match(line, /Capture\.open\(\{\}\)/, "direct open path stays: " + line);
  assert.match(line, /openCameraWhenReady\(/, "camera case retries when Capture is not ready: " + line);
  assert.match(line, /!window\.Capture/, "retry only when Capture is missing: " + line);
});

test("openCameraWhenReady retries every 100ms for up to 3s", () => {
  const h = makeHarness();
  h.fn();
  h.flushUntil(100000);
  assert.equal(h.opens.length, 0, "no open while Capture never appears");
  assert.equal(h.pending.length, 0, "polling stops instead of running forever");
  assert.equal(h.now(), 3000, "gives Capture 3 seconds total");
});

test("opens once as soon as Capture shows up mid-wait", () => {
  const h = makeHarness();
  h.fn();
  h.flushUntil(500);
  assert.equal(h.opens.length, 0, "still waiting at 500ms");
  h.win.Capture = h.capture;
  h.flushUntil(600);
  assert.deepEqual(h.opens, [{}], "opens with empty options once Capture is ready");
  const before = h.pending.length;
  h.flushUntil(5000);
  assert.equal(h.pending.length, before, "stops polling after a successful open");
  assert.equal(h.opens.length, 1, "opens exactly once");
});

test("does not open when Capture appears but the composer is already open", () => {
  const h = makeHarness();
  h.fn();
  h.flushUntil(100);
  h.document.querySelector = (sel) => (sel === ".cap-fab" ? { getAttribute: () => "true" } : null);
  h.win.Capture = h.capture;
  h.flushUntil(3000);
  assert.equal(h.opens.length, 0, "aria-expanded=true means no second open");
  assert.equal(h.pending.length, 0, "no polling left behind");
});

test("opens immediately without timers when Capture is already loaded", () => {
  const h = makeHarness();
  h.win.Capture = h.capture;
  h.fn();
  assert.deepEqual(h.opens, [{}], "opens synchronously");
  assert.equal(h.pending.length, 0, "no retry timer scheduled");
});
