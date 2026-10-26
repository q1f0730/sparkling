// Offline contract for the prod cost guard in src/llm.js: with env.LLM_D1_CACHE === "1" identical
// llmJSON/llmText calls are served from D1 (llm_cache, key "lc:v1:" + sha256) without touching env.AI.run.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv } from "./adversarial/harness.mjs";
import { llmJSON, llmText } from "../src/llm.js";

const rows = (env) => env.DB._db.prepare("SELECT key, value, created_at FROM llm_cache WHERE key LIKE 'lc:v1:%' ORDER BY key").all().map((r) => ({ ...r }));
const keyOf = (env) => env.DB._db.prepare("SELECT key FROM llm_cache WHERE key LIKE 'lc:v1:%'").get()?.key;
const touchCache = (env) => {
  let touched = 0;
  const p = env.DB.prepare;
  env.DB.prepare = (s) => { if (/llm_cache/.test(s)) touched++; return p(s); };
  return () => touched;
};

test("identical llmJSON calls are served from D1 with one sha256 key", async () => {
  const env = makeEnv({ LLM_D1_CACHE: "1" });
  env.AI.raw = () => ({ pick: "A", why: "because" });
  const a = await llmJSON(env, "sys one", "user one", null);
  const b = await llmJSON(env, "sys one", "user one", null);
  assert.deepEqual(a, { pick: "A", why: "because" });
  assert.deepEqual(b, a);
  assert.equal(env.AI.calls, 1, "the second identical call must not hit the model");
  const all = rows(env);
  assert.equal(all.length, 1);
  assert.match(all[0].key, /^lc:v1:[0-9a-f]{64}$/);
  assert.deepEqual(JSON.parse(all[0].value), { pick: "A", why: "because" });
});

test("the key covers user text, schema, maxTokens and call kind", async () => {
  const env = makeEnv({ LLM_D1_CACHE: "1" });
  env.AI.raw = (sys) => (sys === "text sys" ? "hello there" : { pick: "A" });
  await llmJSON(env, "sys", "user one", null);
  assert.equal(env.AI.calls, 1);
  await llmJSON(env, "sys", "user TWO", null);
  assert.equal(env.AI.calls, 2, "different user text misses");
  await llmJSON(env, "sys", "user one", null, 300);
  assert.equal(env.AI.calls, 3, "different maxTokens misses");
  await llmJSON(env, "sys", "user one", { name: "x", schema: { type: "object" } });
  assert.equal(env.AI.calls, 4, "different schema misses");
  await llmJSON(env, "sys", "user one", null);
  assert.equal(env.AI.calls, 4, "the original call is still a hit");
  // same system/user/maxTokens, different kind -> separate row
  await llmText(env, "sys", "user one", 700);
  assert.equal(env.AI.calls, 5);
  assert.equal(rows(env).length, 5);
  assert.equal(new Set(rows(env).map((r) => r.key)).size, 5);
});

test("llmText trims, caches and returns the text without a model call on a hit", async () => {
  const env = makeEnv({ LLM_D1_CACHE: "1" });
  env.AI.raw = () => "  hello there \n";
  const a = await llmText(env, "s", "u");
  const b = await llmText(env, "s", "u");
  assert.equal(a, "hello there");
  assert.equal(b, "hello there");
  assert.equal(env.AI.calls, 1);
  assert.deepEqual(JSON.parse(rows(env)[0].value), "hello there");
});

test("rows older than the TTL are refreshed; fresh rows are reused", async () => {
  const env = makeEnv({ LLM_D1_CACHE: "1", LLM_D1_CACHE_TTL_H: "1" });
  env.AI.raw = () => ({ pick: "A" });
  await llmJSON(env, "s", "u", null);
  const key = keyOf(env);
  env.DB._db.prepare("UPDATE llm_cache SET created_at=? WHERE key=?").run(Date.now() - 30 * 60000, key);
  await llmJSON(env, "s", "u", null);
  assert.equal(env.AI.calls, 1, "a row inside the TTL is a hit");
  env.DB._db.prepare("UPDATE llm_cache SET created_at=0 WHERE key=?").run(key);
  await llmJSON(env, "s", "u", null);
  assert.equal(env.AI.calls, 2, "a row older than the TTL misses");
  const fresh = rows(env)[0];
  assert.equal(fresh.key, key);
  assert.ok(fresh.created_at > 0, "a miss rewrites created_at");
});

test("flag unset: no D1 traffic and no caching", async () => {
  const env = makeEnv();
  env.AI.raw = () => ({ x: 1 });
  const touched = touchCache(env);
  await llmJSON(env, "s", "u", null);
  await llmJSON(env, "s", "u", null);
  assert.equal(touched(), 0, "flag unset must not touch llm_cache");
  assert.equal(env.AI.calls, 2);
});

test("D1 errors are ignored: the model result is still returned and nothing cached", async () => {
  const env = makeEnv({ LLM_D1_CACHE: "1" });
  env.AI.raw = () => ({ x: 1 });
  env.DB.prepare = () => { throw new Error("D1 down"); };
  const a = await llmJSON(env, "s", "u", null);
  const b = await llmJSON(env, "s", "u", null);
  assert.deepEqual(a, { x: 1 });
  assert.deepEqual(b, { x: 1 });
  assert.equal(env.AI.calls, 2, "a broken cache must not serve stale values");
});

// (down case last: llm.js has a module-level 5-min quota breaker)
test("a failed call throws and is never stored", async () => {
  const env = makeEnv({ LLM_D1_CACHE: "1" });
  env.AI.down = true;
  await assert.rejects(llmJSON(env, "down-sys", "down-user", null));
  assert.equal(rows(env).length, 0, "a failure must not be cached");
});
