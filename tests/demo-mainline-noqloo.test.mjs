// Demo mainline, shot 5: what breaks without the taste catalogue.
// With Qloo stubbed to fail, recognition and plans degrade gracefully (HTTP 200, a clear plain-language
// message, nothing invented, no half-written plan) and the notebook still renders; with Qloo on, the same
// note becomes a card that carries its Qloo entity id. Offline: tests/adversarial/harness.mjs mocks
// D1, Workers AI and Qloo, so the only network layer is the programmable mock.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, makeQloo, setQloo, call } from "./adversarial/harness.mjs";
const { default: worker } = await import("../src/index.js");

const NOTE = "I rewatched In the Mood for Love last night";

// A notebook with three kept cards (none of them the film the note names, so recognition has to add it).
function seed(env, U) {
  const db = env.DB._db, now = Date.now();
  db.prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)")
    .run(U, "t" + U, "Greenpoint, Brooklyn", 40, "Saturday afternoon", now);
  [["E-HER", "Her", "film"], ["E-BIGTHIEF", "Big Thief", "music"], ["E-KLARA", "Klara and the Sun", "book"]]
    .forEach(([q, n, t], i) => {
      db.prepare("INSERT INTO cards (id,user_id,qloo_id,name,type,heart,created_at) VALUES (?,?,?,?,?,?,?)")
        .run("C" + i + U, U, q, n, t, 1, now);
      db.prepare("INSERT INTO footprints (id,user_id,card_id,note_id,kind,sentiment,quote,created_at) VALUES (?,?,?,?,?,?,?,?)")
        .run("F" + i + U, U, "C" + i + U, null, "note", "positive", "a line I wrote about " + n, now - i * 1000);
    });
  return "t" + U;
}

function downQloo(env) {
  const q = makeQloo();
  q.mode = "throw"; // the catalogue host is unreachable: fetch rejects
  setQloo(q, env);
  return q;
}

test("recognition without Qloo keeps the note, never 500s, and records a retryable failure", async () => {
  const env = makeEnv();
  downQloo(env);
  const cookie = seed(env, "UNQ1");

  const r = await call(worker, env, "POST", "/api/notes", { body: { text: NOTE }, cookie });
  assert.equal(r.status, 200, "a dead catalogue must not fail the note write");
  assert.ok(r.json && r.json.note && r.json.note.id, "the note was not saved");

  const row = env.DB._db.prepare("SELECT status, meta FROM notes WHERE id=?").get(r.json.note.id);
  assert.ok(row, "the note row is gone");
  assert.ok(["pending", "failed"].includes(row.status), `unexpected status ${row.status}`);
  const meta = JSON.parse(row.meta || "{}");
  assert.equal(typeof meta.error, "string");
  assert.ok(meta.error.trim().length > 0, "the failure was not recorded for the UI/retry");
  assert.doesNotMatch(meta.error, /undefined|NaN|\[object Object\]/);

  // Nothing is invented while the catalogue is down: no new card, no Inbox question.
  const cards = env.DB._db.prepare("SELECT COUNT(*) n FROM cards WHERE user_id=?").get("UNQ1").n;
  assert.equal(cards, 3, "recognition invented a card without the catalogue");
  const inbox = env.DB._db.prepare("SELECT COUNT(*) n FROM inbox WHERE user_id=?").get("UNQ1").n;
  assert.equal(inbox, 0, "recognition asked the Inbox a question it could not answer");

  // The notes list still renders the saved note.
  const list = await call(worker, env, "GET", "/api/notes", { cookie });
  assert.equal(list.status, 200);
  assert.equal(list.json.notes.length, 1);
  assert.equal(list.json.notes[0].text, NOTE);
});

test("without Qloo the notebook still renders: cards and notes are served from D1", async () => {
  const env = makeEnv();
  downQloo(env);
  const cookie = seed(env, "UNQ2");

  const cards = await call(worker, env, "GET", "/api/cards", { cookie });
  assert.equal(cards.status, 200);
  assert.equal(cards.json.cards.length, 3);
  assert.deepEqual(cards.json.cards.map((c) => c.qloo_id).sort(), ["E-BIGTHIEF", "E-HER", "E-KLARA"]);

  const notes = await call(worker, env, "GET", "/api/notes", { cookie });
  assert.equal(notes.status, 200);
  assert.deepEqual(notes.json.notes, []);
});

test("the picker says the catalogue is down in plain words instead of hanging", async () => {
  const env = makeEnv();
  downQloo(env);
  const cookie = seed(env, "UNQ3");

  const r = await call(worker, env, "GET", "/api/catalogue?q=Solaris", { cookie });
  assert.equal(r.status, 502);
  assert.equal(typeof r.json.error, "string");
  assert.match(r.json.error, /catalogue did not answer/i);
  assert.doesNotMatch(r.json.error, /undefined|NaN|\[object Object\]/);
});

test("a plan without Qloo streams one clear qloo_down message and writes no plan", async () => {
  const env = makeEnv();
  downQloo(env);
  const cookie = seed(env, "UNQ4");

  const r = await call(worker, env, "POST", "/api/plan", {
    body: { area: "Greenpoint, Brooklyn", text: "a bookstore and a cafe", when: "Saturday afternoon" },
    cookie,
  });
  assert.equal(r.status, 200, "the plan stream must open even when the catalogue is down");
  const msgs = r.text.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(msgs.some((m) => m.type === "plan"), false, "a plan was emitted without the catalogue");
  const err = msgs.find((m) => m.type === "error");
  assert.ok(err, "no error event reached the client: " + r.text.slice(0, 400));
  assert.equal(err.state, "qloo_down");
  assert.match(err.text, /taste catalogue/i);
  assert.match(err.text, /isn't answering/i);
  assert.match(err.text, /notes and cards are fine/i, "the message must reassure the user");
  assert.doesNotMatch(err.text, /undefined|NaN|\[object Object\]/);

  const plans = env.DB._db.prepare("SELECT COUNT(*) n FROM plans WHERE user_id=?").get("UNQ4").n;
  assert.equal(plans, 0, "a failed plan must not be stored");
});

test("with Qloo answering, the same note becomes a card that carries its Qloo id", async () => {
  const env = makeEnv();
  setQloo(makeQloo(), env); // the catalogue's normal answers
  const cookie = seed(env, "UNQ5");

  const r = await call(worker, env, "POST", "/api/notes", { body: { text: NOTE }, cookie });
  assert.equal(r.status, 200);

  const row = env.DB._db.prepare("SELECT status, mentions FROM notes WHERE id=?").get(r.json.note.id);
  assert.equal(row.status, "done", "the note did not finish recognition");
  const mentions = JSON.parse(row.mentions || "[]");
  assert.equal(mentions.length, 1);
  assert.equal(mentions[0].state, "matched", JSON.stringify(mentions[0]));

  const card = env.DB._db.prepare("SELECT * FROM cards WHERE user_id=? AND qloo_id=?").get("UNQ5", "E-ITML");
  assert.ok(card, "recognition did not save the film under its Qloo id");
  assert.equal(card.name, "In the Mood for Love");
  assert.equal(card.type, "film");

  const list = await call(worker, env, "GET", "/api/cards", { cookie });
  assert.equal(list.status, 200);
  const itml = list.json.cards.find((c) => c.qloo_id === "E-ITML");
  assert.ok(itml, "the new card is missing from /api/cards");
  assert.equal(itml.name, "In the Mood for Love");
  assert.equal(itml.type, "film");
  assert.ok(itml.footprints >= 1, "the card has no footprint tying it to the note");
});
