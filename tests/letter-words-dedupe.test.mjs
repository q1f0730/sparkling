// FP-78: the letter's "your words" list is built from footprints joined to notes.
// When one note mentions two cards it produces two footprint rows with the same note
// text, so the old query listed the same note twice under two different cards.
// One entry per note text: dedupe, and merge the card names ("A, B").
// Offline: the shared SQLite/Qloo/AI harness, rows seeded by hand like tests/letter.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, call } from "./adversarial/harness.mjs";
const { default: worker } = await import("../src/index.js");

const AT = Date.UTC(2026, 8, 12); // every footprint lands inside September 2026
const LONG = "I keep coming back to this scene: the corridor, the rain, the way nobody says what they mean. ";

function seedUser(db, U) {
  db.prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)")
    .run(U, "t" + U, "Greenpoint, Brooklyn", 40, "Saturday afternoon", Date.now());
}

function seedCard(db, U, id, name, type) {
  db.prepare("INSERT INTO cards (id,user_id,qloo_id,name,type,heart,created_at) VALUES (?,?,?,?,?,0,?)")
    .run(id, U, "Q-" + id, name, type, AT);
}

function seedNote(db, U, id, text, minutes) {
  db.prepare("INSERT INTO notes (id,user_id,text,kind,status,mentions,created_at) VALUES (?,?,?,?,?,?,?)")
    .run(id, U, text, "text", "done", "[]", AT + (minutes || 0) * 60000);
}

function seedFp(db, U, id, cardId, noteId, sentiment, minutes) {
  db.prepare("INSERT INTO footprints (id,user_id,card_id,note_id,kind,sentiment,created_at) VALUES (?,?,?,?,?,?,?)")
    .run(id, U, cardId, noteId, "note", sentiment || "positive", AT + (minutes || 0) * 60000);
}

// Three cards so the letter exists; one long note mentions two of them.
// Notes are seeded longest-first in the text-length ordering the letter uses.
async function letterFor(U) {
  const env = makeEnv();
  const db = env.DB._db;
  seedUser(db, U);
  seedCard(db, U, "C-F", "In the Mood for Love", "film");
  seedCard(db, U, "C-W", "Wong Kar-wai", "person");
  seedCard(db, U, "C-P", "Riverside Park", "place");
  const shared = LONG + LONG + "In the Mood for Love, again and again.";
  seedNote(db, U, "N-S", shared, 1);
  seedNote(db, U, "N-M", "A walk along the river at dusk, cold air and the last of the light.", 2);
  seedNote(db, U, "N-T", "Short note.", 3);
  // The same note is a footprint of both cards — the duplicate row the bug listed twice.
  seedFp(db, U, "F1", "C-F", "N-S", "positive", 1);
  seedFp(db, U, "F2", "C-W", "N-S", "positive", 1);
  seedFp(db, U, "F3", "C-P", "N-M", "positive", 2);
  seedFp(db, U, "F4", "C-F", "N-T", "positive", 3);
  const r = await call(worker, env, "GET", "/api/letter", { cookie: "t" + U });
  assert.equal(r.status, 200, r.text);
  assert.ok(r.json.letter, "three cards should be enough for a letter: " + r.json.reason);
  return r.json.letter;
}

test("your_words lists a note once even when two cards share it", async () => {
  const letter = await letterFor("UW1");
  const words = letter.your_words;
  const texts = words.map((w) => w.text);
  assert.equal(new Set(texts).size, texts.length, "same note text appears twice: " + JSON.stringify(texts));
  const shared = words.filter((w) => w.text === LONG + LONG + "In the Mood for Love, again and again.");
  assert.equal(shared.length, 1, "the shared note should have exactly one entry");
});

test("your_words merges the card names of a shared note", async () => {
  const letter = await letterFor("UW2");
  const shared = letter.your_words.find((w) => w.text.startsWith(LONG));
  assert.ok(shared, "the long shared note should lead the list: " + JSON.stringify(letter.your_words));
  const names = shared.card.split(", ");
  assert.equal(names.length, 2, "card should hold both names: " + shared.card);
  assert.ok(names.includes("In the Mood for Love") && names.includes("Wong Kar-wai"), "card names merged: " + shared.card);
  assert.ok(shared.card_id, "the first card id is kept");
});

test("your_words still fills three distinct notes behind a duplicate", async () => {
  const letter = await letterFor("UW3");
  assert.equal(letter.your_words.length, 3, "dedupe must not shorten the list: " + JSON.stringify(letter.your_words));
  assert.ok(letter.your_words.some((w) => w.text === "Short note."), "the third distinct note is included");
  assert.ok(letter.your_words.every((w) => w.text !== ""), "no blank entries");
});
