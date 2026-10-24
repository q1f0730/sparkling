// R-c3 + R-c7: mentioning the same thing again appends an encounter and never overwrites or empties the card.
import assert from "node:assert/strict";
import { upsertCard, addFootprint } from "../src/recognize.js";

function fakeEnv() {
  const cards = [], fps = [], updates = [];
  const stmt = (sql, a = []) => ({
    bind: (...x) => stmt(sql, x),
    first: async () => {
      if (/FROM cards WHERE user_id=\? AND qloo_id=\?/.test(sql)) return cards.find((c) => c.user_id === a[0] && c.qloo_id === a[1]) || null;
      if (/FROM footprints WHERE card_id=\? AND note_id=\?/.test(sql)) return fps.find((f) => f.card_id === a[0] && f.note_id === a[1]) || null;
      throw new Error("unhandled first: " + sql);
    },
    run: async () => {
      if (/^INSERT OR IGNORE INTO cards/.test(sql)) {
        if (!cards.find((c) => c.user_id === a[1] && c.qloo_id === a[2])) cards.push({ id: a[0], user_id: a[1], qloo_id: a[2], name: a[3], image: a[7], tags: a[8] });
      } else if (/^INSERT INTO footprints/.test(sql)) fps.push({ id: a[0], card_id: a[2], note_id: a[3], quote: a[6] });
      else if (/^UPDATE cards/.test(sql)) updates.push(sql);
      else throw new Error("unhandled run: " + sql);
      return { success: true };
    },
  });
  return { env: { DB: { prepare: (s) => stmt(s) } }, cards, fps, updates };
}

const { env, cards, fps, updates } = fakeEnv();
const full = { qloo_id: "Q1", name: "Chungking Express", type: "film", image: "https://x/p.jpg", tags: ["romance"], year: "1994" };
const id1 = await upsertCard(env, "u", full, 1);
// second mention: provider returns nothing (no image, no tags)
const id2 = await upsertCard(env, "u", { qloo_id: "Q1", name: "Chungking Express", type: "film" }, 2);
assert.equal(id1, id2, "same entity = same card");
assert.equal(cards.length, 1);
assert.equal(cards[0].image, "https://x/p.jpg", "image kept");
assert.equal(cards[0].tags, JSON.stringify(["romance"]), "tags kept");
assert.equal(updates.length, 0, "no UPDATE on re-mention");
await addFootprint(env, "u", id1, "n1", { quote: "first" }, 1);
await addFootprint(env, "u", id1, "n2", { quote: "second" }, 2);
await addFootprint(env, "u", id1, "n2", { quote: "retry" }, 3);
assert.equal(fps.length, 2, "two notes = two encounters, retry deduped");
console.log("card-merge ok");
