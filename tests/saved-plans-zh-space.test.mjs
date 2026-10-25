// Saved plans error slot: probe 10-25 17:35 zh (API 503) rendered
// "已保存的计划没加载出来。 再试一次" — an ASCII space after the full stop that has no business in
// Chinese, and the "Try again" label was hardcoded English (only fixed later by the DOM pass).
// The message and the button must join with (LANG === "zh" ? "" : " ") and the label must go through t().
import assert from "node:assert/strict";
import { test } from "node:test";
import { read, esc, loadZh, stripTags } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const PLAN = read("src/app/js/plan.js");
const trZh = loadZh();

/** The saved-plans compact-error line, plus the innerHTML expression it evaluates to. */
function savedErrorLine(){
  const line = PLAN.split("\n").find((x) => x.includes('t("Your saved plans did not load.")'));
  assert.ok(line, "saved-plans error line not found in src/app/js/plan.js");
  return line;
}
function savedErrorHTML(lang){
  const line = savedErrorLine();
  const expr = line.slice(line.indexOf("=") + 1, line.lastIndexOf(";"));
  const t = lang === "zh" ? trZh : (s) => s;
  return new Function("esc", "t", "LANG", "return (" + expr + ");")(esc, t, lang);
}

test("the saved-plans error joins its message and button without an ASCII space in zh", () => {
  const line = savedErrorLine();
  assert.ok(/LANG\s*===\s*"zh"/.test(line), "the join must be LANG-aware: " + line.trim());
  assert.ok(!/\)\) \+ ' <button/.test(line), "literal space before the button: " + line.trim());

  const zh = savedErrorHTML("zh");
  assert.ok(stripTags(zh).includes("已保存的计划没加载出来。再试一次"), "zh output still has a stray space: " + zh);
  assert.ok(!zh.includes("。 "), "ASCII space after the zh full stop: " + zh);
  // en keeps the word space between the sentence and the label
  assert.ok(stripTags(savedErrorHTML("en")).includes("Your saved plans did not load. Try again"), "en join lost its space");
});

test("the Try again label goes through t() and renders in 简体中文", () => {
  const line = savedErrorLine();
  assert.ok(line.includes('esc(t("Try again"))'), "the button label must be esc(t(\"Try again\")): " + line.trim());
  assert.equal(trZh("Try again"), "再试一次");
  const zh = savedErrorHTML("zh");
  assert.ok(zh.includes(">再试一次</button>"), "zh button label not translated: " + zh);
  assert.ok(!zh.includes(">Try again<"), "English label leaked into the zh render");
});

test("the error keeps its retry hook and error styling", () => {
  for (const lang of ["en", "zh"]) {
    const html = savedErrorHTML(lang);
    assert.match(html, /class="compact-error"/);
    assert.ok(html.includes('data-retry="saved"'), "the retry hook was dropped in " + lang);
    assert.ok(html.includes('class="text-btn"'), "the button class was dropped in " + lang);
  }
});
