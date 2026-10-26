// Prod monitoring: GET /api/health is answered before the session check and before the per-IP rate
// limiter, so a monitor with no cookie can read today's daily-cap usage and the configured limits.
// Shape: {ok:true, caps:{qloo:{used,cap}, llm:{used,cap}}, rate:{per_min, expensive_per_min}} with
// cache-control: no-store. used = quota row for "cap:<kind>:<UTC day>" (0 when absent or the read fails),
// cap/rate = the positive env numbers or null. Never any key, token or user data.
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import * as H from "./adversarial/harness.mjs";

register("./adversarial/html-loader.mjs", import.meta.url);
const { default: worker } = await import("../src/index.js");

const DAY = () => new Date().toISOString().slice(0, 10);

test("GET /api/health needs no session and reports zeroes when nothing is configured", async () => {
  const env = H.makeEnv();
  const r = await H.call(worker, env, "GET", "/api/health");
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.deepEqual(r.json.caps, { qloo: { used: 0, cap: null }, llm: { used: 0, cap: null } });
  assert.deepEqual(r.json.rate, { per_min: null, expensive_per_min: null });
  assert.match(r.headers.get("cache-control") || "", /no-store/);
  assert.ok(!r.text.includes(env.QLOO_API_KEY), "health must not leak the Qloo key");
  assert.deepEqual(Object.keys(r.json).sort(), ["caps", "ok", "rate"], "no extra fields (no user data)");
});

test("GET /api/health reads today's quota rows and the configured caps", async () => {
  const env = H.makeEnv({ QLOO_DAILY_CAP: "50", LLM_DAILY_CAP: "7", RATE_LIMIT_PER_MIN: "120", RATE_LIMIT_EXPENSIVE_PER_MIN: "20" });
  env.DB._db.prepare("INSERT INTO quota (key,n,created_at) VALUES (?,?,?)").run("cap:qloo:" + DAY(), 12, Date.now());
  env.DB._db.prepare("INSERT INTO quota (key,n,created_at) VALUES (?,?,?)").run("cap:llm:" + DAY(), 3, Date.now());
  env.DB._db.prepare("INSERT INTO quota (key,n,created_at) VALUES (?,?,?)").run("cap:qloo:1999-01-01", 99, Date.now());
  const r = await H.call(worker, env, "GET", "/api/health");
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.caps, { qloo: { used: 12, cap: 50 }, llm: { used: 3, cap: 7 } });
  assert.deepEqual(r.json.rate, { per_min: 120, expensive_per_min: 20 });
});

test("a failing quota read still answers 200 with used 0", async () => {
  const env = H.makeEnv({ QLOO_DAILY_CAP: "5", LLM_DAILY_CAP: "5" });
  const p = env.DB.prepare;
  env.DB.prepare = (s) => { if (/quota/.test(s)) throw new Error("d1 down"); return p(s); };
  const r = await H.call(worker, env, "GET", "/api/health");
  assert.equal(r.status, 200);
  assert.equal(r.json.caps.qloo.used, 0);
  assert.equal(r.json.caps.llm.used, 0);
  assert.equal(r.json.caps.qloo.cap, 5);
});

test("health is never rate limited and does not spend the per-IP window", async () => {
  const env = H.makeEnv({ RATE_LIMIT_PER_MIN: "2" });
  const ip = { headers: { "cf-connecting-ip": "198.51.100.9" } };
  for (let i = 0; i < 10; i++) {
    const r = await H.call(worker, env, "GET", "/api/health", ip);
    assert.equal(r.status, 200, "health call " + i + " must not be limited");
  }
  // The window was untouched by those ten calls: the first real /api request is answered (401, no session).
  const me = await H.call(worker, env, "GET", "/api/me", ip);
  assert.equal(me.status, 401, "health must not consume the rate-limit window");
});
