// Main line: repeating the same entity from different notes must reuse ONE card and add one footprint
// per note. Case and punctuation variants ("In the Mood for Love", "in the mood for love!!!",
// "IN THE MOOD FOR LOVE") all normalise to the same Qloo entity, so they dedupe too.
// Offline only: the adversarial harness supplies SQLite behind a D1 API, a Workers AI mock and an
// in-memory Qloo catalogue; the global fetch stub fails on any real host.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, makeQloo, setQloo, call } from "./adversarial/harness.mjs";
// dynamic: src/index.js imports src/app.html, so the html hook must be registered first.
const { default: worker } = await import("../src/index.js");
const { norm } = await import("../src/recognize.js");

const DAY = 86400000;
const QLOO_ID = "E-ITML"; // harness CATALOG -> "In the Mood for Love", urn:entity:movie
// Three raw spellings of the same film: same name up to case/punctuation. norm() collapses them.
const SURFACES = ["In the Mood for Love", "in the mood for love!!!", "IN THE MOOD FOR LOVE"];
const TEXTS = [
  "In the Mood for Love, again — the corridor scene undid me.",
  "in the mood for love!!! still the best thing I watched this year",
  "IN THE MOOD FOR LOVE is on my mind weeks later.",
];
const AGO = [6, 3, 1]; // days before the fixed clock, newest notes last
const U = "U-repeat-mention";

// Fresh offline env with one seeded session user (token t<U>), like tests/stayin.test.mjs.
function seed() {
  const env = makeEnv();
  setQloo(makeQloo(), env);
  env.DB._db.prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)")
    .run(U, "t" + U, "Greenpoint, Brooklyn", 40, "Saturday afternoon", 1_700_000_000_000);
  // The model mock only matches catalogue names case-sensitively; pin the three variant surfaces so
  // the test proves dedupe in recognition, not in the extraction stub.
  env.AI.extract = (text) => {
    const surface = SURFACES.find((s) => text.includes(s));
    assert.ok(surface, "every note names the film in one of the pinned spellings: " + text);
    return { mentions: [{ surface, title: "In the Mood for Love", type: "film", kind: "note", sentiment: "positive", music_work: "none" }] };
  };
  return { env, cookie: "t" + U };
}

// Save one note through the real POST /api/notes route with a frozen clock, so each note (and its
// footprint) gets a deterministic day. The harness drains ctx.waitUntil, so recognition is finished
// when call() resolves.
async function postNote(env, cookie, i) {
  const at = 1_760_000_000_000 - AGO[i] * DAY;
  const realNow = Date.now;
  try {
    Date.now = () => at;
    const r = await call(worker, env, "POST", "/api/notes", { body: { text: TEXTS[i] }, cookie });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.note.status, "pending", "the note is saved before recognition runs");
  } finally {
    Date.now = realNow;
  }
  return at;
}

test("three notes with case/punctuation variants: one card, one footprint added per note", async () => {
  const { env, cookie } = seed();

  // Incremental: each re-mention adds a footprint and never a second card.
  for (let i = 0; i < TEXTS.length; i++) {
    await postNote(env, cookie, i);
    const cards = env.DB.q("SELECT * FROM cards WHERE user_id=?", U);
    assert.equal(cards.length, 1, `note ${i + 1}: the repeated entity still has exactly one card`);
    assert.equal(cards[0].qloo_id, QLOO_ID, "the card is the canonical Qloo entity");
    const fps = env.DB.q("SELECT * FROM footprints WHERE card_id=? AND user_id=?", cards[0].id, U);
    assert.equal(fps.length, i + 1, `note ${i + 1}: footprint count grew by exactly one`);
  }

  const card = env.DB.q("SELECT * FROM cards WHERE user_id=?", U)[0];
  const fps = env.DB.q("SELECT note_id, quote, created_at FROM footprints WHERE card_id=? ORDER BY created_at", card.id);
  assert.equal(new Set(fps.map((f) => f.note_id)).size, 3, "one footprint per note, three distinct notes");
  assert.deepEqual(fps.map((f) => f.quote), TEXTS, "every footprint keeps its own note's words");
});

test("the variants really are different strings that normalise to the same key", async () => {
  assert.equal(new Set(SURFACES).size, 3, "the three surfaces are not the same raw string");
  assert.equal(new Set(SURFACES.map(norm)).size, 1, "norm() collapses case and punctuation");
  assert.equal(norm(SURFACES[0]), "in the mood for love");

  const { env, cookie } = seed();
  for (let i = 0; i < TEXTS.length; i++) await postNote(env, cookie, i);

  const notes = env.DB.q("SELECT text, mentions FROM notes WHERE user_id=? ORDER BY created_at", U);
  assert.equal(notes.length, 3);
  const mentions = notes.map((n) => JSON.parse(n.mentions));
  assert.deepEqual(mentions.map((ms) => ms.length), [1, 1, 1], "each note resolves exactly one mention");
  assert.deepEqual(mentions.map((ms) => ms[0].surface), SURFACES, "each variant is kept as written");
  assert.ok(mentions.every((ms) => ms[0].state === "matched"), "all three variants matched, none fell to the inbox");
  const cardIds = new Set(mentions.map((ms) => ms[0].card_id));
  assert.equal(cardIds.size, 1, "all variants point at the same card id");
  assert.ok([...cardIds][0], "the matched mentions carry a card id");
});

test("GET /api/cards and the card timeline show one card with three footprints", async () => {
  const { env, cookie } = seed();
  const stamps = [];
  for (let i = 0; i < TEXTS.length; i++) stamps.push(await postNote(env, cookie, i));

  const list = await call(worker, env, "GET", "/api/cards", { cookie });
  assert.equal(list.status, 200, list.text);
  assert.equal(list.json.cards.length, 1, "the index shows one card despite three mentions");
  const card = list.json.cards[0];
  assert.equal(card.qloo_id, QLOO_ID);
  assert.equal(card.name, "In the Mood for Love");
  assert.equal(card.footprints, 3, "the card counts one encounter per note");
  assert.equal(card.first_at, stamps[0], "first_at is the oldest note's day");
  assert.equal(card.last_at, stamps[2], "last_at is the newest note's day");

  const detail = await call(worker, env, "GET", `/api/cards/${card.id}`, { cookie });
  assert.equal(detail.status, 200, detail.text);
  const fps = detail.json.footprints;
  assert.equal(fps.length, 3, "the timeline has exactly one point per note");
  assert.deepEqual(fps.map((f) => f.created_at), [stamps[2], stamps[1], stamps[0]], "rendered newest first");
  assert.deepEqual(fps.map((f) => f.quote), [TEXTS[2], TEXTS[1], TEXTS[0]], "each point quotes its own note");
  assert.ok(fps.every((f) => f.note_id), "every point links back to its note");
  assert.ok(fps.every((f) => f.source === "note"), "all encounters come from written notes");
});
