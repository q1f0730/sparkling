// Shot 3 (footprints accumulate): after a new mention the new note says "Film · mentioned 4×" but the older note
// of the same card still said "mentioned 3×". syncMentionCounts(list, fresh) raises the same card's count on the
// other notes of the feed and returns the ids it touched; pollNote repaints those notes without the draw/plus
// animation.
import test from "node:test";
import assert from "node:assert/strict";
import { read, fnSource, runFn } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const REL = "src/app/js/notes.feed.js";
const mk = (id, cid, n, extra) =>
  Object.assign(
    { id, status: "done", mentions: [{ card: { id: cid, name: "In the Mood for Love", type: "film", n }, plus_one: true }] },
    extra || {}
  );

test("older note of the same card picks up the new count", () => {
  const older = mk("n1", "C1", 3);
  const other = mk("n2", "C2", 2);
  const fresh = mk("n3", "C1", 4);
  const list = [fresh, older, other];
  const changed = runFn(REL, "syncMentionCounts", {}, [list, fresh]);
  assert.equal(older.mentions[0].card.n, 4);
  assert.equal(other.mentions[0].card.n, 2);
  assert.deepEqual([...changed].map(String), ["n1"]);
});

test("never lowers a count and does nothing when already in sync", () => {
  const stale = mk("n4", "C1", 9);
  const fresh = mk("n5", "C1", 4);
  const changed = runFn(REL, "syncMentionCounts", {}, [[stale], fresh]);
  assert.equal(stale.mentions[0].card.n, 9);
  assert.deepEqual(changed, []);

  const again = runFn(REL, "syncMentionCounts", {}, [[mk("n6", "C1", 4)], fresh]);
  assert.deepEqual(again, []);
});

test("the fresh note itself is skipped even when it sits in the list", () => {
  const fresh = mk("n7", "C1", 4);
  const list = [fresh];
  const before = fresh.mentions[0].card.n;
  const changed = runFn(REL, "syncMentionCounts", {}, [list, fresh]);
  assert.equal(fresh.mentions[0].card.n, before);
  assert.deepEqual(changed, []);
});

test("several mentions in one note are each raised, ids listed once", () => {
  const note = {
    id: "n8",
    status: "done",
    mentions: [
      { card: { id: "C1", name: "A", type: "film", n: 1 }, plus_one: true },
      { card: { id: "C2", name: "B", type: "book", n: 1 }, plus_one: true },
    ],
  };
  const fresh = {
    id: "n9",
    status: "done",
    mentions: [
      { card: { id: "C1", name: "A", type: "film", n: 5 }, plus_one: true },
      { card: { id: "C2", name: "B", type: "book", n: 2 }, plus_one: true },
    ],
  };
  const changed = runFn(REL, "syncMentionCounts", {}, [[note, fresh], fresh]);
  assert.equal(note.mentions[0].card.n, 5);
  assert.equal(note.mentions[1].card.n, 2);
  assert.deepEqual(changed, ["n8"]);
});

test("card_id on the older mention matches too, and junk input is safe", () => {
  const note = { id: "n10", status: "done", mentions: [{ card: { name: "A", type: "film", n: 1 }, card_id: "C1" }] };
  const fresh = mk("n11", "C1", 6);
  const changed = runFn(REL, "syncMentionCounts", {}, [[note], fresh]);
  assert.equal(note.mentions[0].card.n, 6);
  assert.deepEqual(changed, ["n10"]);

  assert.deepEqual(runFn(REL, "syncMentionCounts", {}, [null, fresh]), []);
  assert.deepEqual(runFn(REL, "syncMentionCounts", {}, [[], fresh]), []);
  assert.deepEqual(runFn(REL, "syncMentionCounts", {}, [[note], null]), []);
  // mentions without a numeric card.n are not propagated
  const noN = { id: "n12", status: "done", mentions: [{ card: { id: "C1", name: "A", type: "film" } }] };
  assert.deepEqual(runFn(REL, "syncMentionCounts", {}, [[note], noN]), []);
});

test("pollNote syncs and repaints the changed notes quietly", () => {
  const poll = fnSource(read(REL), "pollNote");
  assert.ok(poll, "pollNote found");
  assert.match(poll, /syncMentionCounts\s*\(\s*notes\s*,\s*fresh\s*\)/);
  assert.match(poll, /replaceNoteInDom\s*\(\s*nid\s*,\s*older\s*,\s*\{\s*\}\s*\)/);
});
