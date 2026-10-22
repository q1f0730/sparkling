import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLetterboxd } from "../src/recognize.js";
import { cohorts, planNotice } from "../src/plan.js";

test("letterboxd parses quoted commas and rewatch", () => {
  const r = parseLetterboxd('Date,Name,Year,Rating,Rewatch\n2024-01-02,"Her, Again",2013,4.5,Yes\n');
  assert.equal(r[0].title, "Her, Again"); assert.equal(r[0].rating, 4.5); assert.equal(r[0].rewatch, true);
});
test("letterboxd without Name column returns null", () => assert.equal(parseLetterboxd("a,b\n1,2"), null));
test("cohorts split recent vs earlier", () => {
  const cards = Array.from({ length: 12 }, (_, i) => ({ id: i, last: i }));
  const c = cohorts(cards); assert.equal(c.size, 6); assert.equal(c.now[0].id, 11); assert.equal(c.then[0].id, 5);
});
test("planNotice silent when not widened", () => assert.equal(planNotice([], "Greenpoint", false), null));
test("planNotice names the wider area", () => {
  const n = planNotice([{ neighborhood: "Williamsburg" }, { neighborhood: "Williamsburg" }], "Greenpoint, Brooklyn", true);
  assert.match(n, /Both stops are in Williamsburg/);
});
