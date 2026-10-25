// Demo main line, shot 3: a card's footprint timeline. Three notes that name the same film on
// different days must collapse into ONE card carrying three footprints, one per note, each stamped
// with its note's own day. Offline only: the adversarial harness supplies SQLite behind a D1 API,
// a Workers AI mock and an in-memory Qloo catalogue; every other host fails the global fetch stub.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, makeQloo, setQloo, call } from "./adversarial/harness.mjs";
// dynamic: src/index.js imports src/app.html, so the html hook must be registered first.
const { default: worker } = await import("../src/index.js");

const DAY = 86400000;
const FILM = "In the Mood for Love"; // harness CATALOG -> qloo_id E-ITML, urn:entity:movie
const TEXT = [
  "Finally watched In the Mood for Love; the corridor scene undid me.",
  "Rewatched In the Mood for Love again on a rainy night.",
  "Still thinking about In the Mood for Love weeks later.",
];
const AGO = [6, 3, 1]; // days before the fixed clock, so they are three different days
const U = "U-footprints";

// Fresh offline env with one seeded session user (token t<U>), like tests/stayin.test.mjs.
function seed() {
  const env = makeEnv();
  setQloo(makeQloo(), env);
  env.DB._db.prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)")
    .run(U, "t" + U, "Greenpoint, Brooklyn", 40, "Saturday afternoon", 1_700_000_000_000);
  return { env, cookie: "t" + U };
}

// Save the three notes through the real POST /api/notes route. It stamps each note with Date.now()
// and recognition copies note.created_at onto the footprint, so a frozen clock puts each note (and
// its footprint) on its own day. Returns the three timestamps, oldest first.
async function postThreeNotes(env, cookie) {
  const clock0 = 1_760_000_000_000;
  const stamps = [];
  const realNow = Date.now;
  try {
    for (let i = 0; i < TEXT.length; i++) {
      const at = clock0 - AGO[i] * DAY;
      Date.now = () => at;
      const r = await call(worker, env, "POST", "/api/notes", { body: { text: TEXT[i] }, cookie });
      assert.equal(r.status, 200, r.text);
      stamps.push(at);
    }
  } finally {
    Date.now = realNow;
  }
  return stamps;
}

test("POST /api/notes: three notes on three days all resolve to one stored card and three footprints", async () => {
  const { env, cookie } = seed();
  const stamps = await postThreeNotes(env, cookie);

  const saved = env.DB.q("SELECT id, text, status, created_at FROM notes WHERE user_id=? ORDER BY created_at", U);
  assert.equal(saved.length, 3);
  assert.deepEqual(saved.map((n) => n.created_at), stamps, "each note keeps its own day, oldest first");
  assert.ok(saved.every((n) => n.status === "done"), "recognition finished for every note");

  const cards = env.DB.q("SELECT * FROM cards WHERE user_id=?", U);
  assert.equal(cards.length, 1, "three mentions of one film must not make three cards");
  assert.equal(cards[0].qloo_id, "E-ITML");
  assert.equal(cards[0].name, FILM);

  const fps = env.DB.q("SELECT * FROM footprints WHERE card_id=? ORDER BY created_at", cards[0].id);
  assert.deepEqual(fps.map((f) => f.created_at), stamps, "one footprint per note, on the note's day");
  assert.equal(new Set(fps.map((f) => f.note_id)).size, 3, "each footprint belongs to a distinct note");
});

test("GET /api/cards: exactly one card for the film, with 3 footprints and first/last dates", async () => {
  const { env, cookie } = seed();
  const stamps = await postThreeNotes(env, cookie);

  const list = await call(worker, env, "GET", "/api/cards", { cookie });
  assert.equal(list.status, 200, list.text);
  assert.equal(list.json.cards.length, 1, "the index shows one card for the re-mentioned film");
  const card = list.json.cards[0];
  assert.equal(card.qloo_id, "E-ITML");
  assert.equal(card.name, FILM);
  assert.equal(card.type, "film");
  assert.equal(card.footprints, 3, "the card counts one footprint per note");
  assert.equal(card.first_at, stamps[0], "first_at is the oldest note's day");
  assert.equal(card.last_at, stamps[2], "last_at is the newest note's day");
});

test("GET /api/cards/:id: the timeline holds the 3 footprints newest first, each quoting its note", async () => {
  const { env, cookie } = seed();
  const stamps = await postThreeNotes(env, cookie);

  const list = await call(worker, env, "GET", "/api/cards", { cookie });
  const card = list.json.cards[0];
  const detail = await call(worker, env, "GET", `/api/cards/${card.id}`, { cookie });
  assert.equal(detail.status, 200, detail.text);
  assert.equal(detail.json.card.id, card.id);

  const fps = detail.json.footprints;
  assert.equal(fps.length, 3, "the timeline has exactly one point per note");
  assert.deepEqual(fps.map((f) => f.created_at), [stamps[2], stamps[1], stamps[0]], "rendered newest first");
  assert.deepEqual([...fps].reverse().map((f) => f.created_at), stamps, "reverse = chronological, oldest first");
  assert.deepEqual(fps.map((f) => f.quote), [TEXT[2], TEXT[1], TEXT[0]], "every point carries its note's words");
  assert.ok(fps.every((f) => f.source === "note"), "all three points come from written notes");
  assert.ok(fps.every((f) => f.note_id), "every point links back to its note");
});
