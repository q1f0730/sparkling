// zh parity (shot 4 composer): the "Plan for two" button must translate for 简体中文 users.
// The front modules are loaded the same way the sealed check does (lib_front.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { read, loadZh } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const src = read("src/app/js/plan.js");

test("the duo button copy goes through t() and keeps its markup", () => {
  assert.ok(
    src.includes('data-duo-go>\' + esc(t("Plan for two · try with a sample friend")) + \'</button>'),
    "duo button text is escaped and translated"
  );
  assert.match(src, /<button class="btn btn-sm" type="button" data-duo-go>/);
  assert.ok(src.includes('class="duo-box" data-out-only'));
});

test("no hardcoded duo copy is left once t() calls are stripped", () => {
  const stripped = src.replace(/\bt\(\s*(["'])(?:\\.|(?!\1).)*\1\s*\)/g, "T()");
  assert.ok(!/Plan for two &middot; try with a sample friend|Plan for two · try with a sample friend/.test(stripped));
});

test("zh dictionary translates the duo button", () => {
  const trZh = loadZh();
  const z = trZh("Plan for two · try with a sample friend");
  assert.equal(z, "两个人一起规划 · 用示例朋友试试");
  assert.match(z, /[\u4e00-\u9fff]/);
});
