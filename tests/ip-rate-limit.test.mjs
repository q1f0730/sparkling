// Prod anti-abuse: per-IP fixed one-minute windows in isolate memory, off unless configured.
// Offline harness, distinct test IPs per case (the counters live in module memory).
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
register("./adversarial/html-loader.mjs", import.meta.url);
const H = await import("./adversarial/harness.mjs");
const { default: worker } = await import("../src/index.js");

// Never straddle a minute boundary mid-case: the window would reset and a 429 case would flake.
if (Date.now() % 60000 > 50000) await new Promise((r) => setTimeout(r, 60000 - (Date.now() % 60000) + 200));

const user = (env, id) => {
  env.DB._db.prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)")
    .run(id, "t" + id, "Greenpoint, Brooklyn", 40, "Saturday afternoon", Date.now());
  return "t" + id;
};
const get = (env, ip, tok, path = "/api/me") =>
  H.call(worker, env, "GET", path, { cookie: tok, headers: { "cf-connecting-ip": ip } });
const post = (env, ip, tok, path, body) =>
  H.call(worker, env, "POST", path, { cookie: tok, body, headers: { "cf-connecting-ip": ip } });

test("RATE_LIMIT_PER_MIN: the (limit+1)-th request from one IP in a minute is 429 with retry-after", async () => {
  const env = H.makeEnv({ RATE_LIMIT_PER_MIN: "3" });
  const tok = user(env, "RL1");
  const ip = "198.51.100.11";
  for (let i = 1; i <= 3; i++) {
    const r = await get(env, ip, tok);
    assert.equal(r.status, 200, `request ${i} of 3 should pass`);
  }
  const r = await get(env, ip, tok);
  assert.equal(r.status, 429);
  assert.equal(typeof r.json?.error, "string");
  assert.equal(r.json.error, "Too many requests from this network. Wait a minute and try again.");
  assert.equal(r.json.busy, true);
  const ra = Number(r.headers.get("retry-after"));
  assert.ok(ra >= 1 && ra <= 60, `retry-after must be 1..60, got ${r.headers.get("retry-after")}`);

  // Another IP is unaffected.
  const other = await get(env, "198.51.100.12", tok);
  assert.equal(other.status, 200);

  // The app page is served outside api() and is never limited, even for a blocked IP.
  const page = await H.call(worker, env, "GET", "/", { headers: { "cf-connecting-ip": ip } });
  assert.equal(page.status, 200);
});

test("RATE_LIMIT_PER_MIN: 0 (and unset) turns the limit off", async () => {
  for (const extra of [{}, { RATE_LIMIT_PER_MIN: "0" }]) {
    const env = H.makeEnv(extra);
    const tok = user(env, "RL2");
    const ip = extra.RATE_LIMIT_PER_MIN ? "198.51.100.13" : "198.51.100.14";
    for (let i = 1; i <= 40; i++) {
      const r = await get(env, ip, tok);
      assert.equal(r.status, 200, `request ${i} got ${r.status} with limits off`);
    }
  }
});

test("RATE_LIMIT_EXPENSIVE_PER_MIN: tighter window shared by the expensive POSTs only", async () => {
  const env = H.makeEnv({ RATE_LIMIT_PER_MIN: "1000", RATE_LIMIT_EXPENSIVE_PER_MIN: "2" });
  const tok = user(env, "RL3");
  const ip = "198.51.100.15";
  for (let i = 0; i < 2; i++) {
    const r = await post(env, ip, tok, "/api/notes", { text: "note " + i });
    assert.equal(r.status, 200, `expensive POST ${i + 1} got ${r.status}`);
  }
  const over = await post(env, ip, tok, "/api/notes", { text: "one too many" });
  assert.equal(over.status, 429);
  assert.equal(over.json?.busy, true);
  assert.equal(over.json?.error, "Too many requests from this network. Wait a minute and try again.");
  const ra = Number(over.headers.get("retry-after"));
  assert.ok(ra >= 1 && ra <= 60);

  // /api/plan shares the same expensive window.
  const plan = await post(env, ip, tok, "/api/plan", { mode: "in", text: "a film" });
  assert.equal(plan.status, 429);

  // Cheap routes are not touched by the expensive window.
  const cheap = await get(env, ip, tok);
  assert.equal(cheap.status, 200);
});

test("RATE_LIMIT_EXPENSIVE_PER_MIN applies to every listed expensive POST path", async () => {
  const env = H.makeEnv({ RATE_LIMIT_EXPENSIVE_PER_MIN: "1" });
  const tok = user(env, "RL4");
  const ip = "198.51.100.16";
  const first = await post(env, ip, tok, "/api/duo", {});
  assert.notEqual(first.status, 429, "the first expensive POST must not be limited");
  const over = await post(env, ip, tok, "/api/import/letterboxd", "Date,Name\n2026-01-01,Her");
  assert.equal(over.status, 429);
  assert.equal(over.json?.busy, true);
});

test("/media/* is limited like /api/*; plain assets are not", async () => {
  const env = H.makeEnv({ RATE_LIMIT_PER_MIN: "1" });
  const ip = "198.51.100.17";
  const first = await H.call(worker, env, "GET", "/media/missing.jpg", { headers: { "cf-connecting-ip": ip } });
  assert.notEqual(first.status, 429, "/media counts but the first request passes");
  const over = await H.call(worker, env, "GET", "/media/missing.jpg", { headers: { "cf-connecting-ip": ip } });
  assert.equal(over.status, 429);

  const assetIp = "198.51.100.18";
  for (let i = 0; i < 5; i++) {
    const r = await H.call(worker, env, "GET", "/", { headers: { "cf-connecting-ip": assetIp } });
    assert.equal(r.status, 200);
  }
});
