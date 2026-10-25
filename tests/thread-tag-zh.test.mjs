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

const THREAD_TAGS = [
  "Affair",
  "Elegantly Composed",
  "Emotional Growth",
  "Impressionistic",
  "Intimacy",
  "Sensitive",
  "Vulnerability",
  "Confessional",
];

test("TAG_ZH covers every thread tag of the sample notebook", () => {
  for (const tag of THREAD_TAGS) {
    const key = tag.toLowerCase();
    assert.equal(key, key.trim(), "lower-case key: " + tag);
    const zh = TAG_ZH[key];
    assert.equal(typeof zh, "string", "entry for " + tag);
    assert.match(zh, CJK, "Chinese label for " + tag);
    assert.ok(zh.length > 0 && zh.length <= 6, "short label for " + tag + ": " + zh);
  }
});

test("thread tag translations stay natural and exact", () => {
  assert.equal(TAG_ZH["affair"], "婚外情");
  assert.equal(TAG_ZH["elegantly composed"], "从容雅致");
  assert.equal(TAG_ZH["emotional growth"], "情感成长");
  assert.equal(TAG_ZH["impressionistic"], "印象派");
  assert.equal(TAG_ZH["intimacy"], "亲密感");
});

test("tagZh resolves thread tags in zh and leaves them alone in en", () => {
  const fn = src.match(/function tagZh\([\s\S]*?\n/);
  assert.ok(fn, "tagZh still exists");
  const zh = vm.runInNewContext("let LANG = 'zh'; " + fn[0] + "\ntagZh", { TAG_ZH });
  const en = vm.runInNewContext("let LANG = 'en'; " + fn[0] + "\ntagZh", { TAG_ZH });
  for (const tag of THREAD_TAGS) {
    assert.notEqual(zh(tag), tag, "zh label for " + tag);
    assert.equal(en(tag), tag, "en passes through " + tag);
  }
  assert.equal(zh("  Elegantly Composed  "), "从容雅致");
});
