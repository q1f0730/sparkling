// Demo mainline: settings › "How Sparkling uses Qloo".
// The page promises: "Every thread and plan has a receipt with the exact Qloo calls behind it."
// This pins that promise on real routes: /api/threads and /api/plan each return a receipt whose
// evidence rows carry the catalogue's entity ids (never Sparkling's internal card ids), and an
// empty notebook gets a polite 200 with a reason instead of a 500.
// Offline: tests/adversarial/harness.mjs mocks D1, Workers AI and Qloo (no real network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, makeQloo, setQloo, call } from "./adversarial/harness.mjs";
const { default: worker } = await import("../src/index.js");

// Four noted cards across three types: enough for the threads route (>= 4 cards, >= 2 types).
const SEED = [
  ["E-ITML", "In the Mood for Love", "film"],
  ["E-HER", "Her", "film"],
  ["E-BIGTHIEF", "Big Thief", "music"],
  ["E-KLARA", "Klara and the Sun", "book"],
];

function newUser(env, tag) {
  const U = "U" + tag;
  env.DB._db
    .prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)")
    .run(U, "t" + U, "Greenpoint, Brooklyn", 40, "Saturday afternoon", Date.now());
  return { U, cookie: "t" + U };
}

// Cards the user noted: one hearted card + one footprint each, like after a few notes.
function seedCards(env, U, cards = SEED) {
  const db = env.DB._db, now = Date.now();
  cards.forEach(([qloo_id, name, type], i) => {
    const id = "C" + i + U;
    db.prepare("INSERT INTO cards (id,user_id,qloo_id,name,type,heart,created_at) VALUES (?,?,?,?,?,?,?)")
      .run(id, U, qloo_id, name, type, 1, now);
    db.prepare("INSERT INTO footprints (id,user_id,card_id,note_id,kind,sentiment,quote,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run("F" + i + U, U, id, null, "note", "positive", "a line I wrote about " + name, now - i * 1000);
  });
  return cards.map(([qloo_id]) => qloo_id);
}

// The plan route answers with NDJSON (log lines, then one plan or one error).
async function planStream(env, cookie, body) {
  const r = await call(worker, env, "POST", "/api/plan", { body, cookie });
  const msgs = r.text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return { status: r.status, msgs, plan: (msgs.find((m) => m.type === "plan") || {}).plan, err: msgs.find((m) => m.type === "error") };
}

test("empty notebook: the receipts endpoints answer 200 with a reason, never a 500", async () => {
  const env = makeEnv();
  setQloo(makeQloo(), env);
  const { cookie } = newUser(env, "EMPTY");
  const threads = await call(worker, env, "GET", "/api/threads", { cookie });
  assert.equal(threads.status, 200);
  assert.deepEqual(threads.json.threads, []);
  assert.equal(threads.json.reason, "Threads show up once a few things keep coming back.");
  const cards = await call(worker, env, "GET", "/api/cards", { cookie });
  assert.equal(cards.status, 200);
  assert.deepEqual(cards.json.cards, []);
  // a plan with nothing to plan from is a readable stream state, not a crash
  const p = await planStream(env, cookie, { text: "watch a movie", mode: "in" });
  assert.equal(p.status, 200);
  assert.equal(p.err && p.err.state, "too_few");
});

test("threads receipt: the exact tag-insight call, per card, with the catalogue's real ids", async () => {
  const env = makeEnv();
  const q = makeQloo();
  setQloo(q, env);
  const { U, cookie } = newUser(env, "THR");
  const ids = seedCards(env, U);
  const r = await call(worker, env, "GET", "/api/threads", { cookie });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json.threads) && r.json.threads.length >= 1, "no threads came back");

  const rec = r.json.receipt;
  assert.equal(rec.endpoint, "/v2/insights");
  assert.equal(rec["filter.type"], "urn:tag");
  assert.deepEqual([...rec["signal.interests.entities"]].sort(), [...ids].sort());
  assert.ok(!rec["signal.interests.entities"].some((x) => String(x).startsWith("C")), "receipt leaked an internal card id");

  // The receipt must match what the catalogue was actually asked: sort() in tagRead orders the ids.
  const asked = q.calls.some((c) =>
    c.startsWith("/v2/insights?") && c.includes("filter.type=urn%3Atag") && ids.every((id) => c.includes(id))
  );
  assert.ok(asked, "the tag-insight call did not carry the user's card ids: " + JSON.stringify(q.calls));

  for (const t of r.json.threads) {
    assert.equal(t.receipt.endpoint, "/v2/insights");
    assert.equal(t.receipt["filter.type"], "urn:tag");
    // per-thread evidence: the Qloo tags behind it and one {qloo_id, name} row per card it rests on
    assert.deepEqual(t.receipt.tag_ids, [t.tag_id]);
    assert.ok(["T1", "T2"].includes(t.tag_id), "thread cites an id the catalogue never returned: " + t.tag_id);
    assert.deepEqual(t.receipt["signal.interests.entities"].map((x) => x.qloo_id).sort(), [...ids].sort());
    assert.ok(t.cards.length >= 1);
    for (const c of t.cards) assert.ok(ids.includes(c.qloo_id), "thread card lost its catalogue id");
  }
});

