// Demo mainline: the correction beat on a plan — "不适合我，重新计划" / "not for me, re-plan without it".
// A card behind a stop is marked heart=-1, POST /api/plan replays the same request and comes back with a
// diff that names the card and a plan that no longer cites it; restoring the card sets its heart back to 0.
// Stay-in plans diff picks (diff.unit === "pick"). Unknown plans and foreign cards answer 404.
// Offline: the harness runs the real Worker against in-memory D1, a scripted Qloo and a stubbed model.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeEnv, makeQloo, setQloo, call } from "./adversarial/harness.mjs";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
const { default: worker } = await import("../src/index.js");

// ---------- harness helpers ----------
function newUser(env, area = "Greenpoint, Brooklyn") {
  const U = "U" + Math.random().toString(36).slice(2, 10);
  env.DB._db.prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)")
    .run(U, "t" + U, area, 40, "Saturday afternoon", Date.now());
  return { id: U, token: "t" + U };
}
function seedCards(env, U, cards) {
  const db = env.DB._db, now = Date.now();
  cards.forEach(([qloo_id, name, type], i) => {
    db.prepare("INSERT INTO cards (id,user_id,qloo_id,name,type,heart,created_at) VALUES (?,?,?,?,?,?,?)")
      .run("C" + i + U, U, qloo_id, name, type, 1, now);
    db.prepare("INSERT INTO footprints (id,user_id,card_id,note_id,kind,sentiment,quote,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run("F" + i + U, U, "C" + i + U, null, "note", "positive", "a line I wrote about " + name, now - i * 1000);
  });
}
const heartOf = (env, id) => env.DB._db.prepare("SELECT heart FROM cards WHERE id=?").get(id)?.heart;

// POST /api/plan streams NDJSON log lines then one {type:"plan"} line (or {type:"error"}).
async function planStream(env, cookie, body) {
  const r = await call(worker, env, "POST", "/api/plan", { body, cookie });
  const msgs = r.text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return { status: r.status, msgs, plan: (msgs.find((m) => m.type === "plan") || {}).plan, err: msgs.find((m) => m.type === "error") };
}

// ---------- go-out fixtures (place stubs from tests/demo-mainline-plan.test.mjs) ----------
const cat = (name) => ({ name, type: "urn:tag:category:place" });
const sat = (o, c) => ({ saturday: [{ opens: `T${o}:00`, closes: `T${c}:00`, closed: false }] });
function place(id, name, primary, cats, extra = {}) {
  return {
    entity_id: id, name, popularity: 0.8,
    location: extra.loc || { lat: 40.7295, lon: -73.9540 },
    tags: [...cats.map(cat), { name: "Afternoon", type: "urn:tag:time_of_day_fit:qloo" }, { name: "Cozy", type: "urn:tag:ambience:qloo" }],
    properties: {
      address: extra.address || "100 Franklin St Brooklyn, NY 11222", neighborhood: extra.hood || "Greenpoint",
      primary_genre: { name: primary }, price_level: 1, is_closed: !!extra.closed, hours: extra.hours === undefined ? sat("08", "19") : extra.hours,
      localities: extra.localities || [{ name: "11222", place: "ZCTA" }, { name: "Greenpoint", place: "neighbourhood" }, { name: "Brooklyn", place: "borough" }],
    },
    query: { affinity: 0.8, explainability: { "signal.interests.entities": [{ entity_id: "E-KLARA", score: 0.6 }, { entity_id: "E-ITML", score: 0.4 }] } },
  };
}
function qlooWithPlaces() {
  const q = makeQloo();
  q.places = [
    place("OK-BOOK", "Word", "Book store", ["Book store"], { address: "126 Franklin St Brooklyn, NY 11222", loc: { lat: 40.729, lon: -73.957 } }),
    place("OK-CAFE", "Odd Fox Coffee", "Coffee shop", ["Coffee shop"], { address: "984 Manhattan Ave Brooklyn, NY 11222", loc: { lat: 40.731, lon: -73.954 } }),
    place("OK-REC", "Rough Trade", "Record store", ["Record store"], { address: "64 N 9th St Brooklyn, NY 11249", loc: { lat: 40.721, lon: -73.957 } }),
  ];
  q.override = (u) => {
    if (u.pathname !== "/v2/insights" || u.searchParams.get("filter.type") !== "urn:entity:place") return null;
    return new Response(JSON.stringify({ results: { entities: q.places } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return q;
}

const OUT_CARDS = [["E-KLARA", "Klara and the Sun", "book"], ["E-ITML", "In the Mood for Love", "film"], ["E-BIGTHIEF", "Big Thief", "music"], ["E-NORWOOD", "Norwegian Wood", "book"]];
const IN_CARDS = [["E-ITML", "In the Mood for Love", "film"], ["E-HER", "Her", "film"], ["E-BIGTHIEF", "Big Thief", "music"], ["E-KLARA", "Klara and the Sun", "book"]];

test("go out: not-for-me re-plans with a diff naming the card, then restoring puts its heart back", async () => {
  const env = makeEnv(); setQloo(qlooWithPlaces(), env);
  const { id: U, token } = newUser(env);
  seedCards(env, U, OUT_CARDS);

  const first = await planStream(env, token, { text: "", mode: "out", area: "Greenpoint, Brooklyn", mood: "familiar" });
  assert.equal(first.err, undefined, JSON.stringify(first.err));
  const plan = first.plan;
  assert.ok(plan && plan.id, "the streamed plan has no id");
  assert.equal(plan.stops.length, 3, "the demo afternoon should walk three stops");

  const stop = plan.stops.find((s) => Array.isArray(s.sources) && s.sources.length);
  assert.ok(stop, "no stop carries card sources");
  const disliked = stop.sources[0];
  assert.ok(disliked.card_id && disliked.name, "stop source is missing its card");
  assert.equal(heartOf(env, disliked.card_id), 1);

  // "Not for me, re-plan without it." — the same request, replayed without that card.
  const redo = await planStream(env, token, { redo_from: plan.id, dislike_card: disliked.card_id });
  assert.equal(redo.err, undefined, JSON.stringify(redo.err));
  assert.equal(heartOf(env, disliked.card_id), -1, "the disliked card's heart was not set to -1");
  assert.equal(redo.plan.stops.length, 3, "the re-plan lost its stops");
  assert.ok(redo.plan.diff, "the re-plan has no diff");
  assert.equal(redo.plan.diff.card, disliked.name, "the diff does not name the disliked card");
  assert.equal(redo.plan.diff.from, plan.id);
  assert.equal(redo.plan.diff.restore, false);
  assert.ok(redo.plan.diff.changes.length + redo.plan.diff.recredit.length > 0, "the diff shows no visible change");
  assert.ok(redo.plan.left_out.includes(disliked.name), "the left-out list does not name the disliked card");
  for (const s of redo.plan.stops) {
    assert.ok(
      !(s.sources || []).some((x) => x.card_id === disliked.card_id || x.name === disliked.name),
      `${s.name} still cites the disliked card ${JSON.stringify(disliked.name)}`,
    );
  }

  // Put it back: the card's heart returns to 0 and the diff says it was a restore.
  const back = await planStream(env, token, { redo_from: redo.plan.id, restore_card: disliked.card_id });
  assert.equal(back.err, undefined, JSON.stringify(back.err));
  assert.equal(heartOf(env, disliked.card_id), 0, "restoring the card did not put its heart back to 0");
  assert.equal(back.plan.diff.card, disliked.name);
  assert.equal(back.plan.diff.restore, true);
  assert.ok(!back.plan.left_out.includes(disliked.name), "the restored card is still listed as left out");
});

test("not-for-me refusals: unknown redo_from is 404 gone, a foreign card is 404 not found", async () => {
  const env = makeEnv(); setQloo(qlooWithPlaces(), env);
  const { id: U, token } = newUser(env);
  seedCards(env, U, OUT_CARDS);
  const first = await planStream(env, token, { text: "", mode: "out", area: "Greenpoint, Brooklyn", mood: "familiar" });
  assert.equal(first.err, undefined, JSON.stringify(first.err));
  const plan = first.plan;
  assert.ok(plan && plan.id);
  const mine = env.DB._db.prepare("SELECT id FROM cards WHERE user_id=? ORDER BY id").get(U).id;

  // Unknown plan -> 404 "that plan is gone", and nothing is mutated.
  const gone = await call(worker, env, "POST", "/api/plan", { body: { redo_from: "nosuchplan000000", dislike_card: mine }, cookie: token });
  assert.equal(gone.status, 404);
  assert.equal(gone.json?.error, "that plan is gone");
  assert.equal(heartOf(env, mine), 1, "a refused redo changed a card's heart");

  // A card owned by someone else -> 404 "card not found".
  const other = newUser(env, "Greenpoint, Brooklyn");
  seedCards(env, other.id, [["E-SOLARIS-72", "Solaris", "film"]]);
  const foreignId = env.DB._db.prepare("SELECT id FROM cards WHERE user_id=?").get(other.id).id;
  const foreign = await call(worker, env, "POST", "/api/plan", { body: { redo_from: plan.id, dislike_card: foreignId }, cookie: token });
  assert.equal(foreign.status, 404);
  assert.equal(foreign.json?.error, "card not found");
  assert.equal(heartOf(env, foreignId), 1, "a foreign card was mutated");
});

// ---------- stay-in fixtures (media stubs from tests/stayin.test.mjs) ----------
const MOVIES = ["Chungking Express", "Tokyo Story", "Happy Together", "Yi Yi", "Fallen Angels", "In the Mood for Love"].map((n, i) => ({
  entity_id: i === 5 ? "E-ITML" : "M-" + i, name: n, popularity: 0.9 - i * 0.01,
  tags: [{ name: "Drama", type: "urn:tag:genre:media" }, { name: "Intimate", type: "urn:tag:plot:qloo" }, { name: "Pager", type: "urn:tag:keyword:media" }],
  properties: { release_year: 1990 + i, image: { url: `https://images.qloo.com/i/M${i}.jpg` }, collaborators: ["Director " + i], short_descriptions: [{ value: "A one-line summary " + i + ".", languages: ["en"] }] },
  query: { affinity: 0.8, explainability: { "signal.interests.entities": [{ entity_id: "E-ITML", score: 0.7 }, { entity_id: "E-HER", score: 0.3 }] } },
}));
function qlooWithMedia() {
  const q = makeQloo();
  q.override = (u) => {
    if (u.pathname === "/v2/insights" && /urn:entity:(movie|artist|book|tv_show|podcast)/.test(u.searchParams.get("filter.type") || "")) {
      const t = u.searchParams.get("filter.type");
      const ents = t === "urn:entity:movie" ? MOVIES : MOVIES.map((m, i) => ({ ...m, entity_id: t + i, name: t.split(":").pop() + " " + i }));
      return new Response(JSON.stringify({ results: { entities: ents } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return null;
  };
  return q;
}

test("stay in: not-for-me re-plans with a pick diff and no pick citing the card", async () => {
  const env = makeEnv(); setQloo(qlooWithMedia(), env);
  const { id: U, token } = newUser(env);
  seedCards(env, U, IN_CARDS);

  const first = await planStream(env, token, { text: "staying in tonight", mode: "in", mood: "familiar" });
  assert.equal(first.err, undefined, JSON.stringify(first.err));
  const plan = first.plan;
  assert.equal(plan.mode, "in");
  assert.equal(plan.picks.length, 3);
  assert.equal(plan.stops.length, 0);

  const pick = plan.picks.find((p) => Array.isArray(p.sources) && p.sources.length);
  assert.ok(pick, "no pick carries card sources");
  const disliked = pick.sources[0];
  assert.ok(disliked.card_id && disliked.name);

  const redo = await planStream(env, token, { redo_from: plan.id, dislike_card: disliked.card_id });
  assert.equal(redo.err, undefined, JSON.stringify(redo.err));
  assert.equal(heartOf(env, disliked.card_id), -1);
  assert.equal(redo.plan.mode, "in");
  assert.equal(redo.plan.diff.unit, "pick", "a stay-in re-plan must diff picks");
  assert.equal(redo.plan.diff.card, disliked.name);
  assert.ok(redo.plan.left_out.includes(disliked.name));
  for (const p of redo.plan.picks) {
    assert.ok(
      !(p.sources || []).some((x) => x.card_id === disliked.card_id || x.name === disliked.name),
      `${p.name} still cites the disliked card`,
    );
  }
});
