// Walk 10-25 17:33: a stay-in plain comparison took 25 s because llmJSON tries its model chain with no
// deadline. Both plain branches (stay-in picks, go-out stops) must race the model call against
// Number(env.PLAIN_TIMEOUT_MS) || 9000 ms, answer 200 at once on timeout with no items, and never cache
// a timed-out answer on the plan row. Other model errors keep the quota note.
// Offline: tests/adversarial/harness.mjs mocks D1, Workers AI and Qloo (no real network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, call } from "./adversarial/harness.mjs";
const { default: worker } = await import("../src/index.js");

const SEEDS = [{ name: "In the Mood for Love", qloo_id: "E-ITML" }];
const NOTE_EN = "The plain model took too long to answer. Try again.";
const NOTE_ZH = "纯模型太久没回应，再试一次。";

function setup(U, mode, lang) {
  const env = makeEnv(), db = env.DB._db, now = Date.now();
  db.prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)")
    .run(U, "t" + U, "Greenpoint, Brooklyn", 40, "Saturday afternoon", now);
  const plan = mode === "in"
    ? {
      id: "P" + U, mode, lang,
      picks: [{ name: "Chungking Express", kind: "film", qloo_id: "X1" }],
      receipt: { seeds: SEEDS },
    }
    : {
      id: "P" + U, mode, lang,
      stops: [{ name: "Word Bookstore", kind: "bookstore", coords: { lat: 40.73, lon: -73.95 } }],
      receipt: { seeds: SEEDS },
    };
  db.prepare("INSERT INTO plans (id,user_id,request,plan,pool,saved,created_at) VALUES (?,?,?,?,?,0,?)")
    .run("P" + U, U, JSON.stringify({ area: "Greenpoint, Brooklyn", mode, lang }), JSON.stringify(plan), "[]", now);
  return { env, db, cookie: "t" + U, id: "P" + U };
}

const savedPlan = (db, id) => JSON.parse(db.prepare("SELECT plan FROM plans WHERE id=?").get(id).plan);

test("stay-in: a model that never answers is cut off at the deadline", async () => {
  const { env, db, cookie, id } = setup("TOIN", "in", "en");
  env.PLAIN_TIMEOUT_MS = "300";
  env.AI.run = () => new Promise(() => {});
  const t0 = Date.now();
  const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
  const dt = Date.now() - t0;
  assert.equal(r.status, 200);
  assert.ok(dt < 3000, "answered after " + dt + " ms with a 300 ms deadline");
  const pl = r.json && r.json.plain;
  assert.ok(pl, "plain block missing");
  assert.deepEqual(pl.picks, [], "no picks on timeout");
  assert.equal(pl.note, NOTE_EN);
  assert.equal(pl.checked, false);
  assert.ok(!savedPlan(db, id).plain, "a timed-out comparison is not cached on the plan row");
});

test("go-out zh: the deadline note is Chinese and nothing is cached", async () => {
  const { env, db, cookie, id } = setup("TOOUT", "out", "zh");
  env.PLAIN_TIMEOUT_MS = "300";
  env.AI.run = () => new Promise(() => {});
  const t0 = Date.now();
  const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
  const dt = Date.now() - t0;
  assert.equal(r.status, 200);
  assert.ok(dt < 3000, "answered after " + dt + " ms with a 300 ms deadline");
  const pl = r.json && r.json.plain;
  assert.ok(pl, "plain block missing");
  assert.deepEqual(pl.stops, [], "no stops on timeout");
  assert.equal(pl.note, NOTE_ZH);
  assert.equal(pl.checked, false);
  assert.ok(!savedPlan(db, id).plain, "a timed-out comparison is not cached on the plan row");
});

test("a model slower than the deadline loses even if it would answer later", async () => {
  const { env, cookie, id } = setup("TOSLOW", "in", "en");
  env.PLAIN_TIMEOUT_MS = "100";
  env.AI.run = () => new Promise((resolve) => setTimeout(() => resolve({ response: JSON.stringify({ picks: [{ name: "Late Pick", kind: "film", why: "Late." }] }) }), 400));
  const t0 = Date.now();
  const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
  const dt = Date.now() - t0;
  assert.equal(r.status, 200);
  assert.ok(dt < 350, "must not wait for the slow model (" + dt + " ms)");
  assert.deepEqual(r.json.plain.picks, []);
  assert.equal(r.json.plain.note, NOTE_EN);
});

test("a model that answers inside the deadline still compares and caches", async () => {
  const { env, db, cookie, id } = setup("TOFAST", "in", "en");
  env.PLAIN_TIMEOUT_MS = "3000";
  env.AI.raw = () => ({ picks: [{ name: "Lost in Translation", kind: "film", why: "Quiet, like your notes." }] });
  const t0 = Date.now();
  const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
  const dt = Date.now() - t0;
  assert.equal(r.status, 200);
  assert.ok(dt < 1500, "a fast answer must not wait for the deadline (" + dt + " ms)");
  const pl = r.json.plain;
  assert.equal(pl.note, null);
  assert.deepEqual(pl.picks.map((x) => x.name), ["Lost in Translation"]);
  assert.ok(savedPlan(db, id).plain, "a real comparison is still cached on the plan row");
});

test("non-deadline model errors keep the quota note", async () => {
  const { env, cookie, id } = setup("TOQUOTA", "in", "en");
  env.PLAIN_TIMEOUT_MS = "3000";
  env.AI.run = () => { throw new Error("AI quota exceeded"); };
  const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
  assert.equal(r.status, 200);
  assert.equal(r.json.plain.note, "The plain model is unavailable right now (daily AI quota). Try again later.");
  assert.deepEqual(r.json.plain.picks, []);
});
