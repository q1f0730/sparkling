// Prod 10-26: a daily-cap error while recognizing a note is not a failure. The note stays
// status 'pending' with meta.busy = true, meta.tries is not incremented (so it is retried later
// instead of ending 'failed' after 3 tries), and no error reason is shown. Other errors keep the
// tries/failed logic. When the cap clears the next recognizePending run finishes the note and
// drops meta.busy.
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import * as H from "./adversarial/harness.mjs";
// dynamic: src/index.js imports src/app.html, so the html hook must be registered first.
const { default: worker } = await import("../src/index.js");

const DAY = () => new Date().toISOString().slice(0, 10);
const TEXT = "watched Paterson again, the bus driver poems";

function session(env, U) {
  env.DB._db
    .prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)")
    .run(U, "t" + U, "Greenpoint, Brooklyn", 40, "Saturday afternoon", Date.now());
  return "t" + U;
}

function cappedEnv() {
  const env = H.makeEnv({ LLM_DAILY_CAP: "1", QLOO_DAILY_CAP: "1" });
  H.setQloo(H.makeQloo(), env);
  for (const k of ["llm", "qloo"])
    env.DB._db.prepare("INSERT INTO quota (key,n,created_at) VALUES (?,?,?)").run(`cap:${k}:${DAY()}`, 50, Date.now());
  return env;
}

const metaOf = (env, id) => {
  const row = env.DB._db.prepare("SELECT status, meta FROM notes WHERE id=?").get(id);
  let meta = {};
  try { meta = JSON.parse(row.meta || "{}") || {}; } catch (_) {}
  return { ...row, meta };
};

test("a capped note stays pending with meta.busy and no tries", async () => {
  const env = cappedEnv();
  const cookie = session(env, "UCB1");
  const post = await H.call(worker, env, "POST", "/api/notes", { cookie, body: { text: TEXT } });
  assert.equal(post.status, 200);
  const id = post.json.note.id;
  for (let i = 0; i < 4; i++) {
    await H.call(worker, env, "POST", "/api/notes/retry", { cookie, body: {} });
    await H.call(worker, env, "GET", "/api/me", { cookie });
  }
  const n = metaOf(env, id);
  assert.equal(n.status, "pending");
  assert.equal(n.meta.busy, true);
  assert.ok(!n.meta.tries, "cap errors must not count as tries: " + JSON.stringify(n.meta));
  assert.ok(!n.meta.error, "a capped note shows no failure reason: " + JSON.stringify(n.meta));
});

test("a cap error after an earlier failure clears the stale error and keeps the old tries", async () => {
  const env = cappedEnv();
  const cookie = session(env, "UCB2");
  env.DB._db
    .prepare("INSERT INTO notes (id,user_id,text,kind,meta,status,mentions,created_at) VALUES (?,?,?,'text',?,?,'[]',?)")
    .run("N-CB2", "UCB2", TEXT, JSON.stringify({ error: "Qloo search 500", tries: 2 }), "pending", Date.now());
  await H.call(worker, env, "GET", "/api/me", { cookie });
  const n = metaOf(env, "N-CB2");
  assert.equal(n.status, "pending");
  assert.equal(n.meta.busy, true);
  assert.equal(n.meta.tries, 2, "the cap error must not increment tries");
  assert.ok(!n.meta.error, "the stale failure reason is gone: " + JSON.stringify(n.meta));
});

test("when the cap clears the pending note finishes and meta.busy is removed", async () => {
  const env = cappedEnv();
  const cookie = session(env, "UCB3");
  const post = await H.call(worker, env, "POST", "/api/notes", { cookie, body: { text: TEXT } });
  assert.equal(post.status, 200);
  const id = post.json.note.id;
  await H.call(worker, env, "GET", "/api/me", { cookie });
  assert.equal(metaOf(env, id).meta.busy, true);
  env.DB._db.prepare("DELETE FROM quota").run();
  await H.call(worker, env, "GET", "/api/me", { cookie });
  const n = metaOf(env, id);
  assert.equal(n.status, "done", "note finishes once the caps allow calls again: " + JSON.stringify(n));
  assert.ok(!n.meta.busy, "meta.busy is gone after success: " + JSON.stringify(n.meta));
});

test("a non-cap error keeps the tries/failed logic and never sets busy", async () => {
  const env = H.makeEnv();
  const q = H.setQloo(H.makeQloo(), env);
  q.mode = "html"; // a 200 body that is not JSON: a real (non-cap) recognition error
  const cookie = session(env, "UCB4");
  const post = await H.call(worker, env, "POST", "/api/notes", { cookie, body: { text: TEXT } });
  assert.equal(post.status, 200);
  const n = metaOf(env, post.json.note.id);
  assert.equal(n.status, "pending");
  assert.equal(n.meta.tries, 1);
  assert.ok(n.meta.error);
  assert.ok(!n.meta.busy);
});
