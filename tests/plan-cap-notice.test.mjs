// plan-cap-notice: a daily cap for a real (non-sample) user must not be disguised as a catalogue outage.
// The plan stream answers {type:"error", state:"busy", text} with the honest busy copy (en/zh); other
// errors keep today's wording, and the sample notebook's saved-plan fallback still runs first.
// Offline harness only, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, setQloo, makeQloo, call } from "./adversarial/harness.mjs";
const { default: worker } = await import("../src/index.js");

const EN = "Sparkling is busy right now (daily limit reached). Your notes and cards are safe. Try again later.";
const ZH = "Sparkling 现在有点忙（今天的额度用完了）。你的笔记和卡片都在，晚点再试。";
const QLOO_DOWN = "Plans need the taste catalogue right now and it isn't answering. Your notes and cards are fine.";
const DAY = () => new Date().toISOString().slice(0, 10);
const BUSY_SAVED = "Busy right now — showing a saved result.";

const lines = (t) => t.split("\n").filter(Boolean).map((l) => JSON.parse(l));
const errorLine = (t) => lines(t).find((x) => x.type === "error");
const planEvent = (t) => lines(t).find((x) => x.type === "plan");

function seedUser(env) {
  const db = env.DB._db, now = Date.now();
  db.prepare("INSERT INTO users (id,token,sample,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?,?)").run("U1", "tU1", 0, "Testville", 40, "Saturday afternoon", now);
  [["E-ITML", "In the Mood for Love", "film"], ["E-HER", "Her", "film"], ["E-BIGTHIEF", "Big Thief", "music"], ["E-KLARA", "Klara and the Sun", "book"]]
    .forEach(([qloo_id, name, type], i) => {
      db.prepare("INSERT INTO cards (id,user_id,qloo_id,name,type,heart,created_at) VALUES (?,?,?,?,?,?,?)").run("c" + i, "U1", qloo_id, name, type, 1, now);
      db.prepare("INSERT INTO footprints (id,user_id,card_id,note_id,kind,sentiment,quote,created_at) VALUES (?,?,?,?,?,?,?,?)").run("f" + i, "U1", "c" + i, "n" + i, "note", "positive", name, now - i * 3600000);
    });
  return env;
}

// Both daily caps are over their limit: every Qloo or model call inside the plan throws e.cap.
function cappedEnv(sample = 0) {
  const env = makeEnv({ LLM_DAILY_CAP: "1", QLOO_DAILY_CAP: "1" });
  setQloo(makeQloo(), env);
  seedUser(env);
  if (sample) env.DB._db.prepare("UPDATE users SET sample=1 WHERE id=?").run("U1");
  for (const k of ["llm", "qloo"]) env.DB._db.prepare("INSERT INTO quota (key,n,created_at) VALUES (?,?,?)").run(`cap:${k}:${DAY()}`, 50, Date.now());
  return env;
}

const body = (mode, lang) => mode === "in"
  ? { mode, text: "I want to watch a film", lang }
  : { mode, area: "Testville", when: "Saturday afternoon", budget: 40, lang };

for (const [mode, lang, want] of [["in", "en", EN], ["out", "en", EN], ["in", "zh", ZH], ["out", "zh", ZH]]) {
  test(`a capped ${mode}/${lang} plan streams the honest busy error`, async () => {
    const env = cappedEnv(0);
    const r = await call(worker, env, "POST", "/api/plan", { cookie: "tU1", body: body(mode, lang) });
    assert.equal(r.status, 200, r.text);
    const e = errorLine(r.text);
    assert.ok(e, "expected an error line, got: " + r.text.slice(0, 240));
    assert.equal(e.state, "busy");
    assert.equal(e.text, want);
    assert.equal(planEvent(r.text), undefined, "a capped plan must not serve a plan");
  });
}

test("other plan errors keep today's wording", async () => {
  const env = makeEnv();
  const q = setQloo(makeQloo(), env);
  q.mode = "500";
  seedUser(env);
  const r = await call(worker, env, "POST", "/api/plan", { cookie: "tU1", body: body("out", "en") });
  const e = errorLine(r.text);
  assert.ok(e, "expected an error line, got: " + r.text.slice(0, 240));
  assert.equal(e.state, "qloo_down");
  assert.equal(e.text, QLOO_DOWN);
});

test("the sample notebook still gets its saved plan when capped", async () => {
  const env = cappedEnv(1);
  env.DB._db.prepare("INSERT OR REPLACE INTO llm_cache (key,value,created_at) VALUES (?,?,?)")
    .run("sample-saved:v1:plan:in:en", JSON.stringify({ id: "OLD", mode: "in", lang: "en", picks: [{ name: "Chungking Express", kind: "film" }] }), Date.now());
  const r = await call(worker, env, "POST", "/api/plan", { cookie: "tU1", body: body("in", "en") });
  assert.equal(errorLine(r.text), undefined, "the sample notebook streamed an error: " + r.text.slice(0, 240));
  const pl = planEvent(r.text);
  assert.ok(pl, "no plan event");
  assert.equal(pl.plan.picks[0].name, "Chungking Express");
  assert.equal(pl.plan.busy_notice, BUSY_SAVED);
});
