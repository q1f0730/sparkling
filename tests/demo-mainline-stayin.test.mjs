// Demo mainline, stay-in picks: catalogue voice, not Qloo voice.
// A night in always recommends exactly three distinct things, each tied back to a noted card,
// and the pick reason says "the catalogue files it under ..." (EN) / "口味目录把它归在 ..." (zh),
// translating the tags in Chinese instead of printing raw catalogue tags.
// Fixtures follow tests/demo-mainline-plan.test.mjs and tests/stayin.test.mjs; no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeStayIn } from "../src/plan.js";
import { makeEnv, setQloo, makeQloo } from "./adversarial/harness.mjs";

const IN_NOTED = ["In the Mood for Love", "Her", "Big Thief", "Klara and the Sun"];

// ---------- fixtures ----------
function seedUser(env, U, cards) {
  const db = env.DB._db, now = Date.now();
  db.prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)").run(U, "t" + U, "Greenpoint, Brooklyn", 40, "Saturday afternoon", now);
  cards.forEach(([qlooid, name, type], i) => {
    db.prepare("INSERT INTO cards (id,user_id,qloo_id,name,type,heart,created_at) VALUES (?,?,?,?,?,?,?)").run("C" + i + U, U, qlooid, name, type, 1, now);
    db.prepare("INSERT INTO footprints (id,user_id,card_id,note_id,kind,sentiment,quote,created_at) VALUES (?,?,?,?,?,?,?,?)").run("F" + i + U, U, "C" + i + U, null, "note", "positive", "a line I wrote about " + name, now - i * 1000);
  });
  return db.prepare("SELECT * FROM users WHERE id=?").get(U);
}

// Same media for every kind, with explainability back to the seed cards and translatable tags.
const MEDIA = ["Chungking Express", "Tokyo Story", "Happy Together", "Yi Yi", "Fallen Angels", "In the Mood for Love"].map((n, i) => ({
  entity_id: i === 5 ? "E-ITML" : "M-" + i, name: n, popularity: 0.9 - i * 0.01,
  tags: [{ name: "Drama", type: "urn:tag:genre:media" }, { name: "Melancholy", type: "urn:tag:plot:qloo" }],
  properties: { release_year: 1990 + i, image: { url: `https://images.qloo.com/i/M${i}.jpg` }, collaborators: ["Director " + i], short_descriptions: [{ value: "A one-line summary " + i + ".", languages: ["en"] }] },
  query: { affinity: 0.8, explainability: { "signal.interests.entities": [{ entity_id: "E-ITML", score: 0.7 }, { entity_id: "E-HER", score: 0.3 }] } },
}));

function qlooWithMedia() {
  const q = makeQloo();
  q.override = (u) => {
    const t = u.searchParams.get("filter.type") || "";
    if (u.pathname === "/v2/insights" && /urn:entity:(movie|artist|book|tv_show|podcast)/.test(t)) {
      const ents = t === "urn:entity:movie" ? MEDIA : MEDIA.map((m, i) => ({ ...m, entity_id: t + i, name: t.split(":").pop() + " " + i }));
      return new Response(JSON.stringify({ results: { entities: ents } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return null;
  };
  return q;
}
const NOTED = [["E-ITML", "In the Mood for Love", "film"], ["E-HER", "Her", "film"], ["E-BIGTHIEF", "Big Thief", "music"], ["E-KLARA", "Klara and the Sun", "book"]];

function assertThreeDistinct(stay) {
  assert.equal(stay.mode, "in");
  assert.equal(stay.stops.length, 0);
  assert.equal(stay.picks.length, 3, "a night in always recommends exactly three things");
  assert.deepEqual(stay.picks.map((p) => p.kind), ["film", "music", "book"]);
  assert.equal(new Set(stay.picks.map((p) => p.qloo_id)).size, 3, "each pick is distinct");
  for (const p of stay.picks) {
    assert.ok(p.qloo_id && p.name, "pick is missing its catalogue identity");
    assert.ok(typeof p.why_line === "string" && p.why_line.trim(), `${p.name} has no why line`);
    assert.ok(IN_NOTED.some((n) => p.why_line.includes(n)), `${p.name} reason does not name a noted card: ${JSON.stringify(p.why_line)}`);
  }
}

// ---------- English ----------
test("stay-in (EN): three distinct picks, catalogue voice, each reason names a kept card", async () => {
  const env = makeEnv();
  const q = qlooWithMedia();
  setQloo(q, env);
  const user = seedUser(env, "US", NOTED);

  const stay = await makeStayIn(env, user, { text: "staying in tonight", mood: "familiar" }, () => {});
  assert.ok(q.calls.length > 0, "the stubbed catalogue was never asked for media");
  assertThreeDistinct(stay);

  for (const p of stay.picks) {
    assert.match(p.why_line, /^Because you kept /);
    assert.match(p.why_line, /; the catalogue files it under /, `${p.name} reason is not in catalogue voice: ${JSON.stringify(p.why_line)}`);
    assert.doesNotMatch(p.why_line, /Qloo files it/, `${p.name} reason still uses Qloo voice: ${JSON.stringify(p.why_line)}`);
    assert.doesNotMatch(p.why_line, /Qloo 给它的标签/, `${p.name} reason still uses the old zh wording`);
  }
});

// ---------- 简体中文 ----------
test("stay-in (zh): catalogue voice with translated tags, no raw ASCII tag words", async () => {
  const env = makeEnv();
  const q = qlooWithMedia();
  setQloo(q, env);
  const user = seedUser(env, "UZ", NOTED);

  const stay = await makeStayIn(env, user, { text: "staying in tonight", lang: "zh", mood: "familiar" }, () => {});
  const zh = stay.picks;
  assert.equal(zh.length, 3);

  for (const p of zh) {
    assert.match(p.why_line, /因为你记过/, `${p.name} reason lost the kept-card line: ${JSON.stringify(p.why_line)}`);
    assert.doesNotMatch(p.why_line, /Qloo 给它的标签/, `${p.name} reason still uses the old zh wording`);
    assert.ok(IN_NOTED.some((n) => p.why_line.includes(n)), `${p.name} reason does not name a noted card: ${JSON.stringify(p.why_line)}`);
    assert.ok(Array.isArray(p.tags) && p.tags.length >= 2, `${p.name} fixture lost its tags`);
    // The two tags used in the line must be Chinese, never the raw catalogue words.
    for (const tag of p.tags.slice(0, 2)) {
      assert.doesNotMatch(p.why_line, new RegExp(`\\b${tag}\\b`, "i"), `${p.name} reason leaks raw tag ${tag}: ${JSON.stringify(p.why_line)}`);
    }
    assert.match(p.why_line, /[\u4e00-\u9fff]/, "zh reason has no Chinese at all");
    assert.match(p.why_line, /；口味目录把它归在 .+。$/, `${p.name} reason is not in catalogue voice: ${JSON.stringify(p.why_line)}`);
  }
  assert.equal(new Set(zh.map((p) => p.qloo_id)).size, 3, "each pick is distinct");
});
