// Tests for normalizeMentionCounts in src/app/js/notes.feed.js (card feed-count-normalize).
import test from "node:test";
import assert from "node:assert/strict";
import { read, fnSource, runFn } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const REL = "src/app/js/notes.feed.js";
const norm = (list) => runFn(REL, "normalizeMentionCounts", {}, [list]);
const mk = (id, cid, n) => ({ id, status: "done", mentions: [{ card: { id: cid, name: "X", type: "film", n }, plus_one: true }] });

test("raises every note of the same card to the largest n seen", () => {
  const a = mk("n1", "C1", 4), b = mk("n2", "C1", 3), c = mk("n3", "C2", 2), d = mk("n4", "C1", 1);
  const changed = norm([a, b, c, d]);
  assert.equal(a.mentions[0].card.n, 4);
  assert.equal(b.mentions[0].card.n, 4);
  assert.equal(d.mentions[0].card.n, 4);
  assert.equal(c.mentions[0].card.n, 2, "other cards untouched");
  assert.deepEqual([...(changed || [])].map(String).sort(), ["n2", "n4"]);
});

test("never lowers a count and leaves a lone mention alone", () => {
  const solo = mk("s1", "C9", 7);
  const older = mk("s2", "C9", 9);
  const changed = norm([solo, older]);
  assert.equal(solo.mentions[0].card.n, 9);
  assert.equal(older.mentions[0].card.n, 9);
  assert.deepEqual([...(changed || [])], ["s1"]);

  const lone = mk("only", "C8", 2);
  assert.deepEqual([...(norm([lone]) || [])], []);
  assert.equal(lone.mentions[0].card.n, 2);
});

test("falls back to card_id and fills a missing/non-numeric n", () => {
  const a = { id: "a1", mentions: [{ card: { id: "K", n: 3 } }] };
  const b = { id: "b1", mentions: [{ card: { n: 1 }, card_id: "K" }, { card: { id: "K", n: "nope" } }] };
  const changed = norm([a, b]);
  assert.equal(a.mentions[0].card.n, 3);
  assert.equal(b.mentions[0].card.n, 3);
  assert.equal(b.mentions[1].card.n, 3);
  assert.deepEqual([...(changed || [])].map(String).sort(), ["b1"]);
});

test("null / malformed input returns []", () => {
  assert.deepEqual([...(norm(null) || [])], []);
  assert.deepEqual([...(norm(undefined) || [])], []);
  assert.deepEqual([...(norm("nope") || [])], []);
  assert.deepEqual([...(norm({}) || [])], []);
  const changed = norm([mk("a", "C", 2), { id: "z", mentions: null }, null, { id: "y" }, 7, { mentions: [{ card: null }] }]);
  assert.deepEqual([...(changed || [])], []);
});

test("loadInitial and loadNotes call normalizeMentionCounts", () => {
  const src = read(REL);
  const boot = fnSource(src, "loadInitial") || "";
  const notes = fnSource(src, "loadNotes") || "";
  assert.ok(/normalizeMentionCounts\s*\(/.test(boot), "loadInitial calls normalizeMentionCounts");
  assert.ok(/normalizeMentionCounts\s*\(/.test(notes), "loadNotes calls normalizeMentionCounts");
});
