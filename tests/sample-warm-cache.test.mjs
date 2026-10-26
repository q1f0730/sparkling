// Prod 10-26: every judge opens a NEW sample notebook (new user id, new plan ids), so the "Same notes,
// no Qloo" compare must not be recomputed per plan for sample users. For user.sample only, a compare is
// cached under a user-independent "sample-plain:v1:" key (mode, lang, area, seed names, stop/pick names),
// looked up before the model runs, written to that plan's plan.plain on a hit, and stored after a
// successful block. Non-sample users never share compare answers.
// Offline: tests/adversarial/harness.mjs mocks D1, Workers AI and Qloo (no real network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, call } from "./adversarial/harness.mjs";
const { default: worker } = await import("../src/index.js");

const SEEDS = [{ name: "In the Mood for Love", qloo_id: "E-ITML" }, { name: "Big Thief", qloo_id: "E-BT" }];
const MODEL_IN = { picks: [{ name: "Lost in Translation", kind: "film", why: "Quiet, like your notes." }, { name: "Blue", kind: "music", why: "Slow and warm." }] };
const MODEL_OUT = { stops: [{ name: "Some Cafe", kind: "cafe", why: "It sounds nice." }, { name: "Invented Books", kind: "bookstore", why: "You like books." }] };

function addUser(env, U, sample, mode, seeds = SEEDS) {
  const db = env.DB._db, now = Date.now();
  db.prepare("INSERT INTO users (id,token,sample,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?,?)")
    .run(U, "t" + U, sample, "Greenpoint, Brooklyn", 40, "Saturday afternoon", now);
  const plan = mode === "in"
    ? {
      id: "P" + U, mode, lang: "en",
      picks: [{ name: "Chungking Express", kind: "film", qloo_id: "X1", why_line: "Because you kept In the Mood for Love." }, { name: "Paterson", kind: "film", qloo_id: "X3", why_line: "" }],
      receipt: { seeds },
    }
    : {
      id: "P" + U, mode, lang: "en",
      stops: [{ name: "Word Bookstore", kind: "bookstore", coords: { lat: 40.73, lon: -73.95 }, from_notes: "You came back to In the Mood for Love 3 times." }, { name: "Cafe Grumpy", kind: "cafe", coords: { lat: 40.729, lon: -73.954 } }],
      receipt: { seeds },
    };
  db.prepare("INSERT INTO plans (id,user_id,request,plan,pool,saved,created_at) VALUES (?,?,?,?,?,0,?)")
    .run("P" + U, U, JSON.stringify({ area: "Greenpoint, Brooklyn", mode, lang: "en" }), JSON.stringify(plan), "[]", now);
}

const plainOf = (r) => (r.json && r.json.plain) || {};
const listKey = (mode) => (mode === "in" ? "picks" : "stops");
const namesOf = (r, mode) => (plainOf(r)[listKey(mode)] || []).map((x) => x.name);
const savedPlan = (env, id) => JSON.parse(env.DB._db.prepare("SELECT plan FROM plans WHERE id=?").get(id).plan);
const sampleRows = (env) => env.DB._db.prepare("SELECT COUNT(*) n FROM llm_cache WHERE key LIKE 'sample-plain:v1:%'").get().n;

test("stay-in: a second sample notebook reuses the compare with zero model calls", async () => {
  const env = makeEnv(), mode = "in";
  env.AI.raw = () => MODEL_IN;
  addUser(env, "A", 1, mode);
  addUser(env, "B", 1, mode);
  const one = await call(worker, env, "POST", "/api/plan/PA/plain", { cookie: "tA", body: {} });
  assert.equal(one.status, 200);
  assert.equal(env.AI.calls, 1, "the first sample compare asks the model once");
  assert.deepEqual(namesOf(one, mode), ["Lost in Translation", "Blue"]);
  const after = env.AI.calls;
  const two = await call(worker, env, "POST", "/api/plan/PB/plain", { cookie: "tB", body: {} });
  assert.equal(two.status, 200);
  assert.equal(env.AI.calls, after, "the second sample notebook must not call the model");
  assert.deepEqual(namesOf(two, mode), namesOf(one, mode), "the reused picks are the same");
  assert.ok(plainOf(two).verdict, "a reused compare still carries its verdict");
  const row = savedPlan(env, "PB");
  assert.ok(row.plain, "the reused compare is written to the second plan's plan.plain");
  assert.equal(sampleRows(env), 1, "one sample-plain:v1: cache row");
  // The second plan is instant from then on as well.
  const again = await call(worker, env, "POST", "/api/plan/PB/plain", { cookie: "tB", body: {} });
  assert.equal(env.AI.calls, after, "a plan written from the cache stays instant");
  assert.deepEqual(namesOf(again, mode), namesOf(one, mode));
});

test("go-out: the shared sample compare keeps its stop names and place checks", async () => {
  const env = makeEnv(), mode = "out";
  env.AI.raw = () => MODEL_OUT;
  addUser(env, "A", 1, mode);
  addUser(env, "B", 1, mode);
  const one = await call(worker, env, "POST", "/api/plan/PA/plain", { cookie: "tA", body: {} });
  assert.equal(one.status, 200);
  assert.equal(env.AI.calls, 1);
  assert.deepEqual(namesOf(one, mode), ["Some Cafe", "Invented Books"]);
  assert.equal(plainOf(one).checked, 3, "the first compare ran the place checks");
  const after = env.AI.calls;
  const two = await call(worker, env, "POST", "/api/plan/PB/plain", { cookie: "tB", body: {} });
  assert.equal(two.status, 200);
  assert.equal(env.AI.calls, after, "the second sample notebook must not call the model");
  assert.deepEqual(namesOf(two, mode), namesOf(one, mode));
  assert.ok(plainOf(two).verdict, "a reused compare still carries its verdict");
  assert.equal(plainOf(two).checked, 3, "the reused stops keep their checks");
  assert.ok(savedPlan(env, "PB").plain, "the reused compare is written to the second plan");
  assert.equal(sampleRows(env), 1);
});

test("non-sample users keep their own compare", async () => {
  const env = makeEnv(), mode = "in";
  env.AI.raw = () => MODEL_IN;
  addUser(env, "C", 0, mode);
  addUser(env, "D", 0, mode);
  const one = await call(worker, env, "POST", "/api/plan/PC/plain", { cookie: "tC", body: {} });
  assert.equal(one.status, 200);
  assert.equal(env.AI.calls, 1);
  await call(worker, env, "POST", "/api/plan/PD/plain", { cookie: "tD", body: {} });
  assert.equal(env.AI.calls, 2, "a non-sample user never reads the sample cache");
  assert.equal(sampleRows(env), 0, "a non-sample user never writes the sample cache");
});

test("a sample notebook with different seeds gets its own compare", async () => {
  const env = makeEnv(), mode = "in";
  env.AI.raw = () => MODEL_IN;
  addUser(env, "A", 1, mode);
  addUser(env, "B", 1, mode, [{ name: "Solaris", qloo_id: "E-SOL" }]);
  await call(worker, env, "POST", "/api/plan/PA/plain", { cookie: "tA", body: {} });
  assert.equal(env.AI.calls, 1);
  await call(worker, env, "POST", "/api/plan/PB/plain", { cookie: "tB", body: {} });
  assert.equal(env.AI.calls, 2, "different seed names are a different key");
  assert.equal(sampleRows(env), 2);
});
