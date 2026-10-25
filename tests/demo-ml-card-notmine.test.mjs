// Main line: "Not this?" on a card. Picking another candidate for the card re-links it (the note
// chip, the heart and every footprint move to the replacement, the rejected card goes) and rewrites
// the rejected surface mapping, so a later note with the same words follows the replacement instead
// of resurrecting the pick the user just rejected.
// Offline only: the adversarial harness runs the real Worker over SQLite (D1-shaped), a Workers AI
// mock and an in-memory Qloo catalogue; the global fetch stub fails on any real host.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, makeQloo, setQloo, call } from "./adversarial/harness.mjs";
// dynamic: src/index.js imports src/app.html, so the html hook must be registered first.
const { default: worker } = await import("../src/index.js");

const U = "U-card-notmine";
const TOKEN = "t" + U; // session cookie, like tests/stayin.test.mjs
// The harness catalogue has two films called "Solaris": the 1972 one is more popular, so a bare note
// about it waits in the Inbox and the user picks one. "Not this?" then swaps to the other.
const REJECTED = "E-SOLARIS-72";
const REPLACEMENT = "E-SOLARIS-02";

// Fresh offline env with one seeded session user. The model mock always reports the same one film,
// so the test proves the card/mapping machinery, not the extraction stub.
function world() {
  const env = makeEnv();
  setQloo(makeQloo(), env);
  env.DB._db.prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)")
    .run(U, TOKEN, "Greenpoint, Brooklyn", 40, "Saturday afternoon", 1_760_000_000_000);
  env.AI.extract = () => ({ mentions: [{ surface: "Solaris", title: "Solaris", type: "film", kind: "note", sentiment: "positive", music_work: "none" }] });
  return env;
}

// Save one note through the real POST /api/notes route; the harness drains ctx.waitUntil, so
// recognition (and any Inbox question) has finished when call() resolves.
async function postNote(env, text) {
  const r = await call(worker, env, "POST", "/api/notes", { body: { text }, cookie: TOKEN });
  assert.equal(r.status, 200, r.text);
  return r.json.note;
}

async function openInbox(env) {
  const r = await call(worker, env, "GET", "/api/inbox", { cookie: TOKEN });
  assert.equal(r.status, 200, r.text);
  return r.json.items;
}

// First note: the two Solaris films wait in the Inbox; accepting 1972 creates the card and the
// "solaris" name mapping that "Not this?" must rewrite.
async function acceptSolaris72(env) {
  await postNote(env, "Solaris, the long one.");
  const items = await openInbox(env);
  assert.equal(items.length, 1, "the two Solaris films wait in the Inbox");
  assert.deepEqual(items[0].guesses.map((g) => g.qloo_id).sort(), [REJECTED, REPLACEMENT].sort());
  const r = await call(worker, env, "POST", "/api/inbox/" + items[0].id, { body: { action: "accept", qloo_id: REJECTED }, cookie: TOKEN });
  assert.equal(r.status, 200, r.text);
  return r.json.card_id;
}

async function swap(env, cardId, qloo_id) {
  const r = await call(worker, env, "POST", "/api/cards/" + cardId + "/swap", { body: { qloo_id, type: "film" }, cookie: TOKEN });
  assert.equal(r.status, 200, r.text);
  return r.json.card_id;
}

function noteRow(env, noteId) {
  return env.DB.q("SELECT mentions FROM notes WHERE id=?", noteId)[0];
}

test("Not this? re-links the card and the note chip to the picked candidate", async () => {
  const env = world();
  const oldCard = await acceptSolaris72(env);
  assert.equal(env.DB.q("SELECT qloo_id FROM cards WHERE id=?", oldCard)[0].qloo_id, REJECTED);

  const newCard = await swap(env, oldCard, REPLACEMENT);
  assert.notEqual(newCard, oldCard, "the picked candidate gets its own card");

  const cards = env.DB.q("SELECT id,qloo_id,name,year FROM cards WHERE user_id=?", U);
  assert.equal(cards.length, 1, "the rejected card is gone, the replacement remains");
  assert.equal(cards[0].id, newCard);
  assert.equal(cards[0].qloo_id, REPLACEMENT);
  assert.equal(cards[0].name, "Solaris");
  assert.equal(cards[0].year, "2002", "the 2002 film, not the rejected 1972 one");
  assert.equal(env.DB.q("SELECT COUNT(*) n FROM cards WHERE qloo_id=?", REJECTED)[0].n, 0);

  const note = env.DB.q("SELECT mentions FROM notes WHERE user_id=?", U)[0];
  const mention = JSON.parse(note.mentions)[0];
  assert.equal(mention.state, "matched");
  assert.equal(mention.card_id, newCard, "the note chip points at the replacement");
  assert.equal(mention.card.name, "Solaris");

  const detail = await call(worker, env, "GET", "/api/cards/" + newCard, { cookie: TOKEN });
  assert.equal(detail.status, 200, detail.text);
  assert.equal(detail.json.card.qloo_id, REPLACEMENT);

  // The rejected card is gone, so its id no longer resolves.
  const gone = await call(worker, env, "POST", "/api/cards/" + oldCard + "/swap", { body: { qloo_id: REPLACEMENT }, cookie: TOKEN });
  assert.equal(gone.status, 404, "the old card id no longer resolves");
});

