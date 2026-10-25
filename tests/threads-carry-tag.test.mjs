// FP-49: /api/threads marks every card with carries_tag, but threadHTML fell back to listing the
// server's shared "most-kept" cards whenever no card carried the tag — so every thread showed the same
// card rows. Only cards with carries_tag === true may be listed; when none is, the thread says so.
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
const chipCount = (out) => (out.match(/class="thread-chip type-/g) || []).length;

test("a carried thread lists only the cards with carries_tag true", () => {
  const out = html({ cards: cards([true, true, false, false]), carried_by_cards: true });
  assert.equal(chipCount(out), 2);
  assert.match(out, /Card0/);
  assert.match(out, /Card1/);
  assert.ok(!/Card2|Card3/.test(out), "cards that do not carry the tag are not listed");
  assert.ok(!out.includes(EN), "a thread with evidence needs no empty line");
  assert.match(out, /From your notes/);
});

test("a thread where no card carries the tag lists no cards and says so", () => {
  const out = html({ cards: cards([false, false, false]), carried_by_cards: false });
  assert.equal(chipCount(out), 0, "fallback threads must not list the shared most-kept cards");
  assert.ok(!/Card0|Card1|Card2/.test(out));
  assert.ok(out.includes(EN), "the honest line replaces the rows");
  assert.ok(!/Across your most-kept cards/.test(out), "no chip label without chips");
  assert.ok(!/From your notes/.test(out));
});

test("two fallback threads no longer repeat the same card rows", () => {
  const a = html({ tag: "Sensitive", cards: cards([false, false, false, false]), carried_by_cards: false });
  const b = html({ tag: "Artistic", cards: cards([false, false, false, false]), carried_by_cards: false });
  assert.equal(chipCount(a), 0);
  assert.equal(chipCount(b), 0);
  assert.ok(a.includes(EN) && b.includes(EN));
});

test("cards without the flag keep the old listing", () => {
  const out = html({ cards: [{ id: "a", name: "Old", type: "film", footprints: 1 }] });
  assert.equal(chipCount(out), 1);
  assert.match(out, /From your notes/);
  assert.match(out, /Old/);
  assert.ok(!out.includes(EN), "old payloads are not called evidence-less");
});

test("the empty line is translated in zh", () => {
  const m = /Object\.assign\(ZH,\s*\{[^}]*"No card carries this tag directly":\s*"([^"]+)"/.exec(SRC);
  assert.ok(m, "threads.js registers a zh entry for the honest line");
  assert.match(m[1], /[\u4e00-\u9fff]/);
  const zh = html({ cards: cards([false, false]), carried_by_cards: false }, { ...sc, LANG: "zh", t: (s) => (s === EN ? m[1] : s) });
  assert.ok(zh.includes(m[1]), "zh renders the translated line");
  assert.ok(!zh.includes(EN));
});
