// FP-50: in the compare sheet, when every plain-model row carries the same reason text (e.g. the honest
// fallback "The plain model gave no reason tied to your notes."), the sheet says it once above the rows in
// an element marked data-plain-reason-once and omits it per row. Differing (or missing) reasons stay per row.
// Both compare branches are covered: stay-in picks and go-out stops.
import test from "node:test";
import assert from "node:assert/strict";
import { read, runFn, esc, stripTags } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const SRC = "src/app/js/plan.result.js";
const SCOPE = { esc, t: (s) => s };
const FALLBACK = "The plain model gave no reason tied to your notes.";
const reasonOnce = (items) => runFn(SRC, "plainReasonOnce", SCOPE, [items]);
const block = (text) => runFn(SRC, "plainReasonOnceHTML", SCOPE, [text]);
const pickRow = (p, kindTag, hideWhy) => runFn(SRC, "plainPickRow", SCOPE, [p, kindTag, hideWhy]);
const stopRow = (s, ckLine, hideWhy) => runFn(SRC, "plainStopRow", SCOPE, [s, ckLine, hideWhy]);
const count = (text, re) => (text.match(re) || []).length;

test("every plain pick with the same reason: said once above the rows, omitted per row", () => {
  const picks = [
    { name: "Lost in Translation", kind: "film", why: FALLBACK },
    { name: "Blue", kind: "music", why: FALLBACK },
  ];
  const shared = reasonOnce(picks);
  assert.equal(shared, FALLBACK);
  const aside = block(shared);
  assert.match(aside, /data-plain-reason-once="1"/, "the shared line carries the marker");
  const rows = picks.map((p) => pickRow(p, () => "", true)).join("");
  const text = stripTags(aside + rows);
  assert.equal(count(text, /no reason tied to your notes/g), 1, "the reason appears exactly once: " + text);
  for (const p of picks) {
    assert.ok(text.includes(p.name), "row keeps its name");
    assert.doesNotMatch(stripTags(pickRow(p, () => "", true)), /no reason tied/, "row repeats the shared reason");
  }
});

test("differing reasons stay per row and nothing is hoisted", () => {
  const picks = [
    { name: "Lost in Translation", kind: "film", why: "Quiet and close to the mood you keep." },
    { name: "Blue", kind: "music", why: "Slow and warm, like your notes." },
  ];
  assert.equal(reasonOnce(picks), null);
  assert.equal(block(null), "");
  const text = stripTags(picks.map((p) => pickRow(p, () => "", false)).join(""));
  assert.match(text, /Quiet and close to the mood you keep\./);
  assert.match(text, /Slow and warm, like your notes\./);
});

test("a missing reason among identical ones stops the hoist", () => {
  const picks = [
    { name: "Lost in Translation", kind: "film", why: FALLBACK },
    { name: "Blue", kind: "music" },
  ];
  assert.equal(reasonOnce(picks), null);
  const text = stripTags(picks.map((p) => pickRow(p, () => "", false)).join(""));
  assert.equal(count(text, /no reason tied/g), 1, "the one honest fallback stays on its own row");
});

test("a single row keeps its own reason (nothing is repeated)", () => {
  assert.equal(reasonOnce([{ name: "Lost in Translation", kind: "film", why: FALLBACK }]), null);
  const text = stripTags(pickRow({ name: "Lost in Translation", kind: "film", why: FALLBACK }, () => "", false));
  assert.match(text, /no reason tied to your notes\./);
});

test("no rows: no shared line, no throw", () => {
  assert.equal(reasonOnce([]), null);
  assert.equal(reasonOnce(null), null);
  assert.equal(reasonOnce(undefined), null);
  assert.equal(block(""), "");
  assert.equal(block(null), "");
});

test("the shared line escapes the reason and keeps the marker", () => {
  const html = block('No <reason> "tied" & kept');
  assert.match(html, /data-plain-reason-once="1"/);
  assert.ok(!html.includes("<reason>"), "raw markup must not reach the sheet");
  assert.match(html, /&lt;reason&gt;/);
  assert.match(html, /&quot;tied&quot;/);
  assert.match(html, /&amp;/);
});

test("go-out plain stops with the same reason say it once; each check line stays", () => {
  const stops = [
    { name: "Cafe A", kind: "cafe", check: { status: "found" }, why: FALLBACK },
    { name: "Cafe B", kind: "cafe", check: { status: "not_found" }, why: FALLBACK },
  ];
  assert.equal(reasonOnce(stops), FALLBACK);
  const ckLine = (c) => '<span class="pc pc-ok">' + c.status + "</span>";
  const rows = stops.map((s) => stopRow(s, ckLine, true)).join("");
  const text = stripTags(block(FALLBACK) + rows);
  assert.equal(count(text, /no reason tied/g), 1, "the reason is not repeated on the rows: " + text);
  assert.match(text, /Cafe A/);
  assert.match(text, /Cafe B/);
  assert.match(text, /found/);
  assert.match(text, /not_found/);
});

test("go-out plain stops with differing reasons keep each why on its row", () => {
  const stops = [
    { name: "Cafe A", kind: "cafe", check: { status: "found" }, why: "Near your route." },
    { name: "Cafe B", kind: "cafe", check: { status: "found" }, why: "Quiet at noon." },
  ];
  assert.equal(reasonOnce(stops), null);
  const text = stripTags(stops.map((s) => stopRow(s, () => "", false)).join(""));
  assert.match(text, /Near your route\./);
  assert.match(text, /Quiet at noon\./);
});

test("openPlain wires the shared line into both compare branches, above the rows", () => {
  const src = read(SRC);
  assert.match(src, /plainReasonOnceHTML\(sharedPickWhy\) \+ '<ol class="plain-list"/, "stay-in rows follow the shared line");
  assert.match(src, /plainReasonOnceHTML\(sharedStopWhy\) \+ '<ol class="plain-list"/, "go-out rows follow the shared line");
  assert.match(src, /plainReasonOnce\(plainPicks\)/);
  assert.match(src, /plainReasonOnce\(pl && pl\.stops\)/);
});
