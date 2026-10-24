// Plan reads must stay grounded in the facts Qloo returned for a stop.
// A model sentence survives only when its descriptive words trace to kind/name/description/vibes;
// otherwise the plain (or note) template stands in, and that template never shows generic amenity tags.
import { test } from "node:test";
import assert from "node:assert/strict";
import { groundedRead } from "../src/plan.js";

const stop = (over = {}) => ({
  kind: "Bookstore",
  name: "Quimby's Bookstore NYC",
  description: "A cramped, cluttered shop full of zines and rare comics.",
  vibes: ["Cozy", "Literary"],
  ...over,
});

test("empty or missing sentence falls back to the note template when a note is given", () => {
  const s = stop();
  const want = "Bookstore, tagged cozy and literary, a fit for your note on Greenpoint.";
  assert.equal(groundedRead("", s, "Greenpoint"), want);
  assert.equal(groundedRead(undefined, s, "Greenpoint"), want);
});

test("empty or missing sentence falls back to the plain template without a note", () => {
  const s = stop();
  const want = "A bookstore with a cozy, literary feel.";
  assert.equal(groundedRead("", s), want);
  assert.equal(groundedRead(undefined, s, null), want);
  assert.ok(want.endsWith("feel."));
});

test("the plain template never shows generic amenity vibes, even when Qloo returns them", () => {
  const s = stop({ vibes: ["Dining drinking", "Dogs allowed inside"] });
  const out = groundedRead("", s);
  assert.equal(out, "A bookstore Qloo ranks close to your taste.");
  assert.ok(!/dining|dogs?|allowed|inside/i.test(out), out);
});

test("the note template also drops generic amenity vibes", () => {
  const s = stop({ vibes: ["Cozy", "Dining drinking", "Dogs allowed inside"] });
  assert.equal(groundedRead("", s, "Quiet Sundays"), "Bookstore, tagged cozy, a fit for your note on Quiet Sundays.");
});

test("a sentence whose descriptive words all trace to the stop's facts is returned unchanged", () => {
  const s = stop();
  const sentence = "You will enjoy this cramped, cluttered shop full of zines and rare comics.";
  assert.equal(groundedRead(sentence, s), sentence);
});

test("a sentence that invents more than one atmosphere word is replaced by the template", () => {
  const s = stop({ kind: "Bar", name: "Attaboy", description: "", vibes: ["Cozy"] });
  const invented = "This candlelit velvet speakeasy suits your mood.";
  assert.equal(groundedRead(invented, s), "A bar with a cozy feel.");
  assert.equal(
    groundedRead(invented, s, "Quiet nights"),
    "Bar, tagged cozy, a fit for your note on Quiet nights.",
  );
});

test("a Chinese sentence is returned unchanged by the English word check", () => {
  const sentence = "你会喜欢这家安静的书店。";
  assert.equal(groundedRead(sentence, stop()), sentence);
});
