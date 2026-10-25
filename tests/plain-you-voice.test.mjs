// FP-36: the plain (no-Qloo) comparison should talk to the reader, not about them. POST /api/plan/:id/plain
// (src/index.js, act === "plain") must ask the model, for both the stay-in picks and the go-out stops, to write
// every why addressed to the reader as "you" (never "they/their"). The zh/en system-prompt handling is untouched.
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
// The instruction must name the reader as "you" and rule out third person.
const youVoice = (p) => /addressed to the reader as "you"/.test(p) && /never "they"/.test(p) && /"their"/.test(p);

function setup(U, mode, lang) {
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
  env.ai_prompts = [];
  env.AI.raw = (sys, user) => {
    env.ai_prompts.push({ sys, user });
    return mode === "in"
      ? { picks: [{ name: "Lost in Translation", kind: "film", why: "Quiet and close to the mood you keep." }] }
      : { stops: [{ name: "Some Cafe", kind: "cafe", why: "It sounds nice." }] };
  };
  return { env, cookie: "t" + U, id: "P" + U };
}

for (const mode of ["in", "out"]) {
  for (const lang of ["en", "zh"]) {
    test(`${lang} ${mode}: plain prompt asks the model to address the reader as "you"`, async () => {
      const { env, cookie, id } = setup("Y" + lang.toUpperCase() + mode, mode, lang);
      const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
      assert.equal(r.status, 200);
      assert.equal(env.ai_prompts.length, 1, "model asked once");
      const { sys, user } = env.ai_prompts[0];
      assert.ok(youVoice(sys + " " + user), "prompt must tell the model to say you: " + JSON.stringify({ sys, user }));
    });
  }

  test(`${mode}: the zh/en system-prompt handling is unchanged`, async () => {
    const en = setup("YE" + mode, mode, "en");
    await call(worker, en.env, "POST", "/api/plan/" + en.id + "/plain", { cookie: en.cookie, body: {} });
    assert.equal(en.env.ai_prompts[0].sys, mode === "in" ? SYS_IN : SYS_OUT, "en system prompt stays byte-identical");

    const zh = setup("YZ" + mode, mode, "zh");
    await call(worker, zh.env, "POST", "/api/plan/" + zh.id + "/plain", { cookie: zh.cookie, body: {} });
    assert.equal(zh.env.ai_prompts[0].sys, (mode === "in" ? SYS_IN : SYS_OUT) + " " + ZH_NOTE, "zh instruction stays on the system prompt");
  });
}
