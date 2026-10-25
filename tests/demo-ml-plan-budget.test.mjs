// Main-line regression: a go-out plan must honour the stated area ("Greenpoint") and budget ("$40"), give
// every stop a kept-card reason plus a real catalogue place id, and answer an empty notebook with a clear
// message instead of a 500. Offline: the Qloo catalogue and Workers AI are mocked (tests/adversarial/harness.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeEnv, makeQloo, setQloo, call } from "./adversarial/harness.mjs";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
const { default: worker } = await import("../src/index.js");

// ---------- fixtures: four noted cards (the seeds) and three Greenpoint kinds ----------
const SEEDS = [
  ["E-KLARA", "Klara and the Sun", "book"],
  ["E-ITML", "In the Mood for Love", "film"],
  ["E-BIGTHIEF", "Big Thief", "music"],
  ["E-NORWOOD", "Norwegian Wood", "book"],
];
const SEED_NAMES = SEEDS.map(([, n]) => n);

function newUser(env, U, area = "Greenpoint, Brooklyn", budget = 40) {
  env.DB._db.prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)")
    .run(U, "t" + U, area, budget, "Saturday afternoon", Date.now());
  return { token: "t" + U, user: { id: U } };
}
function seedCards(env, U) {
  const db = env.DB._db, now = Date.now();
  SEEDS.forEach(([qloo_id, name, type], i) => {
    db.prepare("INSERT INTO cards (id,user_id,qloo_id,name,type,heart,created_at) VALUES (?,?,?,?,?,?,?)")
      .run("C" + i + U, U, qloo_id, name, type, 1, now);
    db.prepare("INSERT INTO footprints (id,user_id,card_id,note_id,kind,sentiment,quote,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run("F" + i + U, U, "C" + i + U, null, "note", "positive", "a line I wrote about " + name, now - i * 1000);
  });
}

const cat = (name) => ({ name, type: "urn:tag:category:place" });
const sat = (o, c) => ({ saturday: [{ opens: `T${o}:00`, closes: `T${c}:00`, closed: false }] });
function place(id, name, primary, price, extra = {}) {
  return {
    entity_id: id, name, popularity: 0.8,
    location: extra.loc || { lat: 40.7295, lon: -73.954 },
    tags: [cat(primary), { name: "Cozy", type: "urn:tag:ambience:qloo" }],
    properties: {
      address: extra.address || "100 Franklin St Brooklyn, NY 11222",
      neighborhood: "Greenpoint",
      primary_genre: { name: primary },
      price_level: price,
      hours: sat("08", "21"),
      localities: [{ name: "11222", place: "ZCTA" }, { name: "Greenpoint", place: "neighbourhood" }, { name: "Brooklyn", place: "borough" }],
    },
    query: { affinity: 0.8, explainability: { "signal.interests.entities": [{ entity_id: "E-KLARA", score: 0.6 }, { entity_id: "E-ITML", score: 0.4 }] } },
  };
}
// Two places per kind fit under $40 (price level <= 2); the third is over budget at every cap tested here.
const PLACES = [
  place("OK-BOOK-1", "Word", "Book store", 1),
  place("OK-BOOK-2", "Book Nook", "Book store", 2),
  place("OK-BOOK-3", "Golden Pages", "Book store", 3),
  place("OK-CAFE-1", "Odd Fox Coffee", "Coffee shop", 2),
  place("OK-CAFE-2", "Cafe Moto", "Coffee shop", 1),
  place("OK-CAFE-3", "Plush Cafe", "Coffee shop", 3),
  place("OK-REC-1", "Rough Trade", "Record store", 1),
  place("OK-REC-2", "Vinyl Alley", "Record store", 2),
  place("OK-REC-3", "Gold Records", "Record store", 3),
];
const PLACE_IDS = new Set(PLACES.map((p) => p.entity_id));
const OVER_BUDGET = new Set(["OK-BOOK-3", "OK-CAFE-3", "OK-REC-3"]);

function catalogue(env) {
  const q = makeQloo();
  q.override = (u) => {
    if (u.pathname !== "/v2/insights" || u.searchParams.get("filter.type") !== "urn:entity:place") return null;
    return new Response(JSON.stringify({ results: { entities: PLACES } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  setQloo(q, env);
  return q;
}
async function planStream(env, cookie, body) {
  const r = await call(worker, env, "POST", "/api/plan", { body, cookie });
  const msgs = r.text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return { status: r.status, msgs, plan: (msgs.find((m) => m.type === "plan") || {}).plan, err: msgs.find((m) => m.type === "error") };
}

// ---------- 1. area + $40 + a kept-card reason on every stop ----------
test("go-out: stated area and $40 cap; every stop keeps a real place id and a noted-card reason", async () => {
  const env = makeEnv({ READ_TIMEOUT_MS: "100" });
  const q = catalogue(env);
  // Stored defaults differ from the form: the asked area and cap must win.
  const { token, user } = newUser(env, "UB1", "Williamsburg, Brooklyn", 100);
  seedCards(env, user.id);

  const { status, plan, err } = await planStream(env, token, {
    text: "A bookstore and a coffee, then a record store",
    area: "Greenpoint, Brooklyn", budget: 40, when: "Saturday afternoon", mode: "out",
  });
  assert.equal(status, 200);
  assert.equal(err, undefined, JSON.stringify(err));
  assert.ok(q.calls.length > 0, "the stubbed catalogue was never asked for places");

  assert.match(plan.header, /Greenpoint/, "header lost the asked area: " + plan.header);
  assert.match(plan.header, /under \$40/, "header lost the $40 cap: " + plan.header);
  assert.equal(plan.mode, undefined, "go-out plans carry no stay-in mode");
  assert.equal(plan.stops.length, 3, "one stop per asked kind");
  assert.equal(plan.notice, null, "all stops are in Greenpoint, so no spillover notice");

  const seedCardIds = new Set(SEEDS.map((_, i) => "C" + i + user.id));
  for (const s of plan.stops) {
    assert.ok(typeof s.qloo_id === "string" && PLACE_IDS.has(s.qloo_id), "not a real catalogue place id: " + JSON.stringify(s.qloo_id));
    assert.ok(!OVER_BUDGET.has(s.qloo_id), "over-budget place leaked into a $40 plan: " + s.name);
    assert.ok(s.price_level == null || s.price_level <= 2, "stop above the $40 price band: " + s.name);
    // The reason shown for a stop is the kept-card trace: a note-backed card the user already has.
    assert.ok(Array.isArray(s.sources) && s.sources.length >= 1, `${s.name} carries no kept-card source`);
    for (const src of s.sources) {
      assert.ok(seedCardIds.has(src.card_id), `${s.name} cites a card the user never kept: ${JSON.stringify(src)}`);
      assert.ok(SEED_NAMES.includes(src.name), `${s.name} cites an unkept name: ${src.name}`);
    }
    assert.ok(typeof s.from_notes === "string" && s.from_notes.trim(), `${s.name} has no reason line`);
    assert.match(s.from_notes, /^You /, `${s.name} reason is not phrased as the user's own notes: ${s.from_notes}`);
    assert.ok(SEED_NAMES.some((n) => s.from_notes.includes(n)), `${s.name} reason names no kept card: ${s.from_notes}`);
    assert.ok(typeof s.read === "string" && s.read.trim(), `${s.name} has no readable line`);
  }
  for (const query of plan.receipt.queries) assert.equal(query["filter.location.query"], "Greenpoint, Brooklyn");
  assert.equal(plan.receipt.provenance.live > 0, true, "no live catalogue query recorded");
});

// ---------- 2. the cap is a hard filter, not decoration ----------
test("go-out: a $20 cap keeps only price level 1, even when the stored default is $100", async () => {
  const env = makeEnv({ READ_TIMEOUT_MS: "100" });
  catalogue(env);
  const { token, user } = newUser(env, "UB2", "Greenpoint, Brooklyn", 100);
  seedCards(env, user.id);

  const { plan, err } = await planStream(env, token, {
    text: "A bookstore and a coffee, then a record store",
    area: "Greenpoint, Brooklyn", budget: 20, when: "Saturday afternoon", mode: "out",
  });
  assert.equal(err, undefined, JSON.stringify(err));
  assert.match(plan.header, /under \$20/);
  assert.ok(plan.stops.length >= 1);
  for (const s of plan.stops) {
    assert.equal(s.price_level, 1, `${s.name} slipped past the $20 cap (price level ${s.price_level})`);
    assert.ok(!OVER_BUDGET.has(s.qloo_id), `${s.name} is over budget`);
  }
  assert.deepEqual(new Set(plan.stops.map((s) => s.name)), new Set(["Word", "Cafe Moto", "Rough Trade"]));
});

// ---------- 3. an empty notebook gets words, not a 500 ----------
test("go-out: empty seeds -> a clear too_few message on the stream, no plan row, no 500", async () => {
  const env = makeEnv({ READ_TIMEOUT_MS: "100" });
  const q = catalogue(env);
  const { token, user } = newUser(env, "UB3");

  const { status, msgs, plan, err } = await planStream(env, token, {
    text: "A bookstore and a coffee", area: "Greenpoint, Brooklyn", when: "Saturday afternoon", mode: "out",
  });
  assert.equal(status, 200, "the NDJSON route must answer 200 and explain, not 500");
  assert.equal(plan, undefined, "an empty notebook must not get a plan");
  assert.ok(err, "no error message reached the client: " + JSON.stringify(msgs));
  assert.equal(err.state, "too_few");
  assert.match(err.text, /more things you love|Mark a couple of cards/i, "message is not actionable: " + err.text);
  assert.equal(q.calls.length, 0, "nothing to plan from still hit the catalogue");
  const saved = env.DB.q("SELECT COUNT(*) c FROM plans WHERE user_id=?", user.id)[0].c;
  assert.equal(saved, 0, "a failed plan was persisted");
});

// ---------- 4. the phrase the kept-card reason renders with ----------
test("client copy: the kept-card reason still reads 'because you kept' / 因为你记过", () => {
  const result = readFileSync(new URL("../src/app/js/plan.result.js", import.meta.url), "utf8");
  assert.match(result, /t\("because you kept"\)/, "the kept-card reason copy moved or was renamed");
  const zh = readFileSync(new URL("../src/app/js/i18n.extra.js", import.meta.url), "utf8");
  assert.match(zh, /"because you kept":\s*"因为你记过"/, "the zh kept-card reason copy is missing");
});
