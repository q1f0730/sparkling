// Prod cost guard: every Qloo HTTP call goes through one exported gateway (src/qloo.js qlooFetch),
// which optionally caches 200 bodies in the existing D1 llm_cache table. Offline: the harness swaps
// globalThis.fetch for the Qloo mock and backs D1 with real SQLite.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as H from "./adversarial/harness.mjs";
import { qlooFetch, searchEntity } from "../src/qloo.js";
import { qsearch, tasteRank } from "../src/recognize.js";
import { checkPlainPlaces } from "../src/plan.js";
import { duoPlan } from "../src/duo.js";

const B = "https://hackathon.api.qloo.com/search?query=";
const cacheRows = (env) => env.DB._db.prepare("SELECT key, value, created_at FROM llm_cache WHERE key LIKE 'qc:%'").all();

test("qlooFetch is the one gateway: headers, timeout signal, Response out", async () => {
  const env = H.makeEnv();
  const q = H.setQloo(H.makeQloo(), env);
  let seen = null;
  q.override = (u, init) => { seen = init; return null; };
  const res = await qlooFetch(env, B + "Her&take=2");
  assert.ok(res instanceof Response);
  assert.equal(res.status, 200);
  assert.equal(seen.headers["X-Api-Key"], env.QLOO_API_KEY);
  assert.equal(seen.headers.accept, "application/json");
  assert.ok(seen.signal instanceof AbortSignal);
  assert.equal(q.calls.length, 1);
  assert.equal((await res.json()).results.length, 1);
});

test("flag on: a fresh cache row is served with zero network", async () => {
  const env = H.makeEnv({ QLOO_D1_CACHE: "1" });
  const q = H.setQloo(H.makeQloo(), env);
  const url = B + "zzcached&take=3";
  const body = JSON.stringify({ results: [{ entity_id: "C1", name: "Cached One" }] });
  env.DB._db.prepare("INSERT INTO llm_cache (key,value,created_at) VALUES (?,?,?)").run("qc:v1:" + url, body, Date.now());
  const res = await qlooFetch(env, url);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/json");
  assert.equal((await res.json()).results[0].name, "Cached One");
  assert.equal(q.calls.length, 0, "cache hit must not touch the network");
});

test("flag on: a miss calls Qloo once and stores the body text under qc:v1:<url>", async () => {
  const env = H.makeEnv({ QLOO_D1_CACHE: "1" });
  const q = H.setQloo(H.makeQloo(), env);
  const url = B + "In%20the%20Mood&take=2";
  const res = await qlooFetch(env, url);
  const text = await res.text();
  assert.equal(q.calls.length, 1);
  const row = cacheRows(env).find((x) => x.key === "qc:v1:" + url);
  assert.ok(row, "200 body must be stored");
  assert.equal(row.value, text);
  assert.ok(Number(row.created_at) > 0);
});

test("flag on: a row older than the TTL is refetched", async () => {
  const env = H.makeEnv({ QLOO_D1_CACHE: "1", QLOO_D1_CACHE_TTL_H: "1" });
  const q = H.setQloo(H.makeQloo(), env);
  const url = B + "stale&take=2";
  env.DB._db.prepare("INSERT INTO llm_cache (key,value,created_at) VALUES (?,?,?)").run("qc:v1:" + url, '{"results":[{"name":"STALE"}]}', Date.now() - 2 * 3600000);
  await (await qlooFetch(env, url)).text();
  assert.equal(q.calls.length, 1, "stale row must be refetched");
  assert.notEqual(cacheRows(env).find((x) => x.key === "qc:v1:" + url).value, '{"results":[{"name":"STALE"}]}');
});

test("flag on: non-200 status passes through and is never cached", async () => {
  const env = H.makeEnv({ QLOO_D1_CACHE: "1" });
  const q = H.setQloo(H.makeQloo(), env);
  q.mode = "500";
  const res = await qlooFetch(env, B + "boom&take=2");
  await res.text();
  assert.equal(res.status, 500);
  assert.equal(cacheRows(env).length, 0, "a 500 body must not be cached");
});

