// zh parity: the plan composer's buttons/placeholder/aria, the plan-result error copy and the
// inline trace-more toggle were hardcoded English. They must go through t(), and the inline
// onclick must read its labels from data attributes that t() filled at render time.
import assert from "node:assert/strict";
import { test } from "node:test";
import { read, runFn, esc, loadZh } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const PLAN = read("src/app/js/plan.js");
const RESULT = read("src/app/js/plan.result.js");
const ZH = read("src/app/js/i18n.zh.js");
const trZh = loadZh();

const STRINGS = [
  "Make a plan",
  "Making a plan",
  "When",
  "Saturday afternoon",
  "That did not work. Try again.",
  "Show less",
];

test("every plan button string has a 简体中文 translation", () => {
  for (const key of STRINGS) {
    assert.match(trZh(key), /[\u4e00-\u9fff]/, "not translated: " + key);
  }
  assert.equal(trZh("+ 3 more from your notes"), "还有 3 条来自你的笔记");
});

test("the zh keys live in i18n.zh.js", () => {
  assert.ok(ZH.includes('"Show less": "收起"'), "Show less key missing from i18n.zh.js");
  assert.ok(ZH.includes("more from your notes"), "the + N more pattern must live in i18n.zh.js");
});

test("plan.js sends the composer labels through t()", () => {
  assert.ok(
    PLAN.includes('data-when aria-label="\' + attr(t("When")) + \'" placeholder="\' + attr(t("Saturday afternoon")) + \'"'),
    "aria-label=\"When\" and placeholder=\"Saturday afternoon\" must be t()-wrapped"
  );
  assert.ok(!PLAN.includes('aria-label="When"'), "hardcoded aria-label");
  assert.ok(!PLAN.includes('placeholder="Saturday afternoon"'), "hardcoded placeholder");
  assert.ok(!PLAN.includes(">Make a plan<"), "hardcoded Make a plan label");
  const makePlan = PLAN.match(/esc\(t\("Make a plan"\)\)/g) || [];
  assert.equal(makePlan.length, 2, "both Make a plan buttons go through t()");
  assert.ok(PLAN.includes('planBtn.textContent = t("Make a plan")'), "the reset label goes through t()");
  assert.ok(PLAN.includes('planBtn.textContent = t("Making a plan")'), "the busy label goes through t()");
  // 10-25 plan-error-friendly: the submit fallback is now the outage copy (never the raw e.message), still via t()
  assert.ok(PLAN.includes('t("Sparkling could not reach the catalogue just now. Your notes are safe. Try again in a moment.")'), "the submit fallback goes through t()");
  assert.ok(PLAN.includes("whenInput.value = t(p.when)"), "the out preset fills a translated when value");
});

test("plan.result.js t()-wraps every 'That did not work.' fallback", () => {
  const wrapped = RESULT.match(/t\("That did not work\. Try again\."\)/g) || [];
  assert.equal(wrapped.length, 3, "all three fallbacks go through t()");
  const stripped = RESULT.replace(/t\("That did not work\. Try again\."\)/g, "");
  assert.ok(!stripped.includes("That did not work. Try again."), "hardcoded error copy left");
  assert.ok(!RESULT.includes("没成功，再试一次。"), "the inline zh branch should come from the dictionary now");
});

test("the trace-more onclick reads t()-filled data attributes", () => {
  assert.ok(RESULT.includes('data-less="\' + attr(t("Show less")) + \'"'), "data-less must come from t()");
  assert.ok(
    RESULT.includes('data-more="\' + attr(t("+ " + (src.length - 1) + " more from your notes")) + \'"'),
    "data-more must come from t()"
  );
  assert.ok(
    RESULT.includes("this.getAttribute(\\'data-less\\'):this.getAttribute(\\'data-more\\')"),
    "the inline onclick must swap the two translated labels"
  );
  assert.ok(
    RESULT.includes('esc(t("+ " + (src.length - 1) + " more from your notes"))'),
    "the initial label goes through t()"
  );
  assert.ok(!RESULT.includes("'Show less':"), "hardcoded toggle label left in the inline handler");
});

test("the rendered trace-more button carries the Chinese labels", () => {
  const html = runFn(
    "src/app/js/plan.result.js",
    "sourcesHTML",
    { t: trZh, esc, attr: esc, typeClass: function(){ return "type-movie"; }, stopEvidenceHTML: function(){ return ""; } },
    [{ sources: [
      { name: "A", card_id: "1", type: "movie" },
      { name: "B", card_id: "2", type: "movie" },
      { name: "C", card_id: "3", type: "movie" },
    ] }]
  );
  assert.match(html, /data-less="收起"/);
  assert.match(html, /data-more="还有 2 条来自你的笔记"/);
  assert.match(html, />还有 2 条来自你的笔记</);
  assert.ok(!html.includes("Show less"), "English toggle label leaked into the zh render");
});
