// Prod caps/fallback contract for the sample notebook: when Qloo or the model are capped or failing, the
// sample user still gets a plan and a comparison (a saved result plus an honest "Busy right now" notice),
// never an error line or a blank. Offline harness only, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, setQloo, makeQloo, call } from "./adversarial/harness.mjs";
const { default: worker } = await import("../src/index.js");

const EN = "Busy right now — showing a saved result.";
const ZH = "现在有点忙，先给你看保存过的结果。";

// A user row by hand (the sample flag is what the fallback keys off).
function userEnv(sample) {
  const env = makeEnv();
  const q = setQloo(makeQloo(), env);
  q.mode = "500";
  env.AI.down = true;
  env.DB._db.prepare("INSERT INTO users (id,token,sample,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?,?)")
    .run("S1", "tS1", sample, "Greenpoint, Brooklyn", 40, "Saturday afternoon", Date.now());
  return env;
}
const put = (env, key, value) => env.DB._db.prepare("INSERT OR REPLACE INTO llm_cache (key,value,created_at) VALUES (?,?,?)").run(key, JSON.stringify(value), Date.now());
const lines = (text) => text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
const planEvent = (text) => lines(text).find((x) => x.type === "plan");

// ---------- (1) a successful sample plan is saved for the fallback ----------
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
function seedCards(env, U, sample) {
  const db = env.DB._db, now = Date.now();
  db.prepare("INSERT INTO users (id,token,sample,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?,?)").run(U, "t" + U, sample, "Greenpoint, Brooklyn", 40, "Saturday afternoon", now);
  [["E-KLARA", "Klara and the Sun", "book"], ["E-ITML", "In the Mood for Love", "film"], ["E-BIGTHIEF", "Big Thief", "music"], ["E-NORWOOD", "Norwegian Wood", "book"]]
    .forEach(([qlooid, name, type], i) => {
      db.prepare("INSERT INTO cards (id,user_id,qloo_id,name,type,heart,created_at) VALUES (?,?,?,?,?,?,?)").run("C" + i + U, U, qlooid, name, type, 1, now);
      db.prepare("INSERT INTO footprints (id,user_id,card_id,note_id,kind,sentiment,quote,created_at) VALUES (?,?,?,?,?,?,?,?)").run("F" + i + U, U, "C" + i + U, null, "note", "positive", "a line I wrote about " + name, now - i * 1000);
    });
}

