// Shot 3 (threads): a note quote must never be cut mid-word; clipQuote trims at a word boundary.
import test from "node:test";
import assert from "node:assert/strict";
import { read, runFn } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const REL = "src/index.js";
const clip = (s, n) => runFn(REL, "clipQuote", {}, [s, n]);

test("fits: returned unchanged (even with trailing punctuation)", () => {
  assert.equal(clip("short note", 70), "short note");
  assert.equal(clip("Done.", 10), "Done.");
  assert.equal(clip("12345", 5), "12345");
});

test("null / empty / undefined become an empty string", () => {
  assert.equal(clip("", 70), "");
  assert.equal(clip(null, 70), "");
  assert.equal(clip(undefined, 70), "");
});

test("cuts at a word boundary and appends an ellipsis", () => {
  const q = "Big Thief live recording of Not at full volume while cleaning. best twenty minutes of the week";
  const out = clip(q, 70);
  const body = out.slice(0, -1);
  assert.ok(out.endsWith("…"), out);
  assert.ok(body.length <= 70, out);
  assert.ok(q.startsWith(body), out);
  assert.equal(q[body.length], " ", "cut lands just before a space: " + out);
  assert.ok(!/[\s.,;:\-—]$/.test(body), "no dangling punctuation: " + out);
  // The reported shot-3 case used to end "...cleaning. best tw" (mid-word).
  assert.ok(!out.includes(" tw"), out);
  assert.ok(out.endsWith("best…"), out);
});

test("strips trailing spaces/punctuation left by the cut", () => {
  assert.equal(clip("Hello. World again", 10), "Hello…");
  assert.equal(clip("Hello world   next", 13), "Hello world…");
  assert.ok(!/[\s.,;:!?…\-—]$/.test(clip("Goodbye. See you", 9).slice(0, -1)));
});

test("a single long word is still clipped", () => {
  const out = clip("x".repeat(200), 70);
  assert.equal(out, "x".repeat(70) + "…");
  assert.ok(out.length <= 71, "length " + out.length);
});

test("the threads read uses clipQuote, not a raw slice", () => {
  const src = read(REL);
  const after = src.split("is how the catalogue reads the pull of")[1] || "";
  assert.ok(/clipQuote\s*\(/.test(after), "threads read references clipQuote");
  assert.ok(!/\.slice\(0,\s*70\)/.test(src), "no raw slice(0, 70) left");
});
