// Shot 4: every go-out stop should say "because you kept X". When the model's read is ungrounded,
// dressPlan falls back to groundedRead's note template, which must name the kept card behind the stop:
// the same card fit() picks (book cards for a bookstore, music for a record store, film/tv for a cinema,
// else the first card, rotated by stop index). read_src must stay "template" and from_notes must not change.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dressPlan } from "../src/plan.js";
import { makeEnv } from "./adversarial/harness.mjs";

const UNGROUNDED = "A neon galactic spaceship disco fortress humming.";

function seed(env, cards) {
  const db = env.DB._db, U = "URC", now = Date.now();
  db.prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)").run(U, "tURC", "Greenpoint, Brooklyn", 40, "Saturday afternoon", now);
  cards.forEach(([id, qloo_id, name, type, n]) => {
    db.prepare("INSERT INTO cards (id,user_id,qloo_id,name,type,heart,created_at) VALUES (?,?,?,?,?,?,?)").run(id, U, qloo_id, name, type, 1, now);
    for (let k = 0; k < (n || 1); k++) {
      db.prepare("INSERT INTO footprints (id,user_id,card_id,note_id,kind,sentiment,created_at) VALUES (?,?,?,?,?,?,?)").run(id + "F" + k, U, id, null, "note", "positive", now);
    }
  });
  return db.prepare("SELECT * FROM users WHERE id=?").get(U);
}

const book = ["CK", "E-KLARA", "Klara and the Sun", "book"];
const music = ["CM", "E-BIGTHIEF", "Big Thief", "music"];
const film = ["CF", "E-ITML", "In the Mood for Love", "film"];

const seedOf = (c) => ({ qloo_id: c[1], name: c[2] });

async function dress(env, user, seeds, stops) {
  env.AI.run = async () => ({ response: { reads: stops.map(() => UNGROUNDED) } });
  const out = await dressPlan(env, user, seeds.map(seedOf), stops, { area: "Greenpoint, Brooklyn", budget: 40, when: "Saturday afternoon" });
  const list = Array.isArray(out) ? out : (out && (out.stops || (out.plan && out.plan.stops))) || [];
  assert.ok(list.length > 0, "dressed stops");
  return list;
}

test("a bookstore's template read names the kept book card, not the music card", async () => {
  const env = makeEnv();
  const user = seed(env, [book, music]);
  const [s] = await dress(env, user, [book, music], [
    { qloo_id: "P-BOOK-1", name: "Book Nook", kind: "Bookstore", neighborhood: "Greenpoint", vibes: ["Cozy"], coords: { lat: 40.721, lon: -73.95 } },
  ]);
  assert.equal(s.read_src, "template");
  assert.match(s.read, /a fit for your note on Klara and the Sun\./, "named the kept book card: " + s.read);
  assert.doesNotMatch(s.read, /Big Thief/);
});

test("a record store's template read names the kept music card", async () => {
  const env = makeEnv();
  const user = seed(env, [book, music]);
  const [s] = await dress(env, user, [book, music], [
    { qloo_id: "P-REC-1", name: "Records 1", kind: "Record store", neighborhood: "Greenpoint", vibes: ["Vinyl"], coords: { lat: 40.722, lon: -73.952 } },
  ]);
  assert.equal(s.read_src, "template");
  assert.match(s.read, /a fit for your note on Big Thief\./, "named the kept music card: " + s.read);
});

test("a cinema's template read names the kept film card", async () => {
  const env = makeEnv();
  const user = seed(env, [book, film]);
  const [s] = await dress(env, user, [book, film], [
    { qloo_id: "P-CIN-1", name: "Nitehawk", kind: "Cinema", neighborhood: "Greenpoint", vibes: ["Cozy"], coords: { lat: 40.723, lon: -73.953 } },
  ]);
  assert.equal(s.read_src, "template");
  assert.match(s.read, /a fit for your note on In the Mood for Love\./, "named the kept film card: " + s.read);
});

test("a kind with no matching card uses the first kept card, rotated by stop index", async () => {
  const env = makeEnv();
  const klara = ["CK", "E-KLARA", "Klara and the Sun", "book", 3];
  const norwood = ["CN", "E-NORWOOD", "Norwegian Wood", "book"];
  const user = seed(env, [klara, norwood]);
  const list = await dress(env, user, [klara, norwood], [
    { qloo_id: "P-CAFE-1", name: "Cafe 1", kind: "Coffee shop", neighborhood: "Greenpoint", vibes: ["Cozy"], coords: { lat: 40.721, lon: -73.951 } },
    { qloo_id: "P-CAFE-2", name: "Cafe 2", kind: "Coffee shop", neighborhood: "Greenpoint", vibes: ["Quiet"], coords: { lat: 40.7225, lon: -73.9515 } },
  ]);
  assert.equal(list.length, 2);
  assert.match(list[0].read, /a fit for your note on Klara and the Sun\./);
  assert.match(list[1].read, /a fit for your note on Norwegian Wood\./);
  for (const s of list) assert.equal(s.read_src, "template");
  // fit() output (from_notes) must not change: stop 0 starts with the most-kept card.
  assert.equal(list[0].from_notes, "You came back to Klara and the Sun 3 times and wrote about Norwegian Wood.");
});
