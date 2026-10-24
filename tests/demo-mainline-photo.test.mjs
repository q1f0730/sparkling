// Main-line demo shot 1: a real phone photo goes up through POST /api/notes/photo,
// the app stores the exact bytes, and bad uploads are rejected before touching storage.
// Offline: harness D1/AI/Qloo mocks, no network. This file is part of the post-merge gate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, makeQloo, setQloo, makeCtx, call } from "./adversarial/harness.mjs";
// dynamic: src/index.js imports src/app.html, so the html hook must be registered first.
const { default: worker } = await import("../src/index.js");

// A minimal but real JPEG: SOI + JFIF APP0, padding, then EOI. Exactly 1024 bytes.
function jpegBytes() {
  const head = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const body = Buffer.alloc(1024 - head.length - 2, 0x00);
  return Buffer.concat([head, body, Buffer.from([0xff, 0xd9])]);
}

function freshEnv(id) {
  const env = makeEnv();
  setQloo(makeQloo(), env);
  env.DB._db
    .prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)")
    .run(id, "t" + id, "Greenpoint, Brooklyn", 40, "Saturday afternoon", Date.now());
  return { env, token: "t" + id };
}

function photoForm(file, caption) {
  const fd = new FormData();
  if (file) fd.append("file", file);
  fd.append("caption", caption);
  return fd;
}

const countNotes = (env, id) => env.DB._db.prepare("SELECT COUNT(*) n FROM notes WHERE user_id=?").get(id).n;

// The photo route races the vision call against an 18 s timer; a lingering timer would otherwise keep
// the test process alive long after the response. Cap timers while the upload runs (mocks answer at once).
async function withCappedTimers(fn) {
  const real = globalThis.setTimeout;
  globalThis.setTimeout = (cb, ms, ...rest) => real(cb, Math.min(Number(ms) || 0, 50), ...rest);
  try { return await fn(); } finally { globalThis.setTimeout = real; }
}

test("POST /api/notes/photo stores a real JPEG with its caption and exact bytes", async () => {
  const { env, token } = freshEnv("UP1");
  const bytes = jpegBytes();
  assert.equal(bytes.length, 1024);
  assert.deepEqual([...bytes.subarray(0, 4)], [0xff, 0xd8, 0xff, 0xe0]);
  assert.deepEqual([...bytes.subarray(-2)], [0xff, 0xd9]);
  const caption = "Rooftop at golden hour";

  const r = await withCappedTimers(() => call(worker, env, "POST", "/api/notes/photo", {
    body: photoForm(new File([bytes], "rooftop.jpg", { type: "image/jpeg" }), caption),
    cookie: token,
  }));

  assert.equal(r.status, 200, r.text);
  const note = r.json.note;
  assert.equal(note.kind, "photo");
  assert.equal(note.text, caption);
  assert.match(note.image_url, /^\/media\/.+/);

  // The stored media object must have exactly the uploaded byte length (and the same bytes).
  const key = note.image_url.slice("/media/".length);
  const stored = await env.MEDIA_KV.getWithMetadata(key, "arrayBuffer");
  assert.ok(stored.value, "media bytes were stored");
  assert.equal(stored.value.byteLength, bytes.length);
  assert.deepEqual(Buffer.from(stored.value), bytes);
  assert.equal(stored.metadata.type, "image/jpeg");

  // The note's media URL serves the same bytes back.
  const res = await worker.fetch(new Request("https://sparkling.test" + note.image_url, { headers: { cookie: "sp=" + token } }), env, makeCtx());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/jpeg");
  const served = Buffer.from(await res.arrayBuffer());
  assert.equal(served.byteLength, bytes.length);
  assert.deepEqual(served, bytes);
});

test("POST /api/notes/photo rejects a non-image file with the photo-only error", async () => {
  const { env, token } = freshEnv("UP2");
  const r = await call(worker, env, "POST", "/api/notes/photo", {
    body: photoForm(new File(["this is not a photo"], "notes.txt", { type: "text/plain" }), "a text file"),
    cookie: token,
  });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /not a photo/);
  assert.equal(env.MEDIA_KV._map.size, 0, "nothing should be stored for a rejected upload");
  assert.equal(countNotes(env, "UP2"), 0);
});

test("POST /api/notes/photo rejects a request with no file", async () => {
  const { env, token } = freshEnv("UP3");
  const r = await call(worker, env, "POST", "/api/notes/photo", {
    body: photoForm(null, "caption without a file"),
    cookie: token,
  });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /no file/);
  assert.equal(env.MEDIA_KV._map.size, 0);
  assert.equal(countNotes(env, "UP3"), 0);
});

test("POST /api/notes/photo rejects an image over 8 MB", async () => {
  const { env, token } = freshEnv("UP4");
  const tooBig = Buffer.alloc(8 * 1024 * 1024 + 1, 0xff);
  const r = await call(worker, env, "POST", "/api/notes/photo", {
    body: photoForm(new File([tooBig], "huge.jpg", { type: "image/jpeg" }), "huge"),
    cookie: token,
  });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /too large/);
  assert.equal(env.MEDIA_KV._map.size, 0, "an oversized upload must not be stored");
  assert.equal(countNotes(env, "UP4"), 0);
});
