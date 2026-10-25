// Main-line regression test: the monthly taste letter on the sample notebook (Juno Park).
// GET /api/letter must return non-empty, card-grounded text and must not need the LLM:
// the letter is rule-based (cards + footprints + Qloo tags), so it works with Workers AI down.
// Offline only: the shared SQLite/Qloo/AI harness like tests/stayin.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, makeQloo, setQloo, call } from "./adversarial/harness.mjs";
import { SAMPLE_NOTES } from "../src/sample.js";
// dynamic: src/index.js imports src/app.html, so the html hook must be registered first.
const { default: worker } = await import("../src/index.js");

// The sample notebook pins every mention to a real Qloo ID, so the test catalogue must know them.
// Name each entity after the surface in sample.js; one type is enough for the letter's mix.
const SAMPLE_ENTS = new Map();
for (const n of SAMPLE_NOTES) {
  for (const [surface, qid] of Object.entries(n.map || {})) if (!SAMPLE_ENTS.has(qid)) SAMPLE_ENTS.set(qid, surface);
  for (const id of (n.ask && n.ask.ids) || []) if (!SAMPLE_ENTS.has(id)) SAMPLE_ENTS.set(id, n.ask.surface);
}
function sampleQloo() {
  const q = makeQloo();
  q.override = (u) => {
    if (u.pathname !== "/entities") return null;
    const ids = (u.searchParams.get("entity_ids") || "").split(",").filter(Boolean);
    const results = ids.filter((id) => SAMPLE_ENTS.has(id)).map((id) => ({
      entity_id: id, name: SAMPLE_ENTS.get(id), types: ["urn:entity:movie"], subtype: "urn:entity:movie",
      popularity: 0.8, properties: { release_year: 2000, image: { url: "https://images.qloo.com/i/sample.jpg" } },
      tags: [{ name: "Drama", type: "urn:tag:genre:media" }, { name: "Melancholy", type: "urn:tag:theme:qloo" }],
    }));
    return new Response(JSON.stringify({ results }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return q;
}

const tokenOf = (res) => ((res.headers.get("set-cookie") || "").match(/sp=([^;]+)/) || [])[1];

// Fresh offline env with the sample notebook seeded. The harness KV mock predates the session throttle
// and has no get(); add it here (a real KV binding has get) instead of teaching src/ about the test double.
async function sampleSession({ aiDown = false } = {}) {
  const env = makeEnv();
  if (aiDown) env.AI.down = true; // every model call throws "AI quota exceeded"
  const kv = env.MEDIA_KV;
  if (typeof kv.get !== "function") kv.get = async (k) => (kv._map.has(k) ? kv._map.get(k).v : null);
  setQloo(sampleQloo(), env);
  const r = await call(worker, env, "POST", "/api/session", { body: { mode: "sample" } });
  assert.equal(r.status, 200, r.text);
  const token = tokenOf(r);
  assert.ok(token, "sample session must set sp=<token>");
  return { env, token, user: r.json.user };
}

const cardNames = (env, token) =>
  env.DB.q("SELECT name FROM cards WHERE user_id=(SELECT id FROM users WHERE token=?)", token).map((r) => r.name);

async function letterFor(env, token) {
  const r = await call(worker, env, "GET", "/api/letter", { cookie: token });
  assert.equal(r.status, 200, r.text);
  assert.ok(r.json.letter, "sample notebook should have a letter: " + r.json.reason);
  return r.json.letter;
}

test("the sample notebook has a letter with non-empty text naming at least one card", async () => {
  const { env, token } = await sampleSession();
  const names = cardNames(env, token);
  assert.ok(names.length >= 3, "sample notes should have produced cards, got " + names.length);
  const letter = await letterFor(env, token);

  assert.match(letter.month, /^[A-Z][a-z]+ \d{4}$/);
  assert.ok(Array.isArray(letter.paragraphs) && letter.paragraphs.length > 0, "letter needs paragraphs");
  for (const p of letter.paragraphs) assert.ok(typeof p === "string" && p.trim().length > 0, "empty paragraph");
  assert.ok(letter.new_cards > 0 && letter.touched > 0, "a month of sample notes must have new/touched cards");
  assert.equal(letter.touched, Object.values(letter.mix).reduce((a, n) => a + n, 0), "mix must add up to touched");

  const text = letter.paragraphs.join("\n");
  const named = names.filter((n) => text.includes(n));
  assert.ok(named.length >= 1, "paragraphs must name a card entity; cards: " + names.join(", ") + "\nletter: " + text);
});

test("the letter is computed without the LLM: AI down, zero model calls", async () => {
  const { env, token } = await sampleSession({ aiDown: true }); // sample seeding must not need the model either
  const letter = await letterFor(env, token);
  assert.equal(env.AI.calls, 0, "sample seeding and GET /api/letter must not call Workers AI");
  assert.ok(letter.paragraphs.length > 0, "rule-based fallback still writes paragraphs");
  assert.match(letter.receipt, /No model wrote this/);
});

test("repeated reads are deterministic: same notebook, same letter text", async () => {
  const { env, token } = await sampleSession();
  const a = await letterFor(env, token);
  const b = await letterFor(env, token);
  assert.deepEqual(b.paragraphs, a.paragraphs);
  assert.deepEqual(b.mix, a.mix);
  assert.equal(b.new_cards, a.new_cards);
  assert.equal(b.touched, a.touched);
  assert.deepEqual(b.your_words, a.your_words);
});
