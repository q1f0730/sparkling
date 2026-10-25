// Demo mainline: opening a card. GET /api/cards/:id is what the detail view and the desktop inspector read:
// the card fields (name, type, year, image when present), its tags, one footprint per note (not per row),
// the first and last mention times, and 404 for a card that belongs to someone else.
// Offline: tests/adversarial/harness.mjs mocks D1, Workers AI and Qloo (no real network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, call } from "./adversarial/harness.mjs";
const { default: worker } = await import("../src/index.js");

const TAGS = ["Slow", "Space", "Memory", "Grief"];

function setup(U) {
  const env = makeEnv(), db = env.DB._db, now = Date.now();
  db.prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)")
    .run(U, "t" + U, "Greenpoint, Brooklyn", 40, "Saturday afternoon", now);
  db.prepare("INSERT INTO cards (id,user_id,qloo_id,name,type,year,byline,image,tags,heart,created_at) VALUES (?,?,?,?,?,?,?,?,?,0,?)")
    .run("C1", U, "q1", "Solaris", "film", "1972", "Andrei Tarkovsky", "https://img.example/solaris.jpg", JSON.stringify(TAGS), now);
  db.prepare("INSERT INTO notes (id,user_id,text,kind,status,mentions,created_at) VALUES (?,?,?,?,?,?,?)")
    .run("N1", U, "finally watched Solaris", "text", "done", "[]", now - 2000);
  db.prepare("INSERT INTO notes (id,user_id,text,kind,status,mentions,created_at) VALUES (?,?,?,?,?,?,?)")
    .run("N2", U, "Solaris again, still slow", "text", "done", "[]", now - 500);
  const fp = db.prepare("INSERT INTO footprints (id,user_id,card_id,note_id,kind,sentiment,source,created_at) VALUES (?,?,?,?,'note',?,'note',?)");
  fp.run("F1", U, "C1", "N1", "positive", now - 2000);
  fp.run("F1b", U, "C1", "N1", "positive", now - 1900); // same note twice: still one mention
  fp.run("F2", U, "C1", "N2", "negative", now - 1000);
  return { env, cookie: "t" + U, now };
}

test("card detail returns the card fields, tags and one footprint per note", async () => {
  const { env, cookie, now } = setup("UMC1");
  const r = await call(worker, env, "GET", "/api/cards/C1", { cookie });
  assert.equal(r.status, 200);
  const card = r.json.card;
  assert.equal(card.name, "Solaris");
  assert.equal(card.type, "film");
  assert.equal(card.year, "1972");
  assert.equal(card.by, "Andrei Tarkovsky");
  assert.equal(card.image, "https://img.example/solaris.jpg");
  assert.deepEqual(card.tags, TAGS);
  assert.deepEqual(r.json.qloo_tags, TAGS.slice(0, 3));
  // Two notes were mentioned; the duplicate row on N1 is not a second mention.
  assert.equal(card.footprints, 2);
  assert.equal(r.json.footprints.length, 2);
  assert.deepEqual(r.json.footprints.map((f) => f.note_id).sort(), ["N1", "N2"]);
  assert.equal(card.first_at, now - 2000);
  assert.equal(card.last_at, now - 1000);
  // The newer mention comes first, like the card list.
  assert.equal(r.json.footprints[0].note_id, "N2");
});

test("foreign or unknown card ids are 404", async () => {
  const { env, cookie } = setup("UMC2");
  env.DB._db.prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES ('UX','tUX','x',40,'y',0)").run();
  const foreign = await call(worker, env, "GET", "/api/cards/C1", { cookie: "tUX" });
  assert.equal(foreign.status, 404);
  const unknown = await call(worker, env, "GET", "/api/cards/nope", { cookie });
  assert.equal(unknown.status, 404);
  const mine = await call(worker, env, "GET", "/api/cards/C1", { cookie });
  assert.equal(mine.status, 200);
});
