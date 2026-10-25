// Demo mainline: "Same notes, no Qloo" works from BOTH plan results. POST /api/plan/:id/plain must build a
// plain-LLM comparison for a stay-in plan (picks, from the same model, seeds from plan.receipt.seeds, the
// same number/kinds as plan.picks) and keep answering with plain stops for a go-out plan.
// The plain picks come from the model's memory: no "Because you kept …" card links.
// Offline: tests/adversarial/harness.mjs mocks D1, Workers AI and Qloo (no real network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, call } from "./adversarial/harness.mjs";
const { default: worker } = await import("../src/index.js");

const SEEDS = [
  { name: "In the Mood for Love", qloo_id: "E-ITML" },
  { name: "Big Thief", qloo_id: "E-BT" },
];

function setup(U, mode) {
  const env = makeEnv(), db = env.DB._db, now = Date.now();
  db.prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)")
    .run(U, "t" + U, "Greenpoint, Brooklyn", 40, "Saturday afternoon", now);
  const plan = mode === "in"
    ? {
      id: "P" + U, mode: "in", kinds: ["film", "music"],
      picks: [
        { name: "Chungking Express", kind: "film", qloo_id: "X1", why_line: "Because you kept In the Mood for Love." },
        { name: "Dragon New Warm Mountain", kind: "music", qloo_id: "X2", why_line: "Because you kept Big Thief." },
      ],
      receipt: { seeds: SEEDS },
    }
    : {
      id: "P" + U, mode: "out",
      stops: [{ name: "Word Bookstore", kind: "bookstore", coords: { lat: 40.73, lon: -73.95 } }],
      receipt: { seeds: SEEDS },
    };
  db.prepare("INSERT INTO plans (id,user_id,request,plan,pool,saved,created_at) VALUES (?,?,?,?,?,0,?)")
    .run("P" + U, U, JSON.stringify({ area: "Greenpoint, Brooklyn", mode }), JSON.stringify(plan), "[]", now);
  // Record every prompt so the test can prove what the stay-in compare asks the model.
  env.ai_prompts = [];
  env.AI.raw = (sys, user) => {
    env.ai_prompts.push({ sys, user });
    return mode === "in"
      ? { picks: [
        { name: "Lost in Translation", kind: "film", why: "Quiet and close to the mood you keep." },
        { name: "Blue", kind: "music", why: "Slow and warm, like your notes." },
      ] }
      : { stops: [{ name: "Some Cafe", kind: "cafe", why: "It sounds nice." }] };
  };
  return { env, cookie: "t" + U, id: "P" + U };
}

test("stay-in: no-Qloo compare returns model picks instead of the go-out notice", async () => {
  const { env, cookie, id } = setup("UPIN1", "in");
  const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
  assert.equal(r.status, 200);
  assert.ok(!r.json.notice, "stay-in must not answer with the go-out notice: " + r.json.notice);
  const plain = r.json.plain;
  assert.ok(plain, "plain block missing");
  assert.equal(plain.picks.length, 2);
  assert.deepEqual(plain.picks.map((p) => p.kind), ["film", "music"], "same kinds as plan.picks");
  assert.deepEqual(plain.seeds, ["In the Mood for Love", "Big Thief"], "seeds come from plan.receipt.seeds");
  for (const p of plain.picks) {
    assert.deepEqual(Object.keys(p).sort(), ["kind", "name", "why"], "plain picks carry only the model's fields");
    assert.ok(typeof p.why === "string" && p.why.trim());
    assert.doesNotMatch(p.why, /because you kept/i, "plain picks carry no Qloo card links");
  }
  assert.doesNotMatch(JSON.stringify(plain.picks), /because you kept/i);
});

test("stay-in: compare asks the same model for the same number/kinds from memory, then caches on the plan row", async () => {
  const { env, cookie, id } = setup("UPIN2", "in");
  const first = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
  assert.equal(first.status, 200);
  assert.equal(env.ai_prompts.length, 1, "the stay-in compare must ask the model once");
  const { sys, user } = env.ai_prompts[0];
  assert.match(sys, /from your own memory only/i);
  assert.match(user, /In the Mood for Love/);
  assert.match(user, /Big Thief/);
  assert.match(user, /2 things/, "asks for as many things as plan.picks");
  assert.match(user, /film, music/, "asks for the same kinds, in order");
  assert.match(String(first.json.plain.model), /llama-3\.3-70b/, "the same model the go-out compare uses");
  // second tap is served from the plan row: no second model call
  const second = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
  assert.equal(second.status, 200);
  assert.equal(env.ai_prompts.length, 1, "the cached comparison must not call the model again");
  assert.deepEqual(second.json.plain.picks, first.json.plain.picks);
});

test("go-out: no-Qloo compare still returns plain stops", async () => {
  const { env, cookie, id } = setup("UPOUT1", "out");
  const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
  assert.equal(r.status, 200);
  assert.ok(r.json.plain && Array.isArray(r.json.plain.stops) && r.json.plain.stops.length >= 1, "no plain stops: " + JSON.stringify(r.json).slice(0, 300));
  assert.equal(r.json.plain.stops[0].name, "Some Cafe");
  assert.equal(env.ai_prompts.length, 1);
});

test("stay-in: swap, shorten and budget still answer with the go-out notice", async () => {
  const { env, cookie, id } = setup("UPIN3", "in");
  for (const act of ["swap", "shorten", "budget"]) {
    const r = await call(worker, env, "POST", "/api/plan/" + id + "/" + act, { cookie, body: {} });
    assert.equal(r.status, 200, act);
    assert.match(String(r.json.notice), /plan out/, act + " must keep the notice");
  }
});
