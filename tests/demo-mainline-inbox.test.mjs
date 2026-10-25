// Main-line regression test: the red-dot Inbox.
// An unsure mention ("Solaris" matches two films) must wait in the Inbox instead of becoming a card;
// accepting it turns it into a card and clears the count, rejecting it removes it for good.
// Offline only: the harness SQLite/AI/Qloo mocks, like tests/stayin.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, makeQloo, setQloo, call } from "./adversarial/harness.mjs";
// dynamic: src/index.js imports src/app.html, so the html hook must be registered first.
const { default: worker } = await import("../src/index.js");

const SOLARIS_NOTE = "Watched Solaris at the cinema last night.";

function freshEnv() {
  const env = makeEnv();
  setQloo(makeQloo(), env); // env-scoped Qloo: no shared state between tests
  return env;
}

function seedUser(env) {
  const id = "U" + Math.random().toString(36).slice(2, 10);
  const token = "t" + id;
  env.DB._db.prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)")
    .run(id, token, "Greenpoint, Brooklyn", 40, "Saturday afternoon", Date.now());
  return { id, token };
}

async function postNote(env, token, text) {
  const r = await call(worker, env, "POST", "/api/notes", { cookie: token, body: { text } });
  assert.equal(r.status, 200, r.text);
  return r.json.note;
}

async function openInbox(env, token) {
  const r = await call(worker, env, "GET", "/api/inbox", { cookie: token });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.items.length, 1, "expected exactly one open inbox question");
  return r.json.items[0];
}

async function inboxCount(env, token) {
  const r = await call(worker, env, "GET", "/api/me", { cookie: token });
  assert.equal(r.status, 200, r.text);
  return r.json.inbox_count;
}

test("an unsure mention waits in the inbox, not in cards", async () => {
  const env = freshEnv();
  const { id: userId, token } = seedUser(env);
  await postNote(env, token, SOLARIS_NOTE);

  const item = await openInbox(env, token);
  assert.equal(item.mention, "Solaris");
  assert.equal(item.sentence, SOLARIS_NOTE);
  assert.deepEqual(item.guesses.map((g) => g.qloo_id).sort(), ["E-SOLARIS-02", "E-SOLARIS-72"]);
  assert.equal(item.reason, "2 films are called Solaris.");

  const cards = await call(worker, env, "GET", "/api/cards", { cookie: token });
  assert.deepEqual(cards.json.cards, [], "an unsure mention must not create a card");
  assert.equal(await inboxCount(env, token), 1);

  const notes = await call(worker, env, "GET", "/api/notes", { cookie: token });
  const note = notes.json.notes[0];
  assert.equal(note.status, "done");
  assert.equal(note.card_count, 0);
  assert.equal(note.mentions.length, 1);
  assert.equal(note.mentions[0].state, "inbox");

  assert.equal(env.DB.q("SELECT COUNT(*) c FROM cards WHERE user_id=?", userId)[0].c, 0);
  assert.equal(env.DB.q("SELECT COUNT(*) c FROM footprints WHERE user_id=?", userId)[0].c, 0);
  assert.equal(env.DB.q("SELECT COUNT(*) c FROM inbox WHERE user_id=? AND status='open'", userId)[0].c, 1);
});

