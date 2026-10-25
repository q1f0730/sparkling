// Card plan-fromnotes-zh (shot 4 in zh): a go-out stop's "from your notes" line (from_notes) is built
// in dressPlan; in a zh plan it must be Chinese with 《》 titles, the revisit count kept and no English verbs.
// notesLineFor(rows, lang) is the pure helper; dressPlan uses it for the fallback line and inside fit().
import { test } from "node:test";
import assert from "node:assert/strict";
import { notesLineFor, dressPlan } from "../src/plan.js";
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

test("notesLineFor keeps the English wording byte-identical", () => {
  assert.equal(
    notesLineFor([{ name: "In the Mood for Love", n: 3 }, { name: "Big Thief", n: 1 }], "en"),
    "You came back to In the Mood for Love 3 times and wrote about Big Thief.",
  );
  assert.equal(notesLineFor([{ name: "Solaris", n: 1 }], "en"), "You wrote about Solaris.");
  assert.equal(
    notesLineFor([{ name: "A", n: 2 }, { name: "B", n: 2 }, { name: "C", n: 1 }], "en"),
    "You came back to A 2 times and came back to B 2 times.",
    "at most two rows are used",
  );
});

test("notesLineFor writes the zh line with 《》 titles, the count and 。", () => {
  assert.equal(
    notesLineFor([{ name: "In the Mood for Love", n: 3 }, { name: "Big Thief", n: 1 }], "zh"),
    "你回看过《In the Mood for Love》3 次，也写过《Big Thief》。",
  );
  assert.equal(notesLineFor([{ name: "Solaris", n: 1 }], "zh"), "你写过《Solaris》。");
  assert.ok(!/次/.test(notesLineFor([{ name: "Solaris", n: 1 }], "zh")), "a single note has no count");
  assert.equal(notesLineFor([], "zh"), null, "empty rows -> null");
  assert.equal(notesLineFor([], "en"), null);
  assert.equal(notesLineFor(null, "zh"), null);
});

test("dressPlan writes zh from_notes for a go-out stop", async () => {
  const env = makeEnv();
  const user = seedUser(env, "UZ", [["E-ITML", "In the Mood for Love", "film", 3], ["E-BIGTHIEF", "Big Thief", "music", 1]]);
  const plan = await dressPlan(env, user, [{ qloo_id: "E-ITML", name: "In the Mood for Love" }, { qloo_id: "E-BIGTHIEF", name: "Big Thief" }], bookStop(), meta("zh"));
  assert.equal(plan.stops.length, 1);
  assert.equal(plan.stops[0].from_notes, "你回看过《In the Mood for Love》3 次，也写过《Big Thief》。");
});

test("dressPlan keeps the English from_notes byte-identical", async () => {
  const env = makeEnv();
  const user = seedUser(env, "UE", [["E-ITML", "In the Mood for Love", "film", 3], ["E-BIGTHIEF", "Big Thief", "music", 1]]);
  const plan = await dressPlan(env, user, [{ qloo_id: "E-ITML", name: "In the Mood for Love" }, { qloo_id: "E-BIGTHIEF", name: "Big Thief" }], bookStop(), meta("en"));
  assert.equal(plan.stops[0].from_notes, "You came back to In the Mood for Love 3 times and wrote about Big Thief.");
});

test("dressPlan falls back to the zh kept line when the seeds are not in the notes", async () => {
  const env = makeEnv();
  const user = seedUser(env, "UN");
  const plan = await dressPlan(env, user, [{ qloo_id: "E-ITML", name: "In the Mood for Love" }, { qloo_id: "E-BIGTHIEF", name: "Big Thief" }], bookStop(), meta("zh"));
  assert.equal(plan.stops[0].from_notes, "你记过《In the Mood for Love》和《Big Thief》。");
});
