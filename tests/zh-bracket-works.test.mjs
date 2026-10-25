// FP-48: zh copy wraps works in 《》, but an artist, person or place stays bare.
// The type decides: film/tv/music (album or work)/book/podcast are titles; "music artist",
// "person" and "place" are names. Rows that carry no type keep the old title treatment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { notesLineFor, dressPlan, dressPicks } from "../src/plan.js";
import { makeEnv } from "./adversarial/harness.mjs";

const seedUser = (env, U, cards = []) => {
  const db = env.DB._db, now = Date.now();
  db.prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)").run(U, "t" + U, "Greenpoint, Brooklyn", 40, "Saturday afternoon", now);
  cards.forEach(([qlooid, name, type, n], i) => {
    db.prepare("INSERT INTO cards (id,user_id,qloo_id,name,type,heart,created_at) VALUES (?,?,?,?,?,?,?)").run("C" + i + U, U, qlooid, name, type, 1, now);
    for (let f = 0; f < n; f++) {
      db.prepare("INSERT INTO footprints (id,user_id,card_id,note_id,kind,sentiment,quote,created_at) VALUES (?,?,?,?,?,?,?,?)").run(`F${i}-${f}${U}`, U, "C" + i + U, null, "note", "positive", "a line I wrote about " + name, now - (i * 10 + f) * 1000);
    }
  });
  return db.prepare("SELECT * FROM users WHERE id=?").get(U);
};

const bookStop = () => ([{ qloo_id: "P-BOOK-1", name: "Word", kind: "Bookstore", neighborhood: "Greenpoint", coords: { lat: 40.721, lon: -73.95 }, vibes: ["Cozy"], description: "Shelves and a back room." }]);
const meta = (lang) => ({ area: "Greenpoint, Brooklyn", budget: 40, when: "Saturday afternoon", mood: "familiar", period: "all", lang });

// ---------- notesLineFor ----------
test("notesLineFor zh: artists stay bare, films keep 《》", () => {
  const zh = notesLineFor([{ name: "Big Thief", type: "music artist", n: 2 }, { name: "Her", type: "film", n: 1 }], "zh");
  assert.equal(zh, "你回看过 Big Thief 2 次，也写过《Her》。");
  assert.ok(!zh.includes("《Big Thief》"), "an artist is not a title: " + zh);
});

test("notesLineFor zh: people and places stay bare", () => {
  assert.equal(notesLineFor([{ name: "Margaret", type: "person", n: 1 }], "zh"), "你写过 Margaret。");
  assert.equal(notesLineFor([{ name: "Word", type: "place", n: 1 }], "zh"), "你写过 Word。");
});

test("notesLineFor zh: every work type keeps 《》, including album/work qualifiers", () => {
  for (const [name, type] of [["Her", "film"], ["Severance", "tv"], ["Dragon New Warm Mountain", "music"], ["Blue", "music album"], ["Dune", "music work"], ["Klara and the Sun", "book"], ["Slow Burn", "podcast"]]) {
    const zh = notesLineFor([{ name, type, n: 1 }], "zh");
    assert.equal(zh, `你写过《${name}》。`, `${type} should be a title: ${zh}`);
  }
});

test("notesLineFor zh: rows without a type keep the old title treatment", () => {
  assert.equal(notesLineFor([{ name: "Solaris", n: 1 }], "zh"), "你写过《Solaris》。");
});

test("notesLineFor en is byte-identical and has no 《》", () => {
  assert.equal(
    notesLineFor([{ name: "Big Thief", type: "music artist", n: 2 }, { name: "Her", type: "film", n: 1 }], "en"),
    "You came back to Big Thief 2 times and wrote about Her.",
  );
  assert.doesNotMatch(notesLineFor([{ name: "Her", type: "film", n: 1 }], "en"), /《|》/);
});

// ---------- dressPlan ----------
test("dressPlan zh fallback: a typed artist seed stays bare, a film seed is a title", async () => {
  const env = makeEnv();
  const user = seedUser(env, "UB");
  const plan = await dressPlan(env, user, [{ qloo_id: "E-BT", name: "Big Thief", type: "music artist" }, { qloo_id: "E-HER", name: "Her", type: "film" }], bookStop(), meta("zh"));
  assert.equal(plan.stops[0].from_notes, "你记过 Big Thief 和《Her》。");
});

test("dressPlan zh from_notes: an artist card row stays bare", async () => {
  const env = makeEnv();
  const user = seedUser(env, "UC", [["E-BT", "Big Thief", "music artist", 2], ["E-HER", "Her", "film", 1]]);
  const plan = await dressPlan(env, user, [{ qloo_id: "E-BT", name: "Big Thief" }, { qloo_id: "E-HER", name: "Her" }], bookStop(), meta("zh"));
  assert.equal(plan.stops[0].from_notes, "你回看过 Big Thief 2 次，也写过《Her》。");
});

// ---------- dressPicks why line ----------
test("dressPicks zh why: the kept artist is bare, the kept film keeps 《》", async () => {
  const env = makeEnv();
  const seeds = [{ qloo_id: "E-BT", name: "Big Thief", type: "music artist" }, { qloo_id: "E-HER", name: "Her", type: "film" }];
  const user = seedUser(env, "UD", [["E-BT", "Big Thief", "music artist", 1], ["E-HER", "Her", "film", 1]]);
  const picks = [{ qloo_id: "P1", name: "Dragon New Warm Mountain", kind: "music", tags: ["indie"], seeds_used: seeds }];
  const out = await dressPicks(env, user, seeds, picks, "zh");
  assert.equal(out[0].why_line, "因为你记过 Big Thief 和《Her》；口味目录把它归在 独立。");
});

test("dressPicks en why is byte-identical and never uses 《》", async () => {
  const env = makeEnv();
  const seeds = [{ qloo_id: "E-BT", name: "Big Thief", type: "music artist" }, { qloo_id: "E-HER", name: "Her", type: "film" }];
  const user = seedUser(env, "UE");
  const picks = [{ qloo_id: "P1", name: "Dragon New Warm Mountain", kind: "music", tags: ["indie"], seeds_used: seeds }];
  const out = await dressPicks(env, user, seeds, picks, "en");
  assert.equal(out[0].why_line, "Because you kept Big Thief and Her; the catalogue files it under indie.");
});