test("a successful sample plan is cached, then served with the busy notice when Qloo fails", async () => {
  const env = makeEnv();
  const q = setQloo(makeQloo(), env);
  q.places = [
    place("OK-BOOK", "Word", "Book store", ["Book store"], { address: "126 Franklin St Brooklyn, NY 11222", loc: { lat: 40.729, lon: -73.957 } }),
    place("OK-CAFE", "Odd Fox Coffee", "Coffee shop", ["Coffee shop"], { address: "984 Manhattan Ave Brooklyn, NY 11222", loc: { lat: 40.731, lon: -73.954 } }),
    place("OK-REC", "Rough Trade", "Record store", ["Record store"], { address: "64 N 9th St Brooklyn, NY 11249", hood: "Greenpoint", loc: { lat: 40.721, lon: -73.957 } }),
  ];
  q.override = (u) => {
    if (u.pathname !== "/v2/insights" || u.searchParams.get("filter.type") !== "urn:entity:place") return null;
    return new Response(JSON.stringify({ results: { entities: q.places } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  seedCards(env, "S1", 1);

  const ok = await call(worker, env, "POST", "/api/plan", { cookie: "tS1", body: { mode: "out", area: "Greenpoint, Brooklyn", when: "Saturday afternoon", budget: 40, lang: "en" } });
  const live = planEvent(ok.text);
  assert.ok(live, "the sample plan did not go through: " + ok.text.slice(0, 300));
  assert.equal(live.plan.busy_notice, undefined, "a live plan carries no busy notice");
  const saved = env.DB.q("SELECT value FROM llm_cache WHERE key=?", "sample-saved:v1:plan:out:en")[0];
  assert.ok(saved, "a successful sample plan must be cached under sample-saved:v1:plan:out:en");
  assert.equal(JSON.parse(saved.value).stops.length, live.plan.stops.length, "the cached copy is the plan as sent to the client");

  // Now the catalogue dies and the cached place pools are gone, so planning must throw.
  q.override = null; q.mode = "500";
  env.DB._db.prepare("DELETE FROM llm_cache WHERE key LIKE 'qp2:%'").run();
  const busy = await call(worker, env, "POST", "/api/plan", { cookie: "tS1", body: { mode: "out", area: "Greenpoint, Brooklyn", when: "Saturday afternoon", budget: 40, lang: "en" } });
  assert.ok(!lines(busy.text).some((x) => x.type === "error"), "the sample notebook streamed an error: " + busy.text.slice(0, 300));
  const pl = planEvent(busy.text);
  assert.ok(pl && Array.isArray(pl.plan.stops) && pl.plan.stops.length, "the saved plan was not served");
  assert.equal(pl.plan.busy_notice, EN);
  assert.notEqual(pl.plan.id, live.plan.id, "the served copy needs a new id");
  assert.deepEqual(pl.plan.stops.map((s) => s.name), live.plan.stops.map((s) => s.name), "the saved stops must be served unchanged");
  const g = await call(worker, env, "GET", "/api/plan/" + pl.plan.id, { cookie: "tS1" });
  assert.equal(g.status, 200, "the served plan must be stored for the user");
  assert.equal(g.json.plan.busy_notice, EN);
});

// ---------- (3) a successful sample plain block is saved for the compare fallback ----------
test("a successful sample plain block is cached for later", async () => {
  const env = makeEnv();
  const q = setQloo(makeQloo(), env);
  const MEDIA = ["Chungking Express", "Tokyo Story", "Happy Together", "Yi Yi"].map((n, i) => ({
    entity_id: "M-" + i, name: n, popularity: 0.9 - i * 0.01,
    tags: [{ name: "Drama", type: "urn:tag:genre:media" }],
    properties: { release_year: 1990 + i, image: { url: `https://images.qloo.com/i/M${i}.jpg` } },
    query: { affinity: 0.8, explainability: { "signal.interests.entities": [{ entity_id: "E-ITML", score: 0.7 }] } },
  }));
  q.override = (u) => {
    const t = u.searchParams.get("filter.type") || "";
    return u.pathname === "/v2/insights" && /urn:entity:(movie|artist|book|tv_show|podcast)/.test(t)
      ? new Response(JSON.stringify({ results: { entities: MEDIA } }), { status: 200, headers: { "content-type": "application/json" } })
      : null;
  };
  env.DB._db.prepare("INSERT INTO users (id,token,sample,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?,?)").run("S1", "tS1", 1, "Greenpoint, Brooklyn", 40, "Saturday afternoon", Date.now());
  env.DB._db.prepare("INSERT INTO plans (id,user_id,request,plan,pool,saved,created_at) VALUES (?,?,?,?,?,0,?)")
    .run("P2", "S1", JSON.stringify({ mode: "in", lang: "en" }), JSON.stringify({ id: "P2", mode: "in", lang: "en", picks: [{ name: "In the Mood for Love", kind: "film", qloo_id: "E-ITML", why_line: "Because you kept In the Mood for Love." }], receipt: { seeds: [{ name: "In the Mood for Love", qloo_id: "E-ITML" }] } }), "[]", Date.now());
  // The harness AI mock answers the plain pick prompt with an empty object; give it picks here.
  env.AI.raw = (sys) => (/You suggest things to watch/.test(sys) ? { picks: [{ name: "Lost in Translation", kind: "film", why: "Quiet and close to the film you keep." }] } : {});
  const r = await call(worker, env, "POST", "/api/plan/P2/plain", { cookie: "tS1", body: {} });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.plain.picks[0].name, "Lost in Translation");
  assert.equal(r.json.plain.busy_notice, undefined, "a fresh comparison carries no busy notice");
  const saved = env.DB.q("SELECT value FROM llm_cache WHERE key=?", "sample-saved:v1:plain:in:en")[0];
  assert.ok(saved, "a successful sample plain block must be cached under sample-saved:v1:plain:in:en");
  assert.equal(JSON.parse(saved.value).picks[0].name, "Lost in Translation");
});

// ---------- (3) the plain comparison falls back to a saved block ----------
test("sample /plain answers the saved comparison + busy notice when the model is down", async () => {
  const env = userEnv(1);
  env.DB._db.prepare("INSERT INTO plans (id,user_id,request,plan,pool,saved,created_at) VALUES (?,?,?,?,?,0,?)")
    .run("P1", "S1", JSON.stringify({ mode: "in", lang: "en" }), JSON.stringify({ id: "P1", mode: "in", lang: "en", picks: [{ name: "Chungking Express", kind: "film", qloo_id: "X1", why_line: "Because you kept In the Mood for Love." }], receipt: { seeds: [{ name: "In the Mood for Love", qloo_id: "E-ITML" }] } }), "[]", Date.now());
  put(env, "sample-saved:v1:plain:in:en", { model: "m", lang: "en", picks: [{ name: "Lost in Translation", kind: "film", why: "Quiet." }] });
  const r = await call(worker, env, "POST", "/api/plan/P1/plain", { cookie: "tS1", body: {} });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.plain.picks[0].name, "Lost in Translation");
  assert.equal(r.json.plain.busy_notice, EN);
});

// ---------- (2) stay-in + zh go-out plan fallbacks ----------
test("sample stay-in serves the saved plan with the exact English busy notice", async () => {
  const env = userEnv(1);
  put(env, "sample-saved:v1:plan:in:en", { id: "OLD1", mode: "in", lang: "en", picks: [{ name: "Chungking Express", kind: "film", why_line: "Because you kept In the Mood for Love." }], receipt: { seeds: [] } });
  const r = await call(worker, env, "POST", "/api/plan", { cookie: "tS1", body: { mode: "in", text: "I want to watch a film", lang: "en" } });
  const ls = lines(r.text), pl = planEvent(r.text);
  assert.ok(!ls.some((x) => x.type === "error"), "sample stay-in still streamed an error: " + r.text.slice(0, 200));
  assert.ok(pl, "no plan event");
  assert.equal(pl.plan.picks[0].name, "Chungking Express");
  assert.ok(pl.plan.id && pl.plan.id !== "OLD1", "the served plan needs a new id");
  assert.equal(pl.plan.busy_notice, EN);
  const g = await call(worker, env, "GET", "/api/plan/" + pl.plan.id, { cookie: "tS1" });
  assert.equal(g.status, 200, "the served plan must be readable back");
});

test("sample zh go-out serves the saved plan with the Chinese busy notice", async () => {
  const env = userEnv(1);
  put(env, "sample-saved:v1:plan:out:zh", { id: "OLD2", mode: "out", lang: "zh", stops: [{ name: "Word Bookstore", kind: "bookstore", coords: { lat: 40.73, lon: -73.95 } }], receipt: { seeds: [] } });
  const r = await call(worker, env, "POST", "/api/plan", { cookie: "tS1", body: { mode: "out", area: "Greenpoint", when: "Saturday afternoon", budget: 40, lang: "zh" } });
  const pl = planEvent(r.text);
  assert.ok(pl && pl.plan.busy_notice === ZH, "zh go-out fallback wrong: " + r.text.slice(0, 200));
  assert.equal(pl.plan.stops[0].name, "Word Bookstore");
});

test("non-sample users keep the honest error line even when a saved key exists", async () => {
  const env = userEnv(0);
  put(env, "sample-saved:v1:plan:in:en", { id: "OLD3", mode: "in", picks: [{ name: "X", kind: "film" }] });
  const r = await call(worker, env, "POST", "/api/plan", { cookie: "tS1", body: { mode: "in", text: "I want to watch a film", lang: "en" } });
  assert.ok(lines(r.text).some((x) => x.type === "error"), "non-sample users must keep the honest error line");
  assert.equal(planEvent(r.text), undefined, "non-sample users must not receive a saved plan");
});
