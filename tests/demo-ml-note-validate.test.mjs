// Main-line regression: POST /api/notes input validation.
// Empty text is refused with a clear 400, oversized text is stored safely (truncated to the 5000-char cap),
// unicode/emoji round-trip byte-for-byte, malformed bodies never 500, and every call finishes well inside 5 s.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, call } from "./adversarial/harness.mjs";
// dynamic: src/index.js imports src/app.html, so the html hook must be registered first.
const { default: worker } = await import("../src/index.js");

const BUDGET_MS = 5000;

function session(U) {
  const env = makeEnv();
  env.DB._db
    .prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)")
    .run(U, "t" + U, "Greenpoint, Brooklyn", 40, "Saturday afternoon", Date.now());
  return { env, cookie: "t" + U };
}

const notesFor = (env, U) => env.DB._db.prepare("SELECT * FROM notes WHERE user_id=? ORDER BY created_at").all(U);

test("empty, whitespace-only and missing text get a clear 400 and store nothing", async () => {
  const U = "NV1";
  const { env, cookie } = session(U);
  const started = Date.now();
  for (const body of [{ text: "" }, { text: "   \n\t  " }, { text: "  \u00a0 " }, { text: null }, {}]) {
    const r = await call(worker, env, "POST", "/api/notes", { cookie, body });
    assert.equal(r.status, 400, `status for ${JSON.stringify(body)}`);
    assert.equal(r.json.error, "empty", `error for ${JSON.stringify(body)}`);
  }
  assert.equal(notesFor(env, U).length, 0);
  assert.ok(Date.now() - started < BUDGET_MS, `empty-text batch took ${Date.now() - started}ms`);
});

test("oversized text is stored safely at the 5000-char cap, never 500", async () => {
  const U = "NV2";
  const { env, cookie } = session(U);
  const long = "Line one about the harbour.\n" + "x".repeat(6000);
  const r = await call(worker, env, "POST", "/api/notes", { cookie, body: { text: long } });

  assert.equal(r.status, 200);
  assert.equal(typeof r.json.note.id, "string");
  assert.ok(r.json.note.text.length <= 5000, `stored ${r.json.note.text.length} chars`);
  assert.equal(r.json.note.text, long.slice(0, 5000));
  assert.ok(r.json.note.text.startsWith("Line one about the harbour."));

  const rows = notesFor(env, U);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].text.length, 5000);
  assert.equal(rows[0].text, long.slice(0, 5000));
});

test("unicode and emoji text round-trips intact through the API and the DB", async () => {
  const U = "NV3";
  const { env, cookie } = session(U);
  const text = "雨后的布鲁克林 🌧️ 咖啡馆 ☕ — Amélie, 千と千尋の神隠し, 👩‍👩‍👧‍👦 família ✨";
  const started = Date.now();
  const r = await call(worker, env, "POST", "/api/notes", { cookie, body: { text } });

  assert.equal(r.status, 200);
  assert.equal(r.json.note.text, text);
  assert.ok(!r.json.note.text.includes("\ufffd"), "no replacement characters");
  assert.equal(notesFor(env, U)[0].text, text);

  const listed = await call(worker, env, "GET", "/api/notes", { cookie });
  assert.equal(listed.status, 200);
  const stored = listed.json.notes.find((n) => n.id === r.json.note.id);
  assert.ok(stored, "note is listed back");
  assert.equal(stored.text, text);
  assert.ok(Date.now() - started < BUDGET_MS, `unicode round-trip took ${Date.now() - started}ms`);
});

test("odd payload shapes never 500: malformed JSON is 400, numeric text is stored as text", async () => {
  const U = "NV4";
  const { env, cookie } = session(U);

  for (const raw of ["{not json", "[1,2,3]", "\"just a string\"", "null"]) {
    const r = await call(worker, env, "POST", "/api/notes", { cookie, raw, body: raw, headers: { "content-type": "application/json" } });
    assert.equal(r.status, 400, `status for raw ${JSON.stringify(raw)}`);
    assert.equal(r.json.error, "That request was not readable.");
  }

  const numeric = await call(worker, env, "POST", "/api/notes", { cookie, body: { text: 42 } });
  assert.equal(numeric.status, 200);
  assert.equal(numeric.json.note.text, "42");
  assert.equal(notesFor(env, U).length, 1);

  const weird = await call(worker, env, "POST", "/api/notes", { cookie, body: { text: { nested: true } } });
  assert.equal(weird.status, 400);
  assert.equal(weird.json.error, "empty");
  assert.equal(notesFor(env, U).length, 1, "no row added by the refused payloads");
});
