// Prod caps/fallback contract for the sample notebook's Threads screen: when Qloo fails or is capped, the
// sample user still gets the last good threads answer plus an honest "Busy right now" notice — never an
// error line, never a blank. Non-sample users keep today's behaviour. Offline harness only, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";
import { runFn, esc } from "../tools/orchestra/checks/swarm/lib_front.mjs";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, setQloo, makeQloo, call } from "./adversarial/harness.mjs";
const { default: worker } = await import("../src/index.js");

const EN = "Busy right now — showing a saved result.";
const ZH = "现在有点忙，先给你看保存过的结果。";
const CATALOGUE_LINE = "The taste catalogue isn't answering right now. Your cards are fine.";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// A notebook's cards by hand: six cards, two footprints each (the sample flag is what the fallback keys off).
function seed(env, U, sample, pre) {
  const db = env.DB._db, now = Date.now();
  db.prepare("INSERT INTO users (id,token,sample,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?,?)")
    .run(U, "t" + U, sample, "Greenpoint, Brooklyn", 40, "Saturday afternoon", now);
  const types = ["film", "film", "film", "music", "music", "book"];
  types.forEach((t, i) => { const cid = U + "c" + i;
    db.prepare("INSERT INTO cards (id,user_id,qloo_id,name,type,heart,created_at) VALUES (?,?,?,?,?,?,?)").run(cid, U, pre + "-Q" + i, "Thing " + i, t, i < 3 ? 1 : 0, now - i * 86400000);
    for (let k = 0; k < 2; k++) db.prepare("INSERT INTO footprints (id,user_id,card_id,note_id,kind,sentiment,quote,created_at) VALUES (?,?,?,?,?,?,?,?)").run(cid + "f" + k, U, cid, cid + "n" + k, "note", "positive", "q", now - (i * 5 + k) * 86400000); });
}
const savedRow = (env, key) => env.DB.q("SELECT value FROM llm_cache WHERE key=?", key)[0];

// ---------- (1) a good sample answer is saved, then served when Qloo dies ----------
test("a successful sample threads answer is saved, then served with the busy notice when Qloo fails", async () => {
  const env = makeEnv();
  const q = setQloo(makeQloo(), env);
  seed(env, "SA", 1, "AAA");
  const ok = await call(worker, env, "GET", "/api/threads", { cookie: "tSA" });
  assert.equal(ok.status, 200, ok.text.slice(0, 200));
  assert.ok((ok.json.threads || []).length >= 1, "the fixture must produce threads: " + ok.text.slice(0, 200));
  assert.equal(ok.json.busy_notice, undefined, "a live answer carries no notice");
  const saved = savedRow(env, "sample-saved:v1:threads:en");
  assert.ok(saved, "a successful sample threads answer must be cached under sample-saved:v1:threads:en");
  assert.deepEqual(JSON.parse(saved.value), ok.json, "the cached copy is the body the client got");

  q.mode = "500";
  seed(env, "SB", 1, "BBB");
  const r = await call(worker, env, "GET", "/api/threads", { cookie: "tSB" });
  assert.equal(r.status, 200, "the sample screen must not error: " + r.status + " " + r.text.slice(0, 200));
  assert.equal(r.json.busy_notice, EN);
  assert.deepEqual(r.json.threads, ok.json.threads, "the fallback must serve the saved threads");
});

// ---------- (2) the saved copy is kept per language ----------
test("?lang=zh caches and serves sample-saved:v1:threads:zh with the Chinese notice", async () => {
  const env = makeEnv();
  const q = setQloo(makeQloo(), env);
  seed(env, "ZA", 1, "ZZZ");
  const ok = await call(worker, env, "GET", "/api/threads?lang=zh", { cookie: "tZA" });
  assert.equal(ok.status, 200, ok.text.slice(0, 200));
  assert.ok((ok.json.threads || []).length >= 1, "the fixture must produce threads: " + ok.text.slice(0, 200));
  assert.ok(savedRow(env, "sample-saved:v1:threads:zh"), "zh answers cache under the zh key");
  assert.equal(savedRow(env, "sample-saved:v1:threads:en"), undefined, "a zh answer never writes the en key");

  q.mode = "500";
  seed(env, "ZB", 1, "YYY");
  const r = await call(worker, env, "GET", "/api/threads?lang=zh", { cookie: "tZB" });
  assert.equal(r.status, 200, r.text.slice(0, 200));
  assert.equal(r.json.busy_notice, ZH);
  assert.deepEqual(r.json.threads, ok.json.threads);
});

