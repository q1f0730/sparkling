// zh-headline-space: the two plan headline lines (<span>…</span> + <em>…</em>) must join with no
// space in zh ("在家，按下播放。", "出发，去过一遍。") and keep exactly one space in en
// ("Stay in. Press play.", "Go live it.").
import test from "node:test";
import assert from "node:assert/strict";
import { read, runFn, loadZh, esc, stripTags } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const SRC = "src/app/js/plan.result.js";
const trZh = loadZh();

function scopeFor(lang, view) {
  return {
    LANG: lang,
    t: lang === "zh" ? trZh : (s) => s,
    trZh: (s) => trZh(s),
    esc,
    isCurrent: () => true,
    view,
    plural: (n, a, b) => (n === 1 ? a : b),
  };
}

function renderIn(lang) {
  const view = { classList: { add() {}, remove() {} }, innerHTML: "" };
  runFn(SRC, "paintIn", scopeFor(lang, view), [
    { mode: "in", kinds: ["film"], picks: [], header: "Saturday · quiet · film" },
  ]);
  return view.innerHTML;
}

function renderOut(lang) {
  const view = { classList: { add() {}, remove() {} }, innerHTML: "" };
  runFn(SRC, "paint", scopeFor(lang, view), [
    { mode: "out", stops: [], header: "Saturday · walk" },
  ]);
  return view.innerHTML;
}

const header = (html) => {
  const m = /<h2 class="plan-header r7-display">([\s\S]*?)<\/h2>/.exec(html);
  assert.ok(m, "plan header rendered");
  return m[1];
};

test("source: neither plan header joins its spans with a literal space in zh", () => {
  const lines = read(SRC).split("\n").filter((l) => l.includes('class="plan-header'));
  assert.equal(lines.length, 2, "stay-in and go-out headers both found");
  for (const l of lines) {
    assert.ok(!/<\/span> <em>/.test(l), "literal space joiner left: " + l.trim());
    assert.ok(/LANG\s*===\s*"zh"/.test(l), "joiner must depend on LANG: " + l.trim());
  }
});

test("stay-in zh headline: 在家，按下播放。 with no stray space", () => {
  const h = header(renderIn("zh"));
  assert.equal(h, "<span>在家，</span><em>按下播放。</em>");
  assert.equal(stripTags(h), "在家，按下播放。");
});

test("go-out zh headline: 出发，去过一遍。 with no stray space", () => {
  const h = header(renderOut("zh"));
  assert.equal(h, "<span>Go</span><em>live it.</em>");
  // The DOM pass translates the two text nodes; the join between them must add nothing.
  assert.equal(stripTags(h).replace("Go", trZh("Go")).replace("live it.", trZh("live it.")), "出发，去过一遍。");
});

test("en headlines keep their single space", () => {
  assert.equal(header(renderIn("en")), "<span>Stay in.</span> <em>Press play.</em>");
  assert.equal(stripTags(header(renderIn("en"))), "Stay in. Press play.");
  assert.equal(header(renderOut("en")), "<span>Go</span> <em>live it.</em>");
  assert.equal(stripTags(header(renderOut("en"))), "Go live it.");
});
