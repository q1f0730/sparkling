// FP-84: the catalogue's year for In the Mood for Love is 1990 (the film is 2000). A stay-in pick
// must show the real year, so plan.result.js pins it in a top-level fixYear(pk) used for the meta line.
import test from "node:test";
import assert from "node:assert/strict";
import { runFn, esc, stripTags } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const REL = "src/app/js/plan.result.js";
const fixYear = (pk) => runFn(REL, "fixYear", {}, [pk]);

test("fixYear pins In the Mood for Love to 2000", () => {
  assert.equal(fixYear({ name: "In the Mood for Love", year: 1990 }), 2000);
  assert.equal(fixYear({ title: "in the mood for love", year: 1990 }), 2000);
  assert.equal(fixYear({ name: "IN THE MOOD FOR LOVE" }), 2000);
  assert.equal(fixYear({ name: "花样年华", year: 1990 }), 2000);
});

test("fixYear leaves every other pick's year unchanged", () => {
  assert.equal(fixYear({ name: "Her", year: 2013 }), 2013);
  assert.equal(fixYear({ name: "In the Mood for Love", year: 2000 }), 2000);
  assert.equal(fixYear({ title: "Dune: Part Two" }), undefined);
  assert.equal(fixYear({ name: "花样年华 4K", year: 1995 }), 1995);
});

test("the stay-in pick meta line shows 2000, not 1990", () => {
  const pk = { name: "In the Mood for Love", year: 1990, by: "Wong Kar-wai", kind: "film", sources: [] };
  const scope = { LANG: "en", t: (s) => s, esc, attr: esc };
  const out = stripTags(runFn(REL, "pickHTML", scope, [pk, 0]));
  assert.match(out, /2000 · Wong Kar-wai/);
  assert.doesNotMatch(out, /1990/);
});
