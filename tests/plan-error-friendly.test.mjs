// Plan request errors: a catalogue/network outage must show a friendly, human message
// instead of the raw server error ("upstream unavailable"). Probe 10-25 17:35 (en+zh, 390+1440, API 503).
import assert from "node:assert/strict";
import { test } from "node:test";
import { read, runFn, esc, stripTags } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const PLAN = read("src/app/js/plan.js");
const EN = "Sparkling could not reach the catalogue just now. Your notes are safe. Try again in a moment.";
const ZH = "Sparkling 暂时连不上口味目录。你的笔记都在，稍后再试一次。";

test("the plan catch never shows a raw server/network message", () => {
  assert.ok(!/showPlanError\([^;]*e\.message/.test(PLAN), "e.message is still passed to showPlanError");
  assert.ok(PLAN.includes('showPlanError(null, t("' + EN + '"))'), "the catch must show the friendly outage copy");
});

test("plan.js adds the 简体中文 entry for the friendly copy", () => {
  const m = PLAN.match(/Object\.assign\(ZH,\s*\{[\s\S]*?\}\s*\);/);
  assert.ok(m, "missing Object.assign(ZH, {...}) in plan.js");
  const add = new Function("return " + m[0].replace(/^Object\.assign\(ZH,\s*/, "").replace(/\);\s*$/, ""))();
  assert.equal(add[EN], ZH);
});

test("the error box shows the friendly copy and keeps Try again", () => {
  const enHtml = stripTags(runFn("src/app/js/plan.js", "planErrorHTML", { t: (s) => s, esc, LANG: "en" }, [null, EN]));
  assert.ok(enHtml.includes(EN), "en error box lost the friendly copy: " + enHtml);
  assert.match(enHtml, /Try again/);

  // production calls t() in the catch, so planErrorHTML receives the already-translated text
  const zhHtml = stripTags(runFn("src/app/js/plan.js", "planErrorHTML", { t: (s) => s, esc, LANG: "zh" }, [null, ZH]));
  assert.ok(zhHtml.includes(ZH), "zh error box lost the friendly copy: " + zhHtml);
  assert.match(zhHtml, /Try again/);
});
