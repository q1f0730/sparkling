import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/app/js/threads.js", import.meta.url), "utf8");
const EN = "The letter did not load. Check your connection, then try again.";
const ZH = "来信没加载出来。检查网络后再试一次。";

function renderLetterBody(){
  const i = src.indexOf("function renderLetter(");
  assert.ok(i >= 0, "renderLetter present");
  const j = src.indexOf("\nfunction ", i + 10);
  return src.slice(i, j > 0 ? j : undefined);
}

test("letter catch uses the shared errorBlock with a letter retry key", () => {
  const body = renderLetterBody();
  assert.ok(!/class="empty"><p>The letter did not load/.test(body), "no bare <p> error line");
  assert.ok(
    /errorBlock\(\s*(?:t\()?\s*"The letter did not load\. Check your connection, then try again\."\)?\s*,\s*"letter"\s*\)/.test(body),
    "catch renders errorBlock(EN, \"letter\")"
  );
});

test("renderLetter binds a letter retry handler that re-renders the letter", () => {
  const body = renderLetterBody();
  assert.ok(/bindRetries\(\s*\{[^}]*letter\s*:\s*renderLetter\b/.test(body), "bindRetries({ letter: renderLetter })");
});

test("the letter error copy has a zh dictionary entry", () => {
  const re = new RegExp(
    "Object\\.assign\\(ZH,[\\s\\S]{0,400}" +
      EN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      '"\\s*:\\s*"'
  );
  assert.ok(re.test(src), "Object.assign(ZH, ...) carries the letter error key");
  assert.ok(src.includes(EN + '": "' + ZH + '"'), "zh key maps to the translated copy");
});
