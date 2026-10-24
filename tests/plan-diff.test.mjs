import test from "node:test"; import assert from "node:assert/strict";
import { planDiff } from "../src/plan.js";
const st = (n, src = []) => ({ name: n, sources: src.map((x) => ({ name: x })) });
test("replaced stop credited to the disliked card", () => {
  const d = planDiff({ stops: [st("A", ["Solaris"]), st("B"), st("C")] }, { stops: [st("A2"), st("B"), st("C")] }, "Solaris", false, "p1");
  assert.equal(d.changes.length, 1); assert.deepEqual(d.changes[0], { stop: 1, was: "A", now: "A2", credited: true });
  assert.deepEqual(d.kept, ["B", "C"]); assert.equal(d.same, false); assert.equal(d.from, "p1");
});
test("kept stop re-credited when the disliked card was its reason", () => {
  const d = planDiff({ stops: [st("A", ["Solaris", "Hat"])] }, { stops: [st("A", ["Hat", "Cap"])] }, "Solaris");
  assert.equal(d.changes.length, 0); assert.equal(d.same, false);
  assert.deepEqual(d.recredit, [{ stop: 1, name: "A", was: ["Solaris", "Hat"], now: ["Hat", "Cap"] }]);
});
test("identical plans are flagged same", () => {
  const d = planDiff({ stops: [st("A"), st("B")] }, { stops: [st("a"), st("B")] }, "X");
  assert.equal(d.same, true); assert.equal(d.changes.length, 0);
});
test("shorter plan lists a dropped stop with no replacement; null-safe", () => {
  const d = planDiff({ stops: [st("A"), st("B")] }, { stops: [st("A")] }, "X");
  assert.deepEqual(d.changes, [{ stop: 2, was: "B", now: null, credited: false }]);
  assert.equal(planDiff(null, null, null).same, true);
});
