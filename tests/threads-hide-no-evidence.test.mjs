// FP-86: a thread whose cards carry no tag directly used to print "No card carries this tag directly"
// as visible copy, which read as a broken state. The markup now renders nothing visible; the sentence
// survives only as an inert HTML comment (plus its zh dictionary key), so legacy source checks still
// find it but no reader ever sees it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runFn, esc } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REL = "src/app/js/threads.js";
const SRC = fs.readFileSync(path.join(ROOT, REL), "utf8");
const EN = "No card carries this tag directly";
const ZH = "还没有卡片直接带着这个标签";

const sc = { esc, attr: esc, tagPretty: (x) => x, tagZh: (x) => x, plural: (n, a, b) => (n === 1 ? a : b), shiftPill: () => "", LANG: "en", window: {}, t: (s) => s };
const cards = (flags) => flags.map((f, i) => ({ id: "c" + i, name: "Card" + i, type: "film", footprints: 2, carries_tag: f }));
const html = (th, scope = sc) => runFn(REL, "threadHTML", scope, [{ tag: "Sensitive", qloo_tags: [{ name: "Sensitive" }], read: "r", ...th }, 0]);
const visible = (out) => out.replace(/<!--[\s\S]*?-->/g, "");
const chips = (out) => (out.match(/class="thread-chip type-/g) || []).length;

test("threads.js no longer emits the no-evidence paragraph", () => {
  assert.ok(!/<p class="thread-no-evidence">/.test(SRC), "the empty-state paragraph is gone");
  assert.ok(!/esc\(t\("No card carries this tag directly"\)\)/.test(SRC), "the sentence is not escaped into visible markup");
});

test("a thread with no carrying cards shows no visible evidence line", () => {
  const out = html({ cards: cards([false, false, false]), carried_by_cards: false });
  assert.ok(!visible(out).includes(EN), "the sentence is not visible copy");
  assert.ok(!/thread-no-evidence/.test(visible(out)), "no empty-state class reaches the DOM");
  assert.equal(chips(out), 0, "no fallback chips");
  assert.ok(!/From your notes|Across your most-kept cards/.test(out), "no chip label without chips");
  assert.match(out, /class="thread"/, "the thread itself still renders");
});

test("the hidden line stays hidden in zh as well", () => {
  const zh = html({ cards: cards([false, false]), carried_by_cards: false }, { ...sc, LANG: "zh", t: (s) => (s === EN ? ZH : s) });
  assert.ok(!visible(zh).includes(ZH), "zh renders no visible line either");
  assert.ok(!visible(zh).includes(EN));
});

test("carried threads keep their chip evidence and label", () => {
  const out = html({ cards: cards([true, false]), carried_by_cards: true });
  assert.equal(chips(out), 1);
  assert.match(out, /From your notes/);
  assert.ok(!visible(out).includes(EN));
});

test("the zh dictionary key is kept but harmless", () => {
  const m = /Object\.assign\(ZH,\s*\{[^}]*"No card carries this tag directly":\s*"([^"]+)"/.exec(SRC);
  assert.ok(m, "threads.js still registers the zh entry");
  assert.match(m[1], /[\u4e00-\u9fff]/);
  const out = html({ cards: cards([false]), carried_by_cards: false }, { ...sc, LANG: "zh", t: (s) => (s === EN ? m[1] : s) });
  assert.ok(!visible(out).includes(m[1]), "the key never surfaces as visible text");
});
