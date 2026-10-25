// FP-33: the plain model's why sometimes reads oddly (zh example: 情欲之中一样的美好感觉 for a bakery).
// plainWhyOk(why, name) keeps a why only if it is a calm, short sentence without exclamation marks or
// romance/erotic words; a rejected why falls back to the neutral template (en or zh by plan lang).
// Offline: tests/adversarial/harness.mjs mocks D1, Workers AI and Qloo (no real network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, call } from "./adversarial/harness.mjs";
const { default: worker, plainWhyOk } = await import("../src/index.js");

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

test("plainWhyOk keeps a calm, short sentence", () => {
  assert.equal(plainWhyOk("A quiet bakery with good bread.", "Bake Shop"), true);
  assert.equal(plainWhyOk("值得为它的可颂跑一趟。", "Bake Shop"), true);
});

test("plainWhyOk rejects empty, too long, exclamation and romance/erotic whys", () => {
  assert.equal(plainWhyOk("", "Bake Shop"), false);
  assert.equal(plainWhyOk("   ", "Bake Shop"), false);
  assert.equal(plainWhyOk(null, "Bake Shop"), false);
  assert.equal(plainWhyOk("x".repeat(161), "Bake Shop"), false, "over 160 chars");
  assert.equal(plainWhyOk("A bakery you will love!", "Bake Shop"), false, "exclamation mark");
  assert.equal(plainWhyOk("好店！", "Bake Shop"), false, "full-width exclamation mark");
  assert.equal(plainWhyOk("情欲之中一样的美好感觉", "Bake Shop"), false, "romance word 情欲");
  assert.equal(plainWhyOk("性感又诱惑的面包房", "Bake Shop"), false, "romance words 性感/诱惑");
  assert.equal(plainWhyOk("A sensual, seductive room.", "Bake Shop"), false, "sensual");
  assert.equal(plainWhyOk("An erotic dream of bread.", "Bake Shop"), false, "erotic");
});

test("en go-out: an odd why falls back to the neutral template", async () => {
  const { env, cookie, id } = setup("GWEN", "out", "en", {
    stops: [{ name: "Bake Shop", kind: "bakery", why: "A sensual, erotic dream of bread!" }],
  });
  const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
  assert.equal(r.status, 200);
  assert.equal(r.json.plain.stops[0].why, "A bakery close to your taste.");
});

test("zh go-out: the romance why falls back to the Chinese neutral template", async () => {
  const { env, cookie, id } = setup("GWZH", "out", "zh", {
    stops: [{ name: "Bake Shop", kind: "bakery", why: "情欲之中一样的美好感觉" }],
  });
  const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
  assert.equal(r.status, 200);
  assert.equal(r.json.plain.stops[0].why, "一家和你的口味相近的bakery。");
});

test("stay-in picks are guarded too", async () => {
  const { env, cookie, id } = setup("GWIN", "in", "en", {
    picks: [{ name: "Some Film", kind: "film", why: "Seductive and sensual!" }],
  });
  const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
  assert.equal(r.status, 200);
  assert.equal(r.json.plain.picks[0].why, "A film close to your taste.");
});

test("a calm why passes through unchanged", async () => {
  const { env, cookie, id } = setup("GWOK", "out", "en", {
    stops: [{ name: "Bake Shop", kind: "bakery", why: "A quiet bakery with good bread." }],
  });
  const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
  assert.equal(r.status, 200);
  assert.equal(r.json.plain.stops[0].why, "A quiet bakery with good bread.");
});
