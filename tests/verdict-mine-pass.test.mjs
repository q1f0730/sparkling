// Shot 5 (what breaks without Qloo): the go-out compare verdict shows "Without Qloo: N of M places
// checked out." — this adds its "With Qloo" counterpart: plainVerdict.mine_pass (stops with a catalogue
// qloo_id that are not is_closed) and the pv-checkmine line in verdictHTML, plus the zh pattern.
// Offline: pure functions from src/index.js and src/app/js/plan.result.js via the sealed lib_front helper.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runFn, esc, stripTags, loadZh } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const vp = (plan, plain) => runFn("src/index.js", "plainVerdict", {}, [plan, plain]);
const stop = (id, closed) => ({ name: "S" + id, qloo_id: id, is_closed: !!closed, sources: [{ name: "Big Thief" }] });
const base = { t: (s) => s, esc, LANG: "en" };
const html = (verdict, mine, plain) =>
  runFn("src/app/js/plan.result.js", "verdictHTML", base,
    [{ receipt: { seeds: [{ name: "Big Thief" }] } }, { verdict }, mine, plain]);

test("go-out: mine_pass counts catalogue stops that are not closed", () => {
  const v = vp({
    mode: "out", receipt: { seeds: [{ name: "Big Thief" }] },
    stops: [stop("a"), stop("b"), stop("c", true), { name: "no id" }],
  }, { stops: [{ why: "Big Thief", check: { ok: true } }, { why: "x" }] });
  assert.equal(v.mine_pass, 2, JSON.stringify(v));
  assert.equal(v.plain_pass, 1);
});

test("stay-in: no place check, like plain_pass", () => {
  const v = vp({ mode: "in", receipt: { seeds: [] }, picks: [{ name: "F" }] }, { picks: [{ why: "x" }] });
  assert.ok(v.mine_pass == null, "stay-in has no place check");
  assert.equal(v.plain_pass, null);
});

test("go-out without catalogue ids omits mine_pass, so the five-key API shape is unchanged", () => {
  // tests/demo-mainline-verdict.test.mjs deep-equals this object; a plan whose stops never touched Qloo
  // has no "With Qloo" side, so no mine_pass key may reach the JSON.
  const v = vp({ mode: "out", receipt: { seeds: [] }, stops: [{ name: "A" }, { name: "B" }] },
    { stops: [{ why: "x" }] });
  assert.deepEqual(JSON.parse(JSON.stringify(v)),
    { mine_total: 2, mine_linked: 0, plain_total: 1, plain_linked: 0, plain_pass: 0 });
  assert.ok(v.mine_pass == null);
});

test("verdictHTML: With-place line is pv-checkmine and sits right before the Without-place line", () => {
  const mine = [{ name: "A", sources: [{ name: "Big Thief" }] }, { name: "B", sources: [{ name: "Big Thief" }] }, { name: "C", sources: [{ name: "Big Thief" }] }];
  const plain = [{ name: "X", why: "y" }, { name: "Y", why: "y" }, { name: "Z", why: "y" }];
  const out = html({ mine_total: 3, mine_linked: 3, plain_total: 3, plain_linked: 3, plain_pass: 1, mine_pass: 3 }, mine, plain);
  const txt = stripTags(out);
  const iW = txt.indexOf("With Qloo: 3 of 3 places checked out.");
  const iO = txt.indexOf("Without Qloo: 1 of 3 places checked out.");
  assert.ok(iW >= 0, "with-line present: " + txt);
  assert.ok(iO > iW, "with-line before the without-line: " + txt);
  assert.match(out, /<p class="pv-checkmine"[^>]*>With Qloo: 3 of 3 places checked out\.<\/p>/);
});

test("verdictHTML: no With-place line when mine_pass is absent or null", () => {
  const mine = [{ name: "A" }], plain = [{ name: "X" }];
  for (const v of [
    { mine_total: 1, mine_linked: 0, plain_total: 1, plain_linked: 0, plain_pass: null },
    { mine_total: 1, mine_linked: 0, plain_total: 1, plain_linked: 0, plain_pass: null, mine_pass: null },
  ]) {
    const out = html(v, mine, plain);
    assert.ok(!/places checked out/.test(stripTags(out)), "no place lines: " + stripTags(out));
    assert.ok(!/pv-checkmine/.test(out));
  }
});

test("zh: the added With-place pattern translates and leaves the Without one intact", () => {
  const trZh = loadZh();
  assert.equal(trZh("With Qloo: 2 of 3 places checked out."), "用 Qloo：3 个地方里有 2 个核对得上。");
  assert.equal(trZh("Without Qloo: 1 of 3 places checked out."), "不用 Qloo：3 个地方里只有 1 个核对得上。");
});
