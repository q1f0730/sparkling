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

test("TAG_ZH spot-checks catalogue tags seen in zh mode", () => {
  const sample = {
    "forbidden desire": "禁忌之恋",
    "emotionally engaged": "情感投入",
    sensitive: "敏感",
    "dream pop": "梦幻流行",
    "movie theater": "电影院",
    "urban alienation": "城市疏离",
    "sci fi romance": "科幻爱情",
    "hip - hop": "嘻哈",
    "indie rock": "独立摇滚",
    "singer & songwriter": "唱作人",
    "live music venue": "现场音乐场地",
    "quiet lyricism": "静谧诗意",
  };
  for (const [key, zh] of Object.entries(sample)) {
    assert.equal(TAG_ZH[key], zh, key);
  }
});

test("every TAG_ZH value is a non-empty Chinese label", () => {
  const keys = Object.keys(TAG_ZH);
  assert.ok(keys.length >= 150, "table still covers the base tags");
  for (const key of keys) {
    assert.equal(key, key.toLowerCase().trim(), "key is lower-case: " + key);
    const v = TAG_ZH[key];
    assert.equal(typeof v, "string", "string value: " + key);
    assert.ok(v.trim().length > 0, "non-empty value: " + key);
    assert.match(v, CJK, "Chinese text: " + key);
    assert.ok(v.length <= 6, "short label: " + key + " -> " + v);
  }
});

test("tagZh still returns the Chinese label for a known tag", () => {
  const fn = src.match(/function tagZh\([\s\S]*?\n/);
  assert.ok(fn, "tagZh still exists");
  const tagZh = vm.runInNewContext("let LANG = 'zh'; " + fn[0] + "\ntagZh", {
    TAG_ZH,
  });
  assert.equal(tagZh("Dream Pop"), "梦幻流行");
  assert.equal(tagZh("  Movie Theater  "), "电影院");
});