// ---------- (3) non-sample users are unchanged ----------
test("non-sample users keep the honest catalogue line and never the sample fallback", async () => {
  const env = makeEnv();
  const q = setQloo(makeQloo(), env);
  q.mode = "500";
  seed(env, "NC", 0, "CCC");
  const r = await call(worker, env, "GET", "/api/threads", { cookie: "tNC" });
  assert.equal(r.status, 200);
  assert.equal(r.json.busy_notice, undefined, "the sample fallback is sample-only");
  assert.deepEqual(r.json.threads, []);
  assert.equal(r.json.reason, CATALOGUE_LINE);
  assert.equal(savedRow(env, "sample-saved:v1:threads:en"), undefined, "non-sample users never write the sample key");
});

// ---------- (4) a sample user with nothing saved still gets a page, not an error ----------
test("a sample user with no saved copy still gets the honest line, never a 500", async () => {
  const env = makeEnv();
  const q = setQloo(makeQloo(), env);
  q.mode = "500";
  seed(env, "NF", 1, "FFF");
  const r = await call(worker, env, "GET", "/api/threads", { cookie: "tNF" });
  assert.equal(r.status, 200, "the sample screen never errors: " + r.status);
  assert.equal(r.json.busy_notice, undefined);
  assert.deepEqual(r.json.threads, []);
  assert.equal(r.json.reason, CATALOGUE_LINE);
});

// ---------- (5) the client renders the notice ----------
test("busyNoticeHTML renders the notice as an escaped plan-notice line", () => {
  const sc = { esc, LANG: "en" };
  const out = runFn("src/app/js/threads.js", "busyNoticeHTML", sc, [{ busy_notice: EN, threads: [] }]);
  assert.equal(out, '<p class="plan-notice" role="note">' + EN + "</p>");
  assert.equal(runFn("src/app/js/threads.js", "busyNoticeHTML", sc, [{ threads: [] }]), "", "no notice without the field");
  assert.equal(runFn("src/app/js/threads.js", "busyNoticeHTML", sc, [null]), "");
  const evil = runFn("src/app/js/threads.js", "busyNoticeHTML", sc, [{ busy_notice: '<b>"x"</b>' }]);
  assert.ok(!/<b>/.test(evil) && /&lt;b&gt;/.test(evil), "the notice text is escaped: " + evil);
});

test("paint puts the notice above the threads", () => {
  const scope = { esc, LANG: "en", threadsEl: {}, current: [], lastData: null, setNote: () => {},
    threadHTML: (t) => '<article class="thread">' + t.tag + "</article>", emptyHTML: (r) => '<div class="empty">' + r + "</div>" };
  runFn("src/app/js/threads.js", "paint", scope, [{ busy_notice: EN, threads: [{ tag: "T1" }] }]);
  const html = String(scope.threadsEl.innerHTML);
  assert.ok(html.indexOf('<p class="plan-notice" role="note">' + EN + "</p>") === 0, "the notice leads the threads: " + html);
  assert.ok(html.indexOf("plan-notice") < html.indexOf('<article class="thread"'));
  runFn("src/app/js/threads.js", "paint", scope, [{ busy_notice: EN, threads: [], reason: "r" }]);
  const empty = String(scope.threadsEl.innerHTML);
  assert.ok(empty.indexOf('<p class="plan-notice" role="note">' + EN + "</p>") === 0, "the notice also leads the empty state: " + empty);
});

test("threads.js mentions busy_notice at all (the file the sealed check reads)", () => {
  const src = fs.readFileSync(path.join(ROOT, "src/app/js/threads.js"), "utf8");
  assert.match(src, /busy_notice/);
});