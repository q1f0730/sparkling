// Shot 5: the compare sheet must show what breaks without Qloo. The server sends
// {mine_total, mine_linked, plain_total, plain_linked, plain_pass}; the sheet must read those
// keys (not the 3-of-3 heuristic), add the place-check line for go-out, hide it for stay-in,
// stop printing the raw model id and route "Plain LLM" through t().
import test from "node:test";
import assert from "node:assert/strict";
import { read, fnSource, runFn, esc, stripTags, loadZh } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const REL = "src/app/js/plan.result.js";
const src = read(REL);
const t = (s) => s;
const scope = { t, esc, LANG: "en" };
const plan = { receipt: { seeds: [{ name: "Big Thief" }, { name: "Mitski" }] } };
const mine = [
  { name: "A", why_line: "Because you kept Big Thief" },
  { name: "B", from_notes: "You wrote about Mitski." },
  { name: "C", sources: [{ name: "Big Thief" }] },
];
// every plain name mentions a seed, so the local heuristic alone would say 3 of 3
const plainNaming = [
  { name: "X", why: "like Big Thief" },
  { name: "Y", why: "for Mitski" },
  { name: "Z", why: "Big Thief vibes" },
];

test("server verdict keys are authoritative", () => {
  const html = runFn(REL, "verdictHTML", scope, [
    plan,
    { verdict: { mine_total: 3, mine_linked: 3, plain_total: 3, plain_linked: 1, plain_pass: null } },
    mine,
    plainNaming,
  ]);
  const txt = stripTags(html);
  assert.ok(/With Qloo: 3 of 3 tied to a card you kept\./.test(txt), txt);
  assert.ok(/Without Qloo: 1 of 3 tied to a card you kept\./.test(txt), txt);
  assert.ok(!/places checked out/.test(txt), "stay-in has no place-check line");
});

test("go-out adds the place-check line from plain_pass", () => {
  const html = runFn(REL, "verdictHTML", scope, [
    plan,
    { verdict: { mine_total: 3, mine_linked: 3, plain_total: 3, plain_linked: 3, plain_pass: 1 } },
    mine,
    plainNaming,
  ]);
  const txt = stripTags(html);
  assert.ok(/Without Qloo: 1 of 3 places checked out\./.test(txt), txt);
  assert.ok(/class="pv-check"/.test(html), "the line has its own pv-check class");
  assert.ok(/class="pv-without"/.test(html), "the two kept-link lines are still there");
});

test("plain_pass zero still renders, plain_pass null does not", () => {
  const zero = stripTags(runFn(REL, "verdictHTML", scope, [
    plan,
    { verdict: { mine_total: 2, mine_linked: 2, plain_total: 2, plain_linked: 0, plain_pass: 0 } },
    mine.slice(0, 2),
    plainNaming.slice(0, 2),
  ]));
  assert.ok(/Without Qloo: 0 of 2 places checked out\./.test(zero), zero);
  const stayIn = stripTags(runFn(REL, "verdictHTML", scope, [
    plan,
    { verdict: { mine_total: 2, mine_linked: 2, plain_total: 2, plain_linked: 0, plain_pass: null } },
    mine.slice(0, 2),
    plainNaming.slice(0, 2),
  ]));
  assert.ok(!/places checked out/.test(stayIn), stayIn);
});

test("old with_qloo/without_qloo fallbacks still work", () => {
  const txt = stripTags(runFn(REL, "verdictHTML", scope, [
    plan,
    { verdict: { with_qloo: { tied: 2, total: 3 }, without_qloo: [1, 3] } },
    mine,
    plainNaming,
  ]));
  assert.ok(/With Qloo: 2 of 3 tied to a card you kept\./.test(txt), txt);
  assert.ok(/Without Qloo: 1 of 3 tied to a card you kept\./.test(txt), txt);
  assert.ok(!/places checked out/.test(txt), "no plain_pass key, no place-check line");
});

test("no raw model id in the sheet and Plain LLM goes through t()", () => {
  const op = fnSource(src, "openPlain");
  assert.ok(op, "openPlain exists");
  assert.ok(!/esc\(\s*String\(\s*pl\.model\s*\)/.test(op), "openPlain must not print the raw model id");
  assert.ok(!/>Plain LLM</.test(src), "button text must go through t()");
  assert.ok(/t\("Plain LLM"\)/.test(src), 'button uses t("Plain LLM")');
});

test("zh: place-check line and button", () => {
  const trZh = loadZh();
  for (const [k, nums] of [
    ["Without Qloo: 1 of 3 places checked out.", ["1", "3"]],
    ["Without Qloo: 0 of 2 places checked out.", ["0", "2"]],
  ]) {
    const z = trZh(k);
    assert.ok(z !== k && /[\u4e00-\u9fff]/.test(z), "zh for: " + k + " -> " + z);
    assert.ok(/Qloo/.test(z), "zh keeps Qloo: " + z);
    for (const n of nums) assert.ok(z.includes(n), "zh keeps " + n + ": " + z);
  }
  assert.equal(trZh("Without Qloo: 1 of 3 places checked out."), "不用 Qloo：3 个地方里只有 1 个核对得上。");
  assert.equal(trZh("Plain LLM"), "纯模型对比");
  // the old kept-link patterns are untouched
  assert.ok(trZh("Without Qloo: 0 of 2 tied to a card you kept.").includes("连着"));
});