test("swapping keeps every footprint and carries the love over", async () => {
  const env = world();
  const oldCard = await acceptSolaris72(env);
  const second = await postNote(env, "Solaris again, on a rainy night.");
  assert.equal(JSON.parse(noteRow(env, second.id).mentions)[0].card_id, oldCard, "second note joined the same card");

  const before = env.DB.q("SELECT id,note_id,card_id FROM footprints WHERE user_id=? ORDER BY id", U);
  assert.equal(before.length, 2, "two notes, two encounters on the rejected card");
  assert.ok(before.every((f) => f.card_id === oldCard));

  const h = await call(worker, env, "PATCH", "/api/cards/" + oldCard, { body: { heart: 1 }, cookie: TOKEN });
  assert.equal(h.status, 200, h.text);

  const newCard = await swap(env, oldCard, REPLACEMENT);

  const after = env.DB.q("SELECT id,note_id,card_id FROM footprints WHERE user_id=? ORDER BY id", U);
  assert.equal(after.length, 2, "no footprint is lost or duplicated");
  assert.deepEqual(after.map((f) => f.id), before.map((f) => f.id), "same footprint rows");
  assert.deepEqual(after.map((f) => f.note_id), before.map((f) => f.note_id), "still tied to the same notes");
  assert.ok(after.every((f) => f.card_id === newCard), "all encounters now sit on the replacement");
  assert.equal(env.DB.q("SELECT heart FROM cards WHERE id=?", newCard)[0].heart, 1, "love carries to the replacement");

  for (const n of env.DB.q("SELECT mentions FROM notes WHERE user_id=?", U)) {
    assert.equal(JSON.parse(n.mentions)[0].card_id, newCard, "every note chip moved");
  }
  const detail = await call(worker, env, "GET", "/api/cards/" + newCard, { cookie: TOKEN });
  assert.equal(detail.json.footprints.length, 2, "the detail view shows both encounters");
});

test("a later note with the same words follows the rewritten mapping, not the rejected pick", async () => {
  const env = world();
  const oldCard = await acceptSolaris72(env);
  const newCard = await swap(env, oldCard, REPLACEMENT);

  const mapped = env.DB.q("SELECT qloo_id FROM mappings WHERE user_id=? AND surface='solaris'", U);
  assert.deepEqual(mapped.map((m) => m.qloo_id), [REPLACEMENT], "the rejected surface now maps to the replacement");

  const later = await postNote(env, "Solaris once more.");
  const cards = env.DB.q("SELECT id,qloo_id FROM cards WHERE user_id=?", U);
  assert.equal(cards.length, 1, "no second card and no resurrection of the rejected pick");
  assert.equal(cards[0].id, newCard);
  assert.equal(cards[0].qloo_id, REPLACEMENT);
  assert.equal(env.DB.q("SELECT COUNT(*) n FROM cards WHERE qloo_id=?", REJECTED)[0].n, 0, "the rejected film stays rejected");

  const mention = JSON.parse(noteRow(env, later.id).mentions)[0];
  assert.equal(mention.state, "matched", "the mapped surface resolves without asking again");
  assert.equal(mention.card_id, newCard);
  assert.equal(mention.plus_one, true, "same card, another encounter");
  assert.equal((await openInbox(env)).length, 0, "the surface is settled, so no Inbox question");

  const fps = env.DB.q("SELECT card_id FROM footprints WHERE note_id=?", later.id);
  assert.equal(fps.length, 1);
  assert.equal(fps[0].card_id, newCard);
});
