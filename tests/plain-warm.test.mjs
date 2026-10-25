// FP-83: the first "Same notes, no Qloo" comparison must not wait for a tap. After POST /api/plan saves
// the plan, the worker warms the plain block in ctx.waitUntil, writes the same cache (plan.plain) the
// /plain handler writes, and never lets a warm failure break the plan stream.
// Offline: tests/adversarial/harness.mjs mocks D1, Workers AI and Qloo (no real network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, makeQloo, setQloo, call } from "./adversarial/harness.mjs";
const { default: worker } = await import("../src/index.js");

const PLAIN_SYS = /You suggest things to watch/;
const MOVIES = ["Chungking Express", "Tokyo Story", "Happy Together", "Yi Yi", "Fallen Angels", "In the Mood for Love"].map((n, i) => ({
  entity_id: i === 5 ? "E-ITML" : "M-" + i, name: n, popularity: 0.9 - i * 0.01,
  tags: [{ name: "Drama", type: "urn:tag:genre:media" }],
  properties: { release_year: 1990 + i, image: { url: `https://images.qloo.com/i/M${i}.jpg` }, short_descriptions: [{ value: "A one-line summary " + i + ".", languages: ["en"] }] },
  query: { affinity: 0.8, explainability: { "signal.interests.entities": [{ entity_id: "E-ITML", score: 0.7 }] } },
}));
function qlooWithMovies() {
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
async function newSession(env) {
  const U = "U" + Math.random().toString(36).slice(2, 10);
  env.DB._db.prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)").run(U, "t" + U, "Greenpoint, Brooklyn", 40, "Saturday afternoon", Date.now());
  return { token: "t" + U, id: U };
}
function seed(env, U) {
  const db = env.DB._db, now = Date.now();
  [["E-ITML", "In the Mood for Love", "film"], ["E-HER", "Her", "film"]].forEach(([q, n, t], i) => {
    db.prepare("INSERT INTO cards (id,user_id,qloo_id,name,type,heart,image,created_at) VALUES (?,?,?,?,?,?,?,?)").run("C" + i + U, U, q, n, t, i === 0 ? 1 : 0, null, now);
    db.prepare("INSERT INTO footprints (id,user_id,card_id,note_id,kind,sentiment,quote,created_at) VALUES (?,?,?,?,?,?,?,?)").run("F" + i + U, U, "C" + i + U, null, "note", "positive", "a line I wrote about " + n, now - i * 1000);
  });
}
// Plain picks the model "remembers"; every other prompt stays the harness's empty answer.
function warmAI(env, mode) {
  env.plain_prompts = [];
  env.AI.raw = (sys) => {
    if (!PLAIN_SYS.test(sys)) return {};
    env.plain_prompts.push(sys);
    if (mode === "fail") throw new Error("plain model unavailable");
    return { picks: [
      { name: "Lost in Translation", kind: "film", why: "Quiet and close to the mood you keep." },
      { name: "Blue", kind: "music", why: "Slow and warm, like your notes." },
      { name: "Paterson", kind: "film", why: "A calm day in a quiet town." },
    ] };
  };
}
async function planStream(env, cookie, body) {
  const r = await call(worker, env, "POST", "/api/plan", { body, cookie });
  const msgs = r.text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return { r, msgs, plan: (msgs.find((m) => m.type === "plan") || {}).plan, err: msgs.find((m) => m.type === "error") };
}
const savedPlan = (env, id) => JSON.parse(env.DB._db.prepare("SELECT plan FROM plans WHERE id=?").get(id).plan);

test("after POST /api/plan the plain block is already cached on the plan row", async () => {
  const env = makeEnv(); setQloo(qlooWithMovies(), env);
  const { token, id: U } = await newSession(env);
  seed(env, U); warmAI(env, "ok");
  const { plan, err } = await planStream(env, token, { text: "watch a movie", mode: "in" });
  assert.equal(err, undefined, JSON.stringify(err));
  assert.ok(plan && plan.id, "the plan stream must still deliver a plan");
  assert.equal(env.plain_prompts.length, 1, "the plan save must warm the plain comparison once");
  const stored = savedPlan(env, plan.id);
  assert.ok(stored.plain, "plan.plain missing after the stream: warming did not run");
  assert.equal(stored.plain.checked, 3);
  assert.equal(stored.plain.lang, "en");
  assert.deepEqual(stored.plain.picks.map((p) => p.name), ["Lost in Translation", "Blue", "Paterson"]);
  assert.deepEqual(stored.plain.seeds, ["In the Mood for Love", "Her"]);
  assert.equal(plan.plain, undefined, "the streamed plan itself stays lean (no plain block)");
});

test("the warmed block answers the first /plain tap without asking the model again", async () => {
  const env = makeEnv(); setQloo(qlooWithMovies(), env);
  const { token, id: U } = await newSession(env);
  seed(env, U); warmAI(env, "ok");
  const { plan } = await planStream(env, token, { text: "watch a movie", mode: "in" });
  assert.equal(env.plain_prompts.length, 1);
  const r = await call(worker, env, "POST", "/api/plan/" + plan.id + "/plain", { cookie: token, body: {} });
  assert.equal(r.status, 200);
  assert.equal(env.plain_prompts.length, 1, "the warm block must be served from the plan row");
  assert.equal(r.json.plain.picks.length, 3);
  assert.equal(r.json.plain.checked, 3);
  assert.ok(r.json.plain.verdict, "the handler still adds the verdict at response time");
});

test("a failing plain warm never breaks the plan stream and caches nothing", async () => {
  const env = makeEnv(); setQloo(qlooWithMovies(), env);
  const { token, id: U } = await newSession(env);
  seed(env, U); warmAI(env, "fail");
  const { r, plan, err } = await planStream(env, token, { text: "watch a movie", mode: "in" });
  assert.equal(r.status, 200);
  assert.equal(err, undefined, "a warm failure must not turn into a stream error: " + JSON.stringify(err));
  assert.ok(plan && plan.picks.length === 3, "the plan itself must arrive untouched");
  assert.ok(env.plain_prompts.length >= 1, "the warm attempt did run");
  assert.equal(savedPlan(env, plan.id).plain, undefined, "an empty comparison must not be cached");
});

test("a zh plan warms a zh comparison", async () => {
  const env = makeEnv(); setQloo(qlooWithMovies(), env);
  const { token, id: U } = await newSession(env);
  seed(env, U); warmAI(env, "ok");
  const { plan, err } = await planStream(env, token, { text: "我想看一部电影，根据我的记录推荐", lang: "zh", mood: "familiar", period: "all" });
  assert.equal(err, undefined, JSON.stringify(err));
  assert.equal(plan.mode, "in");
  const stored = savedPlan(env, plan.id);
  assert.ok(stored.plain, "zh plan must get a warmed plain block too");
  assert.equal(stored.plain.lang, "zh");
  assert.ok(env.plain_prompts[0].endsWith("Write every why in Simplified Chinese (keep names as they are)."), "the zh prompt rides on the warm call");
});
