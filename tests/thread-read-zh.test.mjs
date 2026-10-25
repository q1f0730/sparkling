// zh threads read (walk 10-25 17:30): no "来读…对你的吸引" translationese, no spaces around 「」,
// tags packed together, a space only between a Latin name and 在.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadZh } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const trZh = loadZh();

test("named cards: space after the Latin name, tags packed, quote kept", () => {
  const en = "“Sensitive” is how the catalogue reads the pull of In the Mood for Love and Klara and the Sun — you wrote “rewatched it”.";
  assert.equal(
    trZh(en),
    "In the Mood for Love 和 Klara and the Sun 在口味目录里都带着「Sensitive」这个标签——你写过“rewatched it”。"
  );
});

test("'your cards' and 'your recent cards' take no leading space", () => {
  assert.equal(
    trZh("“Sensitive” and “Artistic” is how the catalogue reads the pull of your cards."),
    "你的卡片在口味目录里都带着「Sensitive」「Artistic」这个标签。"
  );
  assert.equal(
    trZh("“Steady” and “Moody” is how the catalogue reads the pull of your recent cards."),
    "你最近的卡片在口味目录里都带着「Steady」「Moody」这个标签。"
  );
});

test("the legacy Qloo sentence produces the same shape", () => {
  const z = trZh("“Sensitive” is how Qloo reads the pull of Her — you wrote “soft light”.");
  assert.equal(z, "Her 在口味目录里都带着「Sensitive」这个标签——你写过“soft light”。");
  assert.ok(!/Qloo/.test(z));
});

test("no translationese leftovers or spacing around 「」", () => {
  const z = trZh("“Sensitive” is how the catalogue reads the pull of Her and Paterson.");
  assert.ok(!/来读/.test(z), z);
  assert.ok(!/对你的吸引/.test(z), z);
  assert.ok(!/「\s|\s」/.test(z), z);
  assert.equal(z, "Her 和 Paterson 在口味目录里都带着「Sensitive」这个标签。");
});
