// zh parity for plan request errors/loading copy: every string must go through
// t() and have a Simplified Chinese entry in src/app/js/i18n.zh.js.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { loadZh } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLAN = fs.readFileSync(path.join(ROOT, "src", "app", "js", "plan.js"), "utf8");

const STRINGS = [
  "Could not plan for two just now.",
  "Your saved plans did not load.",
  "Weighing both notebooks\u2026",
  "The plan stream ended before a plan arrived.",
];

test("plan.js sends each error string through t()", () => {
  const withoutT = PLAN.replace(/t\((["'])[^)]*\)/g, "");
  for (const s of STRINGS) {
    assert.ok(PLAN.includes('t("' + s + '")'), "missing t() around: " + s);
    assert.ok(!withoutT.includes(s), "hardcoded English still in plan.js: " + s);
  }
});

test("each error string has a Simplified Chinese translation", () => {
  const trZh = loadZh();
  for (const s of STRINGS) {
    const out = trZh(s);
    assert.notEqual(out, s, "untranslated: " + s);
    assert.match(out, /[\u4e00-\u9fff]/, "no Chinese characters: " + s + " -> " + out);
  }
});
