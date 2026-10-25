// FP-76: GET /api/letter?lang=zh must not glue CJK and Latin together.
// The zh paragraphs are built around card names ("In the Mood for Love") and Qloo tags,
// so every Latin<->CJK boundary needs one space and no space may sit before CJK punctuation.
// Offline: the shared SQLite/Qloo/AI harness with the sample notebook, like demo-mainline-letter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, makeQloo, setQloo, call } from "./adversarial/harness.mjs";
import { SAMPLE_NOTES } from "../src/sample.js";
import { zhSpace } from "../src/plan.js";
const { default: worker } = await import("../src/index.js");

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
const GLUED_LEFT = /[\u4e00-\u9fff][A-Za-z0-9]/;   // 中文Latin
const GLUED_RIGHT = /[A-Za-z0-9][\u4e00-\u9fff]/;  // Latin中文
const SPACE_BEFORE_PUNCT = /[ \t]+[，。、；：！？）」』》]/;

async function zhLetter() {
  const env = makeEnv();
  const kv = env.MEDIA_KV;
  if (typeof kv.get !== "function") kv.get = async (k) => (kv._map.has(k) ? kv._map.get(k).v : null);
  setQloo(sampleQloo(), env);
  const r = await call(worker, env, "POST", "/api/session", { body: { mode: "sample" } });
  assert.equal(r.status, 200, r.text);
  const token = tokenOf(r);
  const res = await call(worker, env, "GET", "/api/letter?lang=zh", { cookie: token });
  assert.equal(res.status, 200, res.text);
  assert.ok(res.json.letter, "sample notebook should have a zh letter: " + res.json.reason);
  return res.json.letter;
}

test("zh letter paragraphs keep one space at every CJK/Latin boundary", async () => {
  const letter = await zhLetter();
  assert.ok(Array.isArray(letter.paragraphs) && letter.paragraphs.length > 0, "letter needs paragraphs");
  // The point of the fixture: at least one Latin card name actually lands in the copy.
  const names = [...SAMPLE_ENTS.values()].filter((n) => /[A-Za-z]/.test(n));
  assert.ok(names.some((n) => letter.paragraphs.join("\n").includes(n)), "zh paragraphs should name a Latin card: " + names.join(", "));

  for (const p of letter.paragraphs) {
    assert.ok(typeof p === "string" && p.trim().length > 0, "empty paragraph");
    assert.doesNotMatch(p, GLUED_LEFT, "glued CJK+Latin: " + p);
    assert.doesNotMatch(p, GLUED_RIGHT, "glued Latin+CJK: " + p);
    assert.doesNotMatch(p, SPACE_BEFORE_PUNCT, "stray space before CJK punctuation: " + p);
  }
});

test("zh letter paragraphs equal zhSpace applied to the raw text (idempotent)", async () => {
  const letter = await zhLetter();
  for (const p of letter.paragraphs) assert.equal(zhSpace(p), p, "paragraph is not zhSpace-normalised: " + p);
});
