import test from "node:test";
import assert from "node:assert/strict";
import { runFn, esc, loadZh } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const REL = "src/app/js/threads.js";
const sc = { esc, attr: esc, tagPretty: (x) => x, tagZh: (x) => x, plural: (n, a, b) => (n === 1 ? a : b), shiftPill: () => "", LANG: "en", window: {} };
const cards = (flags) => flags.map((f, i) => ({ id: "c" + i, name: "Card" + i, type: "film", footprints: 2, carries_tag: f }));
const html = (th, scope = sc) => runFn(REL, "threadHTML", scope, [{ tag: "Sensitive", qloo_tags: [{ name: "Sensitive" }], read: "r", ...th }, 0]);

test("a carried thread shows only the cards that carry the tag", () => {
  const out = html({ cards: cards([true, true, false, false]), carried_by_cards: true });
  assert.match(out, /Card0/);
  assert.match(out, /Card1/);
  assert.ok(!/Card2|Card3/.test(out), "cards that do not carry the tag are not chips of that thread");
  assert.match(out, /From your notes/);
  assert.ok(!/Across your most-kept cards/.test(out));
});

test("a fallback thread relabels its chips honestly and still lists every card", () => {
  const out = html({ cards: cards([false, false, false]), carried_by_cards: false });
  assert.ok(!/From your notes/.test(out), "fallback thread no longer claims 'From your notes'");
  assert.match(out, /Across your most-kept cards/);
  assert.match(out, /Card0/);
  assert.match(out, /Card1/);
  assert.match(out, /Card2/);
});

test("the four sample fallback tags all read the same honest label", () => {
  for (const tag of ["Sensitive", "Artistic", "Vulnerability", "Elegantly Composed"]) {
    const out = runFn(REL, "threadHTML", sc, [{ tag, qloo_tags: [{ name: tag }], read: "r", cards: cards([false, false, false, false]), carried_by_cards: false }, 0]);
    assert.match(out, /Across your most-kept cards/, tag);
    assert.ok(!/From your notes/.test(out), tag);
    assert.ok((out.match(/class="thread-chip type-/g) || []).length === 4, tag + " keeps all four chips");
  }
});

test("cards without the flag keep the old label and listing", () => {
  const out = html({ cards: [{ id: "a", name: "Old", type: "film", footprints: 1 }] });
  assert.match(out, /From your notes/);
  assert.match(out, /Old/);
});

test("zh dictionary translates the new fallback label", () => {
  const zh = loadZh()("Across your most-kept cards");
  assert.match(zh, /[\u4e00-\u9fff]/);
  assert.notEqual(zh, "Across your most-kept cards");
});

test("zh render uses the translated fallback label and stays on chips", () => {
  const zhTr = loadZh();
  const zhScope = { ...sc, LANG: "zh", t: zhTr };
  const out = html({ cards: cards([false, false]), carried_by_cards: false }, zhScope);
  assert.match(out, new RegExp(zhTr("Across your most-kept cards").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(!/Across your most-kept cards|From your notes/.test(out));
});
