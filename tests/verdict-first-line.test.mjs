// verdict-first-line: FP-33. The compare sheet used to print the same verdict sentence twice
// when both counts tied (e.g. "With Qloo: 3 of 3 ..." above "Without Qloo: 3 of 3 ...").
// The With Qloo line stays; an identical Without Qloo row is dropped. Different counts keep
// both rows so the gap between the two runs stays visible.
import test from "node:test";
import assert from "node:assert/strict";
import { runFn, esc, stripTags } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const SRC = "src/app/js/plan.result.js";

function verdictText(plan, pl, mine, theirs) {
  return stripTags(runFn(SRC, "verdictHTML", { t: (s) => s, esc }, [plan, pl, mine, theirs]));
}

const PLAN = { mode: "out", receipt: { seeds: [{ name: "Seed One" }, { name: "Seed Two" }] } };
const MINE = [
  { name: "A", from_notes: "You wrote about Seed One." },
  { name: "B", sources: [{ name: "Seed Two" }] },
  { name: "C", from_notes: "You wrote about Seed One." },
];

test("equal counts with a place check drop both tied lines; places lead (FP-38)", () => {
  const theirs = [
    { name: "X", why: "Warm, like Seed One." },
    { name: "Y", why: "Because you kept Seed Two." },
    { name: "Z", why: "It follows Seed One." },
  ];
  const text = verdictText(PLAN, { stops: theirs, verdict: { plain_pass: 1, mine_pass: 3 } }, MINE, theirs);
  assert.doesNotMatch(text, /tied to a card you kept/);
  assert.match(text, /With Qloo: 3 of 3 places checked out\./);
  assert.match(text, /Without Qloo: 1 of 3 places checked out\./);
});

test("equal counts without a place check (stay-in) keep both tied lines", () => {
  const theirs = [
    { name: "X", why: "Warm, like Seed One." },
    { name: "Y", why: "Because you kept Seed Two." },
    { name: "Z", why: "It follows Seed One." },
  ];
  const text = verdictText(PLAN, { stops: theirs }, MINE, theirs);
  assert.equal((text.match(/tied to a card you kept\./g) || []).length, 2);
});

test("different counts keep both tied lines", () => {
  const theirs = [
    { name: "X", why: "Warm, like Seed One." },
    { name: "Y", why: "Nothing in particular." },
  ];
  const text = verdictText(PLAN, { stops: theirs }, MINE, theirs);
  assert.match(text, /With Qloo: 3 of 3 tied to a card you kept\./);
  assert.match(text, /Without Qloo: 1 of 2 tied to a card you kept\./);
});

test("a server-sent verdict with equal counts and no place check keeps both tied lines", () => {
  const plan = { mode: "out" };
  const pl = {
    stops: [{ name: "B", why: "x" }],
    verdict: { with_qloo: { tied: 2, total: 2 }, without_qloo: { tied: 2, total: 2 } },
  };
  const text = verdictText(plan, pl, [{ name: "A" }], pl.stops);
  assert.match(text, /With Qloo: 2 of 2 tied to a card you kept\./);
  assert.match(text, /Without Qloo: 2 of 2 tied to a card you kept\./);
});

test("the places-checked lines survive when the tied rows tie", () => {
  const plan = { mode: "out" };
  const pl = {
    stops: [{ name: "B", why: "x" }],
    verdict: {
      with_qloo: { tied: 2, total: 2 },
      without_qloo: { tied: 2, total: 2 },
      mine_pass: 2,
      plain_pass: 0,
    },
  };
  const text = verdictText(plan, pl, [{ name: "A" }], pl.stops);
  assert.match(text, /With Qloo: 2 of 2 places checked out\./);
  assert.match(text, /Without Qloo: 0 of 2 places checked out\./);
  assert.doesNotMatch(text, /tied to a card you kept/);
});

test("the With Qloo line is the first verdict line when the duplicate is dropped", () => {
  const plan = { mode: "out" };
  const pl = {
    stops: [{ name: "B", why: "x" }],
    verdict: { with_qloo: { tied: 3, total: 3 }, without_qloo: { tied: 3, total: 3 } },
  };
  const text = verdictText(plan, pl, [{ name: "A" }], pl.stops);
  const at = text.indexOf("With Qloo: 3 of 3 tied to a card you kept.");
  assert.ok(at >= 0, "With Qloo line present");
  assert.ok(text.indexOf("Without Qloo:") === -1 || at < text.indexOf("Without Qloo:"), "With Qloo comes first");
});
