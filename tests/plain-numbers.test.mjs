// Shots 2 & 4: readable copy. The user sees words, not raw scores — "mostly through X and Y",
// never "(39% of the match)" / "affinity 0.88" / "(0.85)". The numbers stay in the data objects
// (why.contributions, why.affinity, taste.affinity) for receipts and inspectors.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dressPlan } from "../src/plan.js";
import { inboxReason } from "../src/recognize.js";
import { makeEnv } from "./adversarial/harness.mjs";
import { loadZh } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const BOOK = ["CBOOK", "E-RINGS", "The Rings of Saturn", "book"];
const MUSIC = ["CMUS", "E-BIGTHIEF", "Big Thief", "music"];

function seedUser(env, cards) {
  const db = env.DB._db, U = "UPN", now = Date.now();
  db.prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)").run(U, "tUPN", "Greenpoint, Brooklyn", 40, "Saturday afternoon", now);
  cards.forEach(([id, qloo_id, name, type], i) => {
    db.prepare("INSERT INTO cards (id,user_id,qloo_id,name,type,heart,created_at) VALUES (?,?,?,?,?,?,?)").run(id, U, qloo_id, name, type, 1, now);
    db.prepare("INSERT INTO footprints (id,user_id,card_id,note_id,kind,sentiment,created_at) VALUES (?,?,?,?,?,?,?)").run(id + "F", U, id, null, "note", "positive", now - i * 1000);
  });
  return db.prepare("SELECT * FROM users WHERE id=?").get(U);
}

async function dress(env, user, seeds, stops) {
  env.AI.run = async () => { throw new Error("offline"); };
  env.READ_TIMEOUT_MS = "5";
  const out = await dressPlan(env, user, seeds.map((c) => ({ qloo_id: c[1], name: c[2] })), stops, { area: "Greenpoint, Brooklyn", budget: 40, when: "Saturday afternoon" });
  const list = Array.isArray(out) ? out : (out && (out.stops || (out.plan && out.plan.stops))) || [];
  assert.ok(list.length > 0, "dressed stops");
  return list;
}

test("a go-out stop names the cards behind the match, without percentages or affinity", async () => {
  const env = makeEnv();
  const user = seedUser(env, [BOOK, MUSIC]);
  const [s] = await dress(env, user, [BOOK, MUSIC], [
    {
      qloo_id: "P-BOOK-1", name: "Book Nook", kind: "Bookstore", neighborhood: "Greenpoint",
      vibes: ["Cozy"], coords: { lat: 40.721, lon: -73.95 }, affinity: 0.88,
      expl: [{ id: "E-RINGS", score: 0.39 }, { id: "E-BIGTHIEF", score: 0.35 }],
    },
  ]);

  assert.equal(s.from_qloo, "Matched this bookstore mostly through The Rings of Saturn and Big Thief.");
  assert.doesNotMatch(s.from_qloo, /% of the match|affinity|0\.\d/, "no raw scores in the stop copy: " + s.from_qloo);

  // The numbers are still in the data object the receipts/inspector read.
  assert.equal(s.why.affinity, 0.88, "affinity kept in why");
  assert.deepEqual(
    s.why.contributions.map((r) => [r.name, r.score]),
    [["The Rings of Saturn", 0.39], ["Big Thief", 0.35]],
    "per-seed contributions kept in why",
  );
});

test("the inbox reason says 'closest to your taste' without the affinity number", () => {
  const r = inboxReason("Solaris", [
    { name: "Solaris", type: "film", year: "1972", taste: { affinity: 0.85, via: [{ name: "Big Thief" }, { name: "Mitski" }] } },
    { name: "Solaris", type: "film", year: "2002", taste: { affinity: 0.74, via: [] } },
  ]);
  assert.equal(r, "2 films are called Solaris. The catalogue puts Solaris (1972) closest to your taste, mostly through Big Thief and Mitski.");
  assert.doesNotMatch(r, /0\.\d/, "no raw affinity in the question: " + r);
});

test("简体中文 inbox reason drops the number too, and still accepts the old numbered sentence", () => {
  const zh = loadZh();
  const now = zh("3 films are called Solaris. The catalogue puts Solaris (1972) closest to your taste, mostly through Big Thief and Mitski.");
  assert.match(now, /目录认为 Solaris \(1972\) 最贴近你的口味，主要因为 Big Thief 和 Mitski。/, now);
  assert.doesNotMatch(now, /0\.\d|closest to your taste/, now);

  const old = zh("3 films are called Solaris. The catalogue puts Solaris (1972) closest to your taste (0.85), mostly through Big Thief and Mitski.");
  assert.match(old, /最贴近你的口味，主要因为 Big Thief 和 Mitski。/, old);
  assert.doesNotMatch(old, /0\.85|closest to your taste/, old);
});

test("简体中文 from_qloo wording matches the plain sentence", () => {
  const zh = loadZh();
  assert.equal(
    zh("Matched this bookstore mostly through The Rings of Saturn and Big Thief."),
    "这家书店主要是通过《The Rings of Saturn》和《Big Thief》匹配上的。",
  );
  const old = zh("Matched this bookstore mostly through The Rings of Saturn (39% of the match) and Big Thief (35% of the match); affinity 0.88.");
  assert.equal(old, "这家书店主要是通过《The Rings of Saturn》和《Big Thief》匹配上的。");
});
