// Walk 10-25 17:33 en 1440 compare sheet: the plain side's rejected why used to fall back to
// "A <kind> close to your taste." — that claims a taste link the plain side never had, blurring shot 5.
// plainWhyFallback(kind, lang) must now say plainly that the model gave no reason tied to the notes.
// Offline: tests/adversarial/harness.mjs mocks D1, Workers AI and Qloo (no real network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, call } from "./adversarial/harness.mjs";
const { default: worker } = await import("../src/index.js");

const EN = "The plain model gave no reason tied to your notes.";
const ZH = "纯模型没有给出和你笔记相关的理由。";

const SEEDS = [
  { name: "In the Mood for Love", qloo_id: "E-ITML" },
  { name: "Big Thief", qloo_id: "E-BT" },
];

function setup(U, mode, lang, reply) {
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
  db.prepare("INSERT INTO plans (id,user_id,request,plan,pool,saved,created_at) VALUES (?,?,?,?,?,0,?)")
    .run("P" + U, U, JSON.stringify({ area: "Greenpoint, Brooklyn", mode, lang }), JSON.stringify(plan), "[]", now);
  env.AI.raw = () => reply;
  return { env, cookie: "t" + U, id: "P" + U };
}

test("en go-out: a rejected why does not claim a taste link", async () => {
  const { env, cookie, id } = setup("PFEN", "out", "en", {
    stops: [{ name: "Bake Shop", kind: "bakery", why: "A sensual, erotic dream of bread!" }],
  });
  const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
  assert.equal(r.status, 200);
  const why = r.json.plain.stops[0].why;
  assert.equal(why, EN);
  assert.ok(!/close to your taste|taste link/i.test(why), "must not claim a taste link");
  assert.ok(!why.includes("bakery"), "must not echo the kind");
});

test("zh go-out: a rejected why uses the honest Chinese line", async () => {
  const { env, cookie, id } = setup("PFZH", "out", "zh", {
    stops: [{ name: "Bake Shop", kind: "bakery", why: "情欲之中一样的美好感觉" }],
  });
  const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
  assert.equal(r.status, 200);
  const why = r.json.plain.stops[0].why;
  assert.equal(why, ZH);
  assert.ok(!/口味相近|taste/i.test(why), "must not claim a taste match");
  assert.ok(!why.includes("bakery"), "must not echo the kind");
});

test("stay-in picks receive the same honest fallback", async () => {
  const { env, cookie, id } = setup("PFIN", "in", "en", {
    picks: [{ name: "Some Film", kind: "film", why: "Seductive and sensual!" }],
  });
  const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
  assert.equal(r.status, 200);
  assert.equal(r.json.plain.picks[0].why, EN);
});

test("empty or over-long whys also get the honest fallback", async () => {
  const { env, cookie, id } = setup("PFLONG", "out", "en", {
    stops: [{ name: "Bake Shop", kind: "bakery", why: "x".repeat(400) }],
  });
  const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
  assert.equal(r.status, 200);
  assert.equal(r.json.plain.stops[0].why, EN);
});

test("a calm why still passes through untouched", async () => {
  const { env, cookie, id } = setup("PFOK", "out", "en", {
    stops: [{ name: "Bake Shop", kind: "bakery", why: "A quiet bakery with good bread." }],
  });
  const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
  assert.equal(r.status, 200);
  assert.equal(r.json.plain.stops[0].why, "A quiet bakery with good bread.");
});