test("accepting an inbox question moves it to a card and updates the counts", async () => {
  const env = freshEnv();
  const { id: userId, token } = seedUser(env);
  await postNote(env, token, SOLARIS_NOTE);
  const item = await openInbox(env, token);

  const r = await call(worker, env, "POST", `/api/inbox/${item.id}`, {
    cookie: token, body: { action: "accept", qloo_id: "E-SOLARIS-72" },
  });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.ok, true);
  assert.ok(r.json.card_id, "accept must return the new card id");

  const empty = await call(worker, env, "GET", "/api/inbox", { cookie: token });
  assert.deepEqual(empty.json.items, [], "a resolved question leaves the inbox");
  assert.equal(await inboxCount(env, token), 0);

  const cards = await call(worker, env, "GET", "/api/cards", { cookie: token });
  assert.equal(cards.json.cards.length, 1);
  const card = cards.json.cards[0];
  assert.equal(card.id, r.json.card_id);
  assert.equal(card.name, "Solaris");
  assert.equal(card.type, "film");
  assert.equal(card.year, "1972", "the accepted choice, not the other Solaris");
  assert.equal(card.footprints, 1);

  const detail = await call(worker, env, "GET", `/api/cards/${card.id}`, { cookie: token });
  assert.equal(detail.status, 200, detail.text);
  assert.equal(detail.json.footprints.length, 1);
  assert.equal(detail.json.footprints[0].quote, SOLARIS_NOTE);

  const notes = await call(worker, env, "GET", "/api/notes", { cookie: token });
  const note = notes.json.notes[0];
  assert.equal(note.card_count, 1);
  assert.equal(note.mentions[0].state, "matched");
  assert.equal(note.mentions[0].card_id, card.id);

  assert.equal(env.DB.q("SELECT status, resolved_card FROM inbox WHERE id=?", item.id)[0].status, "accepted");
  assert.equal(env.DB.q("SELECT resolved_card FROM inbox WHERE id=?", item.id)[0].resolved_card, card.id);
  assert.equal(env.DB.q("SELECT COUNT(*) c FROM footprints WHERE user_id=?", userId)[0].c, 1);
});

test("dismissing an inbox question removes it, creates no card, and keeps the name plain", async () => {
  const env = freshEnv();
  const { id: userId, token } = seedUser(env);
  await postNote(env, token, SOLARIS_NOTE);
  const item = await openInbox(env, token);

  const r = await call(worker, env, "POST", `/api/inbox/${item.id}`, { cookie: token, body: { action: "reject" } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.ok, true);

  const empty = await call(worker, env, "GET", "/api/inbox", { cookie: token });
  assert.deepEqual(empty.json.items, [], "a dismissed question leaves the inbox");
  assert.equal(await inboxCount(env, token), 0);

  const cards = await call(worker, env, "GET", "/api/cards", { cookie: token });
  assert.deepEqual(cards.json.cards, [], "dismissing must not create a card");
  assert.equal(env.DB.q("SELECT COUNT(*) c FROM cards WHERE user_id=?", userId)[0].c, 0);
  assert.equal(env.DB.q("SELECT COUNT(*) c FROM footprints WHERE user_id=?", userId)[0].c, 0);
  assert.equal(env.DB.q("SELECT status FROM inbox WHERE id=?", item.id)[0].status, "rejected");

  const notes = await call(worker, env, "GET", "/api/notes", { cookie: token });
  assert.equal(notes.json.notes[0].mentions[0].state, "plain");

  // The dismissal is remembered: the same mention in a new note stays plain, with no second question.
  await postNote(env, token, SOLARIS_NOTE);
  const again = await call(worker, env, "GET", "/api/inbox", { cookie: token });
  assert.deepEqual(again.json.items, [], "a dismissed name must not ask again");
  assert.equal(await inboxCount(env, token), 0);
  const after = await call(worker, env, "GET", "/api/notes", { cookie: token });
  assert.ok(after.json.notes.every((n) => n.mentions.every((m) => m.state === "plain")));
});

test("a sure match becomes a card straight away, with no inbox question", async () => {
  const env = freshEnv();
  const { id: userId, token } = seedUser(env);
  await postNote(env, token, "Watched Her last night.");

  const cards = await call(worker, env, "GET", "/api/cards", { cookie: token });
  assert.equal(cards.json.cards.length, 1);
  assert.equal(cards.json.cards[0].name, "Her");
  assert.equal(cards.json.cards[0].type, "film");

  const inbox = await call(worker, env, "GET", "/api/inbox", { cookie: token });
  assert.deepEqual(inbox.json.items, []);
  assert.equal(await inboxCount(env, token), 0);
  assert.equal(env.DB.q("SELECT COUNT(*) c FROM inbox WHERE user_id=?", userId)[0].c, 0);
});
