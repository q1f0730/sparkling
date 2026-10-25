// zh parity (shot 5): the "Same notes, no Qloo" sheet must show the plain model's why lines in 简体中文
// when the plan is zh. POST /api/plan/:id/plain (act === "plain") asks for Chinese in the system prompt for
// both branches (stay-in picks, go-out stops); en prompts stay byte-identical, and a cached en comparison is
// never reused for a zh plan (the cache is keyed by lang).
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
const ZH_NOTE = "Write every why in Simplified Chinese (keep names as they are).";
const SYS_IN = `You suggest things to watch, listen to or read at home. Suggest real titles from your own memory only. Return {"picks":[{"name":string,"kind":string,"why":string}]}. Why is one sentence.`;
const SYS_OUT = `You plan an afternoon out. Suggest real venues from your own memory only. Return {"stops":[{"name":string,"kind":string,"why":string}]}. Why is one sentence.`;

function setup(U, mode, lang, cachedPlain) {
  const env = makeEnv(), db = env.DB._db, now = Date.now();
  db.prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)")
    .run(U, "t" + U, "Greenpoint, Brooklyn", 40, "Saturday afternoon", now);
  const plan = mode === "in"
    ? {
      id: "P" + U, mode: "in", lang, kinds: ["film", "music"],
      picks: [
        { name: "Chungking Express", kind: "film", qloo_id: "X1", why_line: "Because you kept In the Mood for Love." },
        { name: "Dragon New Warm Mountain", kind: "music", qloo_id: "X2", why_line: "Because you kept Big Thief." },
      ],
      receipt: { seeds: SEEDS },
    }
    : {
      id: "P" + U, mode: "out", lang,
      stops: [{ name: "Word Bookstore", kind: "bookstore", coords: { lat: 40.73, lon: -73.95 } }],
      receipt: { seeds: SEEDS },
    };
  if (cachedPlain) plan.plain = cachedPlain;
  db.prepare("INSERT INTO plans (id,user_id,request,plan,pool,saved,created_at) VALUES (?,?,?,?,?,0,?)")
    .run("P" + U, U, JSON.stringify({ area: "Greenpoint, Brooklyn", mode, lang }), JSON.stringify(plan), "[]", now);
  env.ai_prompts = [];
  env.AI.raw = (sys, user) => {
    env.ai_prompts.push({ sys, user });
    return mode === "in"
      ? { picks: [
        { name: "Lost in Translation", kind: "film", why: "安静，贴近你留住的心情。" },
        { name: "Blue", kind: "music", why: "慢而温暖，像你的笔记。" },
      ] }
      : { stops: [{ name: "Some Cafe", kind: "cafe", why: "听起来不错。" }] };
  };
  return { env, cookie: "t" + U, id: "P" + U };
}

for (const mode of ["in", "out"]) {
  test(`${mode}: zh plan asks the plain model to write why in Simplified Chinese`, async () => {
    const { env, cookie, id } = setup("ZH" + mode, mode, "zh");
    const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
    assert.equal(r.status, 200);
    assert.equal(env.ai_prompts.length, 1, "model asked once");
    assert.equal(env.ai_prompts[0].sys, (mode === "in" ? SYS_IN : SYS_OUT) + " " + ZH_NOTE, "zh instruction goes on the system prompt");
    assert.match(env.ai_prompts[0].user, /In the Mood for Love, Big Thief/, "the user prompt still carries the seeds");
    assert.doesNotMatch(env.ai_prompts[0].user, /Simplified Chinese/i, "the instruction lives on the system prompt");
  });

  test(`${mode}: zh plans are also detected from the stored plan request`, async () => {
    const { env, cookie, id } = setup("RQ" + mode, mode, "en");
    // Rewrite the stored plan to drop plan.lang; the request still says lang:"zh".
    const row = env.DB._db.prepare("SELECT plan FROM plans WHERE id=?").get(id);
    const plan = JSON.parse(row.plan); delete plan.lang;
    env.DB._db.prepare("UPDATE plans SET plan=?, request=? WHERE id=?")
      .run(JSON.stringify(plan), JSON.stringify({ area: "Greenpoint, Brooklyn", mode, lang: "zh" }), id);
    const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
    assert.equal(r.status, 200);
    assert.equal(env.ai_prompts.length, 1);
    assert.ok(env.ai_prompts[0].sys.endsWith(ZH_NOTE), "request lang=zh must add the instruction");
  });

  test(`${mode}: en plan prompt is byte-identical to before`, async () => {
    const { env, cookie, id } = setup("EN" + mode, mode, "en");
    const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
    assert.equal(r.status, 200);
    assert.equal(env.ai_prompts.length, 1);
    assert.equal(env.ai_prompts[0].sys, mode === "in" ? SYS_IN : SYS_OUT);
    assert.doesNotMatch(env.ai_prompts[0].sys, /Chinese|why in/i);
  });

  test(`${mode}: a cached en comparison is not reused for a zh plan`, async () => {
    const cached = mode === "in"
      ? { model: "m", seeds: ["In the Mood for Love"], kinds: ["film", "music"], picks: [{ name: "Old Pick", kind: "film", why: "English why." }], note: null, verified: false, checked: 3 }
      : { model: "m", seeds: ["In the Mood for Love"], area: "Greenpoint, Brooklyn", stops: [{ name: "Old Stop", kind: "cafe", why: "English why.", check: { status: "found" } }], note: null, verified: false, checked: 3 };
    const { env, cookie, id } = setup("CA" + mode, mode, "zh", cached);
    const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
    assert.equal(r.status, 200);
    assert.equal(env.ai_prompts.length, 1, "the en cache must not answer a zh plan");
    assert.ok(env.ai_prompts[0].sys.endsWith(ZH_NOTE));
    const plain = r.json.plain;
    const fresh = mode === "in" ? plain.picks : plain.stops;
    assert.notEqual(fresh[0].name, mode === "in" ? "Old Pick" : "Old Stop", "the stale en picks/stops are replaced");
    // second tap is served from the freshly cached zh comparison
    const again = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
    assert.equal(again.status, 200);
    assert.equal(env.ai_prompts.length, 1, "the zh comparison caches on the plan row");
  });

  test(`${mode}: a cached comparison in the same lang is still served without a model call`, async () => {
    const cached = mode === "in"
      ? { model: "m", lang: "zh", seeds: ["In the Mood for Love"], kinds: ["film"], picks: [{ name: "旧片", kind: "film", why: "中文理由。" }], note: null, verified: false, checked: 3 }
      : { model: "m", lang: "zh", seeds: ["In the Mood for Love"], area: "Greenpoint, Brooklyn", stops: [{ name: "旧店", kind: "cafe", why: "中文理由。", check: { status: "found" } }], note: null, verified: false, checked: 3 };
    const { env, cookie, id } = setup("HC" + mode, mode, "zh", cached);
    const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
    assert.equal(r.status, 200);
    assert.equal(env.ai_prompts.length, 0, "zh cache answers without the model");
    const fresh = mode === "in" ? r.json.plain.picks : r.json.plain.stops;
    assert.equal(fresh[0].name, mode === "in" ? "旧片" : "旧店");
  });
}
