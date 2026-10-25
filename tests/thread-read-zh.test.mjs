// zh threads read (FP-79): the line must read as the catalogue's reading of what draws you to the
// cards, not claim every card carries the tag (the thread header already says when none does).
// No spaces around 「」; a space only between a Latin name and CJK.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadZh } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const trZh = loadZh();

test("named cards: space around the Latin name, tags packed, quote kept", () => {
  const en = "“Sensitive” is how the catalogue reads the pull of In the Mood for Love and Klara and the Sun — you wrote “rewatched it”.";
  assert.equal(
    trZh(en),
    "「Sensitive」是口味目录对 In the Mood for Love 和 Klara and the Sun 吸引你的那一面的读法——你写过“rewatched it”。"
  );
});

test("'your cards' and 'your recent cards' take no spaces (CJK on both sides)", () => {
  assert.equal(
    trZh("“Sensitive” and “Artistic” is how the catalogue reads the pull of your cards."),
    "「Sensitive」「Artistic」是口味目录对你的卡片吸引你的那一面的读法。"
  );
  assert.equal(
    trZh("“Steady” and “Moody” is how the catalogue reads the pull of your recent cards."),
    "「Steady」「Moody」是口味目录对你最近的卡片吸引你的那一面的读法。"
  );
});

test("the legacy Qloo sentence produces the same shape", () => {
  const z = trZh("“Sensitive” is how Qloo reads the pull of Her — you wrote “soft light”.");
  assert.equal(z, "「Sensitive」是口味目录对 Her 吸引你的那一面的读法——你写过“soft light”。");
  assert.ok(!/Qloo/.test(z));
});

test("no translationese leftovers, no carried-tag claim, no spacing around 「」", () => {
  const z = trZh("“Sensitive” is how the catalogue reads the pull of Her and Paterson.");
  assert.ok(!/来读/.test(z), z);
  assert.ok(!/对你的吸引/.test(z), z);
  assert.ok(!/「\s|\s」/.test(z), z);
  assert.ok(!/都带着/.test(z), z);
  assert.equal(z, "「Sensitive」是口味目录对 Her 和 Paterson 吸引你的那一面的读法。");
});