test("card detail behind a thread is keyed by the same real Qloo id", async () => {
  const env = makeEnv();
  setQloo(makeQloo(), env);
  const { U, cookie } = newUser(env, "CARD");
  const ids = seedCards(env, U);
  const threads = await call(worker, env, "GET", "/api/threads", { cookie });
  assert.equal(threads.status, 200);
  const seen = new Set();
  for (const t of threads.json.threads) {
    for (const c of t.cards) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      const d = await call(worker, env, "GET", "/api/cards/" + c.id, { cookie });
      assert.equal(d.status, 200);
      assert.equal(d.json.card.qloo_id, c.qloo_id);
      assert.ok(ids.includes(d.json.card.qloo_id), "card detail is not keyed by a catalogue id");
    }
  }
  assert.ok(seen.size >= 2, "no card evidence to inspect");
});

// A stay-in plan needs film entities back from the catalogue, plus explainability back to the seeds.
const MOVIES = ["Chungking Express", "Tokyo Story", "Happy Together", "Yi Yi", "Fallen Angels", "In the Mood for Love"].map((n, i) => ({
  entity_id: i === 5 ? "E-ITML" : "M-" + i, name: n, popularity: 0.9 - i * 0.01,
  tags: [{ name: "Drama", type: "urn:tag:genre:media" }, { name: "Intimate", type: "urn:tag:plot:qloo" }],
  properties: { release_year: 1990 + i, image: { url: "https://images.qloo.com/i/M" + i + ".jpg" }, short_descriptions: [{ value: "A one-line summary " + i + ".", languages: ["en"] }] },
  query: { affinity: 0.8, explainability: { "signal.interests.entities": [{ entity_id: "E-ITML", score: 0.7 }, { entity_id: "E-HER", score: 0.3 }] } },
}));
function qlooWithMovies() {
  const q = makeQloo();
  q.override = (u) => {
    if (u.pathname === "/v2/insights" && u.searchParams.get("filter.type") === "urn:entity:movie")
      return new Response(JSON.stringify({ results: { entities: MOVIES } }), { status: 200, headers: { "content-type": "application/json" } });
    return null;
  };
  return q;
}

test("plan receipt: seeds and queries name the real catalogue ids, and no note text is sent", async () => {
  const env = makeEnv();
  setQloo(qlooWithMovies(), env);
  const { U, cookie } = newUser(env, "PLAN");
  const ids = seedCards(env, U);
  const { plan, err } = await planStream(env, cookie, { text: "watch a movie", mode: "in" });
  assert.equal(err, undefined, JSON.stringify(err));
  assert.equal(plan.mode, "in");
  assert.equal(plan.picks.length, 3);

  const rec = plan.receipt;
  assert.ok(Array.isArray(rec.seeds) && rec.seeds.length >= 2);
  for (const s of rec.seeds) {
    assert.ok(ids.includes(s.qloo_id), "receipt seed is not one of the user's catalogue ids: " + s.qloo_id);
    assert.ok(s.name);
  }
  // The receipt mirrors the call: one /v2/insights request per kind, seeded by the user's cards.
  assert.ok(rec.queries.length >= 1);
  for (const qry of rec.queries) {
    assert.equal(qry.endpoint, "/v2/insights");
    assert.equal(qry["filter.type"], "urn:entity:movie");
    assert.ok(qry["signal.interests.entities"].length >= 2);
  }
  assert.equal(rec.sent_to_qloo, "Card IDs only. No note text, no location.");
  // Every pick carries evidence that resolves to a card the user actually noted.
  for (const p of plan.picks) {
    assert.ok(p.qloo_id && !ids.includes(p.qloo_id), "a pick is not a new catalogue entity");
    assert.ok(p.sources.length >= 1, "pick has no evidence");
    for (const s of p.sources) assert.ok(ids.includes(s.qloo_id), "pick evidence is not a user card's catalogue id");
  }
});
