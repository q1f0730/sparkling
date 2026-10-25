import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(ROOT, "src/app/js/core.js"), "utf8");
const m = src.match(/const TAG_ZH\s*=\s*(\{[\s\S]*?\});/);
assert.ok(m, "TAG_ZH table in core.js");
const TAG_ZH = vm.runInNewContext("(" + m[1] + ")");
const CJK = /[\u4e00-\u9fff]/;

const NEW = {
  welcoming: "温暖好客",
  poignant: "感人至深",
  haunted: "萦绕心头",
};

test("TAG_ZH covers the three added mood tags with Chinese", () => {
  for (const [key, zh] of Object.entries(NEW)) {
    assert.equal(TAG_ZH[key], zh, "TAG_ZH[" + key + "]");
    assert.match(TAG_ZH[key], CJK, "Chinese label for " + key);
  }
});

test("added keys are lower-case and labels stay short", () => {
  for (const key of Object.keys(NEW)) {
    assert.equal(key, key.toLowerCase().trim(), "key is lower-case: " + key);
    assert.ok(TAG_ZH[key].length <= 6, "short label: " + key);
  }
});

test("tagZh resolves the added tags in zh and passes names through in en", () => {
  const fn = src.match(/function tagZh\([\s\S]*?\n/);
  assert.ok(fn, "tagZh still exists");
  const zh = vm.runInNewContext("let LANG = 'zh'; " + fn[0] + "\ntagZh", {
    TAG_ZH,
  });
  assert.equal(zh("Welcoming"), "温暖好客");
  assert.equal(zh("  Poignant  "), "感人至深");
  assert.equal(zh("HAUNTED"), "萦绕心头");
  const en = vm.runInNewContext("let LANG = 'en'; " + fn[0] + "\ntagZh", {
    TAG_ZH,
  });
  assert.equal(en("Haunted"), "Haunted");
});

test("existing catalogue tags are not overwritten", () => {
  assert.equal(TAG_ZH["dream pop"], "梦幻流行");
  assert.equal(TAG_ZH["urban alienation"], "城市疏离");
  assert.equal(TAG_ZH["hip - hop"], "嘻哈");
});
