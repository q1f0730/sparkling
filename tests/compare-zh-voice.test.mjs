// FP-61: the 简体中文 compare screen names the catalogue (口味目录), not Qloo.
// English keys stay as they are; only zh values change.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadZh } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(HERE, "..", "src", "app", "js", "i18n.extra.js"), "utf8");
const trZh = loadZh();

const COMPARE_KEYS = [
  "Same notes, no Qloo",
  "Same cards, same area, same model. The only change: no Qloo.",
  "Same cards, same model. The only change: no Qloo.",
  "With Qloo: 3 of 3 tied to a card you kept.",
  "Without Qloo: 0 of 2 tied to a card you kept.",
  "With Qloo: 2 of 3 places checked out.",
  "Without Qloo: 1 of 3 places checked out.",
  "The model named these from memory. Afterwards Sparkling looked each one up in Qloo: does it exist, is it still open, is it near your route.",
  "Every stop came from Qloo in the first place: an ID, coordinates, listed hours and credit to your notes.",
  "Asking a plain model, no Qloo… usually 5–15 seconds.",
  "In Qloo",
  "In Qloo, but far",
  "Closed for good, per Qloo",
  "Not in Qloo, so unchecked",
];

test("no zh value in i18n.extra.js still says 用 Qloo", () => {
  const bad = SRC.split("\n").filter((l) => /用(?:了)?\s?Qloo/.test(l));
  assert.deepEqual(bad, [], "lines still saying 用 Qloo: " + bad.join(" | "));
});

test("zh compare copy names 口味目录 and drops the Qloo word", () => {
  for (const en of COMPARE_KEYS) {
    const zh = trZh(en);
    assert.notEqual(zh, en, "key is translated: " + en);
    assert.match(zh, /口味目录/, "zh names the catalogue for: " + en + " -> " + zh);
    assert.doesNotMatch(zh, /Qloo/, "zh still says Qloo for: " + en + " -> " + zh);
  }
});

test("exact zh wording for the compare titles and verdict lines", () => {
  assert.equal(trZh("Same notes, no Qloo"), "同样的笔记，不用口味目录");
  assert.equal(trZh("Same cards, same area, same model. The only change: no Qloo."), "同样的卡片、同样的区域、同一个模型，唯一的区别：不用口味目录。");
  assert.equal(trZh("Same cards, same model. The only change: no Qloo."), "同样的卡片、同一个模型，唯一的区别：不用口味目录。");
  assert.equal(trZh("With Qloo: 3 of 3 tied to a card you kept."), "用了口味目录：3 个里有 3 个连着你留下的卡片。");
  assert.equal(trZh("Without Qloo: 0 of 2 tied to a card you kept."), "不用口味目录：2 个里有 0 个连着你留下的卡片。");
  assert.equal(trZh("With Qloo: 2 of 3 places checked out."), "用口味目录：3 个地方里有 2 个核对得上。");
  assert.equal(trZh("Without Qloo: 1 of 3 places checked out."), "不用口味目录：3 个地方里只有 1 个核对得上。");
});

test("English keys are unchanged, and the Sparkling + Qloo wordmark stays", () => {
  assert.ok(SRC.includes("Same notes, no Qloo"), "title key unchanged");
  assert.ok(SRC.includes("With Qloo: (\\d+) of (\\d+) places checked out\\."), "verdict regex key unchanged");
  assert.equal(trZh("Sparkling + Qloo"), "Sparkling + Qloo", "product wordmark is not translated");
});