test("flag unset: no llm_cache traffic at all", async () => {
  const env = H.makeEnv();
  H.setQloo(H.makeQloo(), env);
  let touched = 0;
  const real = env.DB.prepare;
  env.DB.prepare = (sql) => { if (/llm_cache/.test(sql)) touched++; return real(sql); };
  await (await qlooFetch(env, B + "off&take=2")).text();
  assert.equal(touched, 0, "flag unset must never touch env.DB");
});

test("the request helpers route through the gateway: searchEntity caches", async () => {
  const env = H.makeEnv({ QLOO_D1_CACHE: "1" });
  H.setQloo(H.makeQloo(), env);
  await searchEntity(env, { query: "Gateway Probe " + Date.now(), domain: "movie" });
  assert.ok(cacheRows(env).some((x) => x.key.startsWith("qc:v1:https://hackathon.api.qloo.com/search?")), "searchEntity must go through qlooFetch");
});

test("plan.js, recognize.js and duo.js Qloo calls all pass through the gateway", async () => {
  // plan.js (checkPlainPlaces -> /search)
  {
    const env = H.makeEnv({ QLOO_D1_CACHE: "1" });
    H.setQloo(H.makeQloo(), env);
    await checkPlainPlaces(env, ["Book Nook 1"], { lat: 40.72, lon: -73.95 }, "Greenpoint");
    assert.ok(cacheRows(env).some((x) => x.key.includes("/search?")), "plan.js Qloo call must be cached");
  }
  // recognize.js qsearch -> /search
  {
    const env = H.makeEnv({ QLOO_D1_CACHE: "1" });
    H.setQloo(H.makeQloo(), env);
    await qsearch(env, "Solaris", ["urn:entity:movie"], 3);
    assert.ok(cacheRows(env).some((x) => x.key.includes("/search?")), "qsearch must be cached");
  }
  // recognize.js qinsights (via tasteRank) -> /v2/insights
  {
    const env = H.makeEnv({ QLOO_D1_CACHE: "1" });
    H.setQloo(H.makeQloo(), env);
    const db = env.DB._db;
    db.prepare("INSERT INTO users (id, token) VALUES ('u1','t1')").run();
    db.prepare("INSERT INTO cards (id, user_id, qloo_id, name, heart) VALUES ('c1','u1','E-HER','Her',1)").run();
    db.prepare("INSERT INTO cards (id, user_id, qloo_id, name, heart) VALUES ('c2','u1','E-BIGTHIEF','Big Thief',1)").run();
    db.prepare("INSERT INTO footprints (id, user_id, card_id, note_id, sentiment) VALUES ('f1','u1','c1','n1','positive')").run();
    db.prepare("INSERT INTO footprints (id, user_id, card_id, note_id, sentiment) VALUES ('f2','u1','c2','n2','positive')").run();
    const guesses = [{ qloo_id: "E-SOLARIS-72", type: "film", name: "Solaris" }, { qloo_id: "E-SOLARIS-02", type: "film", name: "Solaris" }];
    await tasteRank(env, "u1", guesses);
    assert.ok(cacheRows(env).some((x) => x.key.includes("/v2/insights?")), "qinsights must be cached");
  }
  // duo.js -> /v2/insights
  {
    const env = H.makeEnv({ QLOO_D1_CACHE: "1" });
    H.setQloo(H.makeQloo(), env);
    await duoPlan(env, { area: "Testville", seedsA: [{ qloo_id: "E-HER", name: "Her" }], seedsB: [{ qloo_id: "E-BIGTHIEF", name: "Big Thief" }] });
    assert.ok(cacheRows(env).some((x) => x.key.includes("/v2/insights?")), "duo.js Qloo call must be cached");
  }
});
