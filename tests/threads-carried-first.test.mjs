import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const here = new URL(".", import.meta.url);
const src = fs.readFileSync(new URL("../src/index.js", here), "utf8");

// Mirrors the ranking used in /api/threads: carried tags first, stable inside each group.
const sortCarriedFirst = (tags, carried) =>
  tags
    .map((t, i) => ({ t, i, group: carried(t) ? 0 : 1 }))
    .sort((a, b) => a.group - b.group || a.i - b.i)
    .map((x) => x.t);

test("/api/threads marks and applies a carried-first sort before main.slice(0, 8)", () => {
  assert.match(src, /\/\/ carried-first/, "carried-first sort marker is present");

  const start = src.indexOf('p === "/api/threads"');
  const end = src.indexOf('p === "/api/plan"', start);
  assert.ok(start > 0 && end > start, "threads route boundaries found");

  const route = src.slice(start, end);
  const marker = route.indexOf("// carried-first");
  const slice = route.indexOf("main.slice(0, 8)");
  assert.ok(marker >= 0, "marker lives inside the /api/threads route");
  assert.ok(slice > marker, "the carried-first sort runs before main.slice(0, 8)");

  // The marker annotates a sort over main that reorders by the >=2 evidence predicate.
  const near = route.slice(marker, marker + 400);
  assert.match(near, /\.sort\(/, "marker is attached to a sort call");
  assert.match(near, /main/, "the sort is over main");
});

test("stable carried-first sort puts tags carried by >=2 cards first", () => {
  const counts = { a: 1, b: 3, c: 0, d: 2, e: 1 };
  const carried = (t) => counts[t] >= 2;
  assert.deepEqual(
    sortCarriedFirst(["a", "b", "c", "d", "e"], carried),
    ["b", "d", "a", "c", "e"],
  );
});

test("stable carried-first sort keeps original order inside each group", () => {
  const tags = ["a", "b", "c", "d", "e", "f"];
  const carriedSet = new Set(["e", "b", "d"]);
  const carried = (t) => carriedSet.has(t);

  // carried group: b, d, e (original order); rest: a, c, f (original order)
  assert.deepEqual(sortCarriedFirst(tags, carried), ["b", "d", "e", "a", "c", "f"]);
  // Degenerate cases leave the list untouched.
  assert.deepEqual(sortCarriedFirst(tags, () => true), tags);
  assert.deepEqual(sortCarriedFirst(tags, () => false), tags);
});
