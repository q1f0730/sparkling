// FP-62: after a live jot the new note carries the card's fresh footprint count ("mentioned 4×") while older
// notes of the same card still say 3×. syncSiblingCounts(note) raises the count on every sibling in `notes`,
// repaints the ones on screen, and Capture's add() adapter calls it right after inserting the note.
import test from "node:test";
import assert from "node:assert/strict";
import { read, fnSource, runFn } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const REL = "src/app/js/notes.feed.js";
const mk = (id, cid, n) => ({ id, status: "done", mentions: [{ card: { id: cid, name: "In the Mood for Love", type: "film", n }, plus_one: true }] });

function harness(list) {
  const painted = [];
  const scope = {
    notes: list,
    replaceNoteInDom: (id) => { painted.push(String(id)); return true; },
  };
  return { painted, call: (note) => runFn(REL, "syncSiblingCounts", scope, [note]) };
}

test("a fresh 4× reaches the older note of the same card and repaints it", () => {
  const fresh = mk("n3", "C1", 4);
  const older = mk("n1", "C1", 3);
  const other = mk("n2", "C2", 2);
  const h = harness([fresh, older, other]);
  const changed = h.call(fresh);
  assert.equal(older.mentions[0].card.n, 4, "older note of the same card now says 4×");
  assert.equal(other.mentions[0].card.n, 2, "other cards untouched");
  assert.deepEqual([...(changed || [])].map(String), ["n1"]);
  assert.deepEqual(h.painted, ["n1"], "the changed sibling is repainted in the DOM");
});

test("never lowers a count and does nothing when already in sync", () => {
  const stale = mk("n4", "C1", 9);
  const h = harness([mk("n5", "C1", 4), stale]);
  assert.deepEqual([...(h.call(mk("n5", "C1", 4)) || [])], []);
  assert.equal(stale.mentions[0].card.n, 9);
  assert.deepEqual(h.painted, []);

  const inSync = mk("n6", "C1", 4);
  const h2 = harness([mk("n7", "C1", 4), inSync]);
  assert.deepEqual([...(h2.call(mk("n7", "C1", 4)) || [])], []);
  assert.deepEqual(h2.painted, []);
});

test("a pending temp note with no mentions is a quiet no-op", () => {
  const temp = { id: "tmp-1", status: "pending", mentions: [], card_count: 0 };
  const older = mk("n1", "C1", 3);
  const h = harness([temp, older]);
  assert.deepEqual([...(h.call(temp) || [])], []);
  assert.equal(older.mentions[0].card.n, 3);
  assert.deepEqual(h.painted, []);
  assert.deepEqual([...(h.call(null) || [])], []);
  assert.deepEqual([...(h.call(undefined) || [])], []);
  assert.deepEqual(h.painted, []);
});

test("an older mention with card_id only still matches", () => {
  const older = { id: "n8", status: "done", mentions: [{ card: { name: "A", type: "film", n: 1 }, card_id: "C1" }] };
  const fresh = mk("n9", "C1", 6);
  const h = harness([fresh, older]);
  h.call(fresh);
  assert.equal(older.mentions[0].card.n, 6);
  assert.deepEqual(h.painted, ["n8"]);
});

test("the Capture add() adapter calls syncSiblingCounts before painting", () => {
  const src = read(REL);
  assert.ok(fnSource(src, "syncSiblingCounts"), "syncSiblingCounts is defined in notes.feed.js");
  const helper = fnSource(src, "syncSiblingCounts");
  assert.match(helper, /syncMentionCounts\s*\(\s*notes\s*,/, "reuses syncMentionCounts on the live feed");
  assert.match(helper, /replaceNoteInDom\s*\(/, "repaints the changed notes");
  const i = src.indexOf("add: function(note){");
  assert.ok(i > 0, "Capture add adapter found");
  const seg = src.slice(i, i + 1400);
  assert.match(seg, /syncSiblingCounts\s*\(/, "add() calls syncSiblingCounts");
  assert.ok(seg.indexOf("syncSiblingCounts(") < seg.indexOf("Capture.flip("), "sync runs before the repaint");
});
