// The plan footer's compare button opened the same sheet as the header "Same notes, no Qloo"
// but was labelled with the jargon "Plain LLM" — two names for one thing. One label, one compare.
import test from "node:test";
import assert from "node:assert/strict";
import { read, loadZh } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const REL = "src/app/js/plan.result.js";
const LABEL = 'Same notes, no Qloo';

test("footer data-plain button uses esc(t(\"Same notes, no Qloo\"))", () => {
  const src = read(REL);
  const foot = src.split("\n").filter((l) => /class="btn" type="button" data-plain="1"/.test(l));
  assert.ok(foot.length >= 1, "the footer compare button exists");
  for (const line of foot) {
    assert.ok(/esc\(t\("Same notes, no Qloo"\)\)/.test(line), "footer button renders the shared label: " + line.trim());
    assert.ok(/data-plain="1"/.test(line), "data-plain hook kept: " + line.trim());
    assert.ok(/class="btn"/.test(line), "btn class kept: " + line.trim());
    assert.ok(!/Plain LLM/.test(line), "footer button no longer says Plain LLM: " + line.trim());
  }
});

test("no jargon label left in the module; every compare button shares one name", () => {
  const src = read(REL);
  assert.ok(!/t\("Plain LLM"\)/.test(src), 'module must not call t("Plain LLM")');
  const named = src.split("\n").filter((l) => /data-plain="1"/.test(l)).map((l) => (l.match(/Same notes, no Qloo|Plain LLM/) || [""])[0]);
  assert.ok(named.length >= 3, "header, masthead and footer compare buttons found: " + named.length);
  assert.ok(named.every((n) => n === LABEL), "all compare buttons carry the same label: " + JSON.stringify(named));
});

test("zh: shared label is translated and the old ZH key is kept", () => {
  const trZh = loadZh();
  const z = trZh(LABEL);
  assert.notEqual(z, LABEL, "zh copy exists for the shared label");
  assert.ok(/[\u4e00-\u9fff]/.test(z), "zh copy is Chinese: " + z);
  assert.ok(/口味目录/.test(z), "zh copy says 口味目录: " + z);
  assert.ok(!/Qloo/.test(z), "zh copy no longer says Qloo: " + z);
  assert.equal(trZh("Plain LLM"), "纯模型对比", "old ZH entry stays untouched");
});
