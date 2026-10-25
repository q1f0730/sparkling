// Main-line regression test: the demo persona (Juno Park's sample notebook).
// POST /api/session {mode:'sample'} must seed src/sample.js into a real, browsable notebook;
// a plain session must start empty; the per-IP throttle must cut off the 21st session in an hour.
// Offline only: the harness SQLite/Qloo mocks, like tests/stayin.test.mjs and tests/letter.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, makeQloo, setQloo, call } from "./adversarial/harness.mjs";
import { SAMPLE_NOTES } from "../src/sample.js";
// dynamic: src/index.js imports src/app.html, so the html hook must be registered first.
const { default: worker } = await import("../src/index.js");

const DAY = 86400000;

// Fresh offline env. The harness KV mock predates the session throttle and has no get();
// add it here (a real KV binding has get) instead of teaching src/ about the test double.
function freshEnv() {
  const env = makeEnv();
  setQloo(makeQloo(), env);
  const kv = env.MEDIA_KV;
  if (typeof kv.get !== "function") kv.get = async (k) => (kv._map.has(k) ? kv._map.get(k).v : null);
  return env;
}

const tokenOf = (res) => ((res.headers.get("set-cookie") || "").match(/sp=([^;]+)/) || [])[1];

test("/api/session {mode:'sample'} seeds Juno Park: cookie, sample user, Greenpoint, Brooklyn", async () => {
  const env = freshEnv();
  const r = await call(worker, env, "POST", "/api/session", { body: { mode: "sample" } });
  assert.equal(r.status, 200, r.text);
  const token = tokenOf(r);
  assert.ok(token, "session response must set sp=<token>");
  assert.equal(r.json.user.sample, true);
  assert.equal(r.json.user.area, "Greenpoint, Brooklyn");
  // The cookie is a working session for the same user.
  const me = await call(worker, env, "GET", "/api/me", { cookie: token });
  assert.equal(me.status, 200);
  assert.equal(me.json.user.id, r.json.user.id);
  assert.equal(me.json.user.sample, true);
});

test("the sample notebook returns exactly SAMPLE_NOTES notes, newest first", async () => {
  const env = freshEnv();
  const s = await call(worker, env, "POST", "/api/session", { body: { mode: "sample" } });
  assert.equal(s.status, 200, s.text);
  const token = tokenOf(s);

  const r = await call(worker, env, "GET", "/api/notes", { cookie: token });
  assert.equal(r.status, 200, r.text);
  const notes = r.json.notes;
  assert.ok(SAMPLE_NOTES.length >= 3, "sample notebook should not be a stub");
  assert.equal(notes.length, SAMPLE_NOTES.length);

  // seedSample lays notes out at now - daysAgo*DAY - minutes*60000, so newest = smallest offset.
  const offset = (n) => n.daysAgo * DAY + (n.minutes || 0) * 60000;
  const expected = [...SAMPLE_NOTES].sort((a, b) => offset(a) - offset(b)).map((n) => n.text);
  assert.deepEqual(notes.map((n) => n.text), expected);

  const times = notes.map((n) => n.created_at);
  assert.deepEqual([...times].sort((a, b) => b - a), times, "created_at must descend");
  assert.equal(new Set(notes.map((n) => n.id)).size, notes.length, "note ids must be unique");
});

test("plain POST /api/session {} creates a non-sample user with an empty notebook", async () => {
  const env = freshEnv();
  const r = await call(worker, env, "POST", "/api/session", { body: {} });
  assert.equal(r.status, 200, r.text);
  const token = tokenOf(r);
  assert.ok(token, "session response must set sp=<token>");
  assert.equal(r.json.user.sample, false);
  assert.equal(r.json.user.area, null);

  const n = await call(worker, env, "GET", "/api/notes", { cookie: token });
  assert.equal(n.status, 200, n.text);
  assert.deepEqual(n.json.notes, []);
  assert.equal(env.DB.q("SELECT COUNT(*) c FROM notes WHERE user_id=?", r.json.user.id)[0].c, 0);
});

test("the 21st new session from one cf-connecting-ip within the hour gets 429", async () => {
  const env = freshEnv();
  const headers = { "cf-connecting-ip": "198.51.100.23" };
  for (let i = 1; i <= 20; i++) {
    const r = await call(worker, env, "POST", "/api/session", { body: {}, headers });
    assert.equal(r.status, 200, `session ${i} should be allowed: ${r.text}`);
  }
  const over = await call(worker, env, "POST", "/api/session", { body: {}, headers });
  assert.equal(over.status, 429);
  assert.match(over.json.error, /Too many new sessions/);
  assert.equal(over.headers.get("set-cookie"), null, "a throttled session must not hand out a cookie");
});
