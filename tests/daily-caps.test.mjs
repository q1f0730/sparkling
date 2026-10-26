// Daily caps (prod cost guard): spend(env, kind) counts one unit per real Qloo/LLM call in D1
// table quota(key, n, created_at) under "cap:<kind>:<UTC day>"; over the cap it throws
// {cap: kind, state: "busy"}; unset cap = free, DB errors fail open, cache hits are free.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as H from "./adversarial/harness.mjs";
import * as L from "../src/llm.js";
import * as Q from "../src/qloo.js";
import { readImageFull } from "../src/recognize.js";

const DAY = () => new Date().toISOString().slice(0, 10);
const QLOO = "https://hackathon.api.qloo.com/search?query=";

test("schema.sql declares the quota table", () => {
  const sql = fs.readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS quota\s*\(/);
});

test("spend is exported and free without a cap (no DB access)", async () => {
  assert.equal(typeof L.spend, "function");
  const env = { DB: { prepare() { throw new Error("must not touch DB"); } } };
  await L.spend(env, "qloo");
  await L.spend(env, "llm");
  const env0 = H.makeEnv({ LLM_DAILY_CAP: "0", QLOO_DAILY_CAP: "x" });
  await L.spend(env0, "llm");
  assert.equal(env0.DB._db.prepare("SELECT COUNT(*) n FROM quota").get().n, 0);
});

test("llmJSON stops at LLM_DAILY_CAP with a busy error", async () => {
  const env = H.makeEnv({ LLM_DAILY_CAP: "2" });
  env.AI.raw = (s, u) => ({ echo: u });
  await L.llmJSON(env, "s", "a", null);
  await L.llmJSON(env, "s", "b", null);
  await assert.rejects(() => L.llmJSON(env, "s", "c", null), (e) => e.cap === "llm" && e.state === "busy" && /daily llm cap reached/.test(e.message));
  assert.equal(env.AI.calls, 2);
  assert.ok(env.DB._db.prepare("SELECT n FROM quota WHERE key=?").get("cap:llm:" + DAY()));
  // The cap error must not trip the 5-minute breaker: the next call still reports the cap.
  await assert.rejects(() => L.llmJSON(env, "s", "e", null), /daily llm cap reached/);
  await assert.rejects(() => L.llmText(env, "s", "d"), (e) => e.cap === "llm");
});

test("a D1-cached repeat is free and does not spend", async () => {
  const env = H.makeEnv({ LLM_DAILY_CAP: "1", LLM_D1_CACHE: "1" });
  env.AI.raw = () => ({ ok: 1 });
  await L.llmJSON(env, "s", "same", null);
  const again = await L.llmJSON(env, "s", "same", null);
  assert.deepEqual(again, { ok: 1 });
  assert.equal(env.DB._db.prepare("SELECT n FROM quota WHERE key=?").get("cap:llm:" + DAY()).n, 1);
  await assert.rejects(() => L.llmJSON(env, "s", "new", null), (e) => e.cap === "llm");
});

test("qlooFetch stops at QLOO_DAILY_CAP before the network call", async () => {
  const env = H.makeEnv({ QLOO_DAILY_CAP: "1" });
  const q = H.setQloo(H.makeQloo(), env);
  await (await Q.qlooFetch(env, QLOO + "capone&take=1")).text();
  await assert.rejects(() => Q.qlooFetch(env, QLOO + "captwo&take=1"), (e) => e.cap === "qloo" && e.state === "busy");
  assert.equal(q.calls.length, 1);
  assert.ok(env.DB._db.prepare("SELECT n FROM quota WHERE key=?").get("cap:qloo:" + DAY()).n >= 2);
});

test("Qloo D1 cache hits never spend the qloo cap", async () => {
  const env = H.makeEnv({ QLOO_DAILY_CAP: "1", QLOO_D1_CACHE: "1" });
  H.setQloo(H.makeQloo(), env);
  const u = QLOO + "hitme&take=1";
  env.DB._db.prepare("INSERT INTO llm_cache (key,value,created_at) VALUES (?,?,?)").run("qc:v1:" + u, "{\"results\":[]}", Date.now());
  for (let i = 0; i < 3; i++) await (await Q.qlooFetch(env, u)).text();
  assert.equal(env.DB._db.prepare("SELECT COUNT(*) n FROM quota").get().n, 0);
});

test("the photo-vision model call spends the llm cap", async () => {
  const env = H.makeEnv({ LLM_DAILY_CAP: "1" });
  env.AI.raw = () => "NONE";
  const bytes = new Uint8Array([1, 2, 3]);
  await readImageFull(env, bytes, "image/png");
  await assert.rejects(() => readImageFull(env, bytes, "image/png"), (e) => e.cap === "llm");
});

test("spend fails open when D1 errors", async () => {
  const env = { QLOO_DAILY_CAP: "1", DB: { prepare() { throw new Error("d1 down"); } } };
  await L.spend(env, "qloo");
  await L.spend(env, "qloo");
});
