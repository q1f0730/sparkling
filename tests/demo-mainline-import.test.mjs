// Main-line demo: a real Letterboxd diary CSV becomes import notes, rewatches say so, bad files are
// rejected, and /api/import/status agrees with what is actually in the notes table.
// Offline: harness D1/AI/Qloo mocks, no network. This file is part of the post-merge gate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, makeQloo, setQloo, call } from "./adversarial/harness.mjs";
// dynamic: src/index.js imports src/app.html, so the html hook must be registered first.
const { default: worker } = await import("../src/index.js");

// The real Letterboxd diary export header; URI/Tags values are ignored by the importer.
const HEADER = "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date";
const DIARY = [
  HEADER,
  "2024-01-02,Her,2013,boxd.it/aaa,4,No,,2024-01-02",
  "2024-01-03,In the Mood for Love,2000,boxd.it/bbb,5,Yes,,2024-01-03",
  "2024-01-04,Dune: Part Two,2024,boxd.it/ccc,3.5,No,,2024-01-04",
].join("\n") + "\n";

function freshEnv(id) {
  const env = makeEnv();
  setQloo(makeQloo(), env);
  env.DB._db
    .prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)")
    .run(id, "t" + id, "Greenpoint, Brooklyn", 40, "Saturday afternoon", Date.now());
  return { env, token: "t" + id };
}

// Recognition schedules a 25 s timeout race per note; unref those timers so the process can exit as soon
// as the awaited work is done instead of idling for the full timeout (same need as demo-mainline-photo).
async function withUnrefTimers(fn) {
  const real = globalThis.setTimeout;
  globalThis.setTimeout = (cb, ms, ...rest) => { const t = real(cb, ms, ...rest); t?.unref?.(); return t; };
  try { return await fn(); } finally { globalThis.setTimeout = real; }
}

const importPost = (worker, env, token, body) =>
  withUnrefTimers(() => call(worker, env, "POST", "/api/import/letterboxd", { body, headers: { "content-type": "text/csv" }, cookie: token }));

const notesOf = (env, id) =>
  env.DB._db.prepare("SELECT text,kind,status,meta FROM notes WHERE user_id=? AND kind='import' ORDER BY text").all(id);

test("a 3-row diary CSV queues three import notes with the demo wording", async () => {
  const { env, token } = freshEnv("LI1");
  const r = await importPost(worker, env, token, DIARY);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json, { read: 3, queued: 3 });

  const notes = notesOf(env, "LI1");
  assert.equal(notes.length, 3, "one note per diary row");
  for (const n of notes) assert.equal(n.kind, "import", "imported rows carry kind 'import'");
  assert.deepEqual(
    notes.map((n) => n.text),
    [
      "Rewatched In the Mood for Love (2000) · ★★★★★",
      "Watched Dune: Part Two (2024) · ★★★½",
      "Watched Her (2013) · ★★★★",
    ],
  );
  // The rewatch flag flips the verb; a half star keeps its ½ glyph.
  assert.ok(notes.some((n) => n.text.startsWith("Rewatched In the Mood for Love (2000)")));
  assert.ok(!notes.some((n) => n.text.startsWith("Watched In the Mood for Love")));
  assert.equal(JSON.parse(notes.find((n) => n.text.includes("Dune")).meta).rewatch, false);
});

test("the same diary works as a multipart 'file' upload", async () => {
  const { env, token } = freshEnv("LI2");
  const fd = new FormData();
  fd.append("file", new File([DIARY], "diary.csv", { type: "text/csv" }));
  const r = await withUnrefTimers(() => call(worker, env, "POST", "/api/import/letterboxd", { body: fd, cookie: token }));
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json, { read: 3, queued: 3 });
  assert.equal(notesOf(env, "LI2").length, 3);
});

test("a CSV without a Name column is rejected and stores nothing", async () => {
  const { env, token } = freshEnv("LI3");
  const r = await importPost(worker, env, token, "Title,Year\nDune,2021\n");
  assert.equal(r.status, 400);
  assert.deepEqual(r.json, { error: "That doesn't look like a Letterboxd diary or reviews file." });
  assert.equal(notesOf(env, "LI3").length, 0, "a rejected file must not create notes");
});

test("an empty export (header-only diary) reads as zero entries, not an error", async () => {
  // A zero-byte body has no header at all and is rejected by parseLetterboxd (see DECISION);
  // an actually empty Letterboxd export still carries the header row.
  const { env, token } = freshEnv("LI4");
  const r = await importPost(worker, env, token, HEADER + "\n");
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json, { read: 0, queued: 0 });
  assert.equal(notesOf(env, "LI4").length, 0);
});

test("GET /api/import/status reports counts consistent with the imported notes", async () => {
  const { env, token } = freshEnv("LI5");
  const posted = await importPost(worker, env, token, DIARY);
  assert.equal(posted.status, 200, posted.text);

  const r = await call(worker, env, "GET", "/api/import/status", { cookie: token });
  assert.equal(r.status, 200, r.text);
  const st = r.json;
  const rows = env.DB._db.prepare("SELECT text,status,mentions FROM notes WHERE user_id=? AND kind='import'").all("LI5");
  assert.equal(st.read, rows.length, "status read matches the import notes on disk");
  assert.equal(st.read, 3);
  assert.equal(st.pending, rows.filter((n) => n.status === "pending").length, "pending matches the notes table");
  assert.equal(st.pending + st.cards + st.inbox + st.notes, st.read, "the four buckets add up to read");
  // Recognition is deterministic offline: the two titles in the catalogue become cards, the third stays a note.
  assert.equal(st.cards, rows.filter((n) => n.status === "done" && String(n.mentions || "").includes('"matched"')).length);
});
