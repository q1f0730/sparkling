// Stay-in why line names the card of the pick's own kind first (FP-51).
// A film pick explained by a music card (higher score) and a film card must read
// "Because you kept <film> and <music>", never the music artist first, and the
// same rule applies per kind (a music pick leads with the music card). No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeStayIn } from "../src/plan.js";
import { makeEnv, setQloo, makeQloo } from "./adversarial/harness.mjs";

const CARDS = [
  ["E-BIGTHIEF", "Big Thief", "music"],
  ["E-HER", "Her", "film"],
  ["E-CHUNGKING", "Chungking Express", "film"],
];

function seedUser(env, U) {
  const db = env.DB._db, now = Date.now();
  db.prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)").run(U, "t" + U, "Greenpoint, Brooklyn", 40, "Saturday afternoon", now);
  CARDS.forEach(([qloo, name, type], i) => {
    db.prepare("INSERT INTO cards (id,user_id,qloo_id,name,type,heart,created_at) VALUES (?,?,?,?,?,?,?)").run("C" + i + U, U, qloo, name, type, 1, now - i * 1000);
    db.prepare("INSERT INTO footprints (id,user_id,card_id,note_id,kind,sentiment,quote,created_at) VALUES (?,?,?,?,?,?,?,?)").run("F" + i + U, U, "C" + i + U, null, "note", "positive", "a line I wrote about " + name, now - i * 1000);
  });
  return db.prepare("SELECT * FROM users WHERE id=?").get(U);
}

// Fresh media per kind whose explainability always puts the music card above the film card.
const TITLES = ["In the Mood for Love", "Tokyo Story", "Happy Together"];
function mediaFor(kind) {
  return TITLES.map((n, i) => ({
    entity_id: `E-${kind.toUpperCase()}-${i}`, name: kind === "film" ? n : n + " " + kind, popularity: 0.9 - i * 0.01,
    tags: [{ name: "Drama", type: "urn:tag:genre:media" }],
    properties: { release_year: 1990 + i, image: { url: `https://images.qloo.com/i/${kind}${i}.jpg` }, short_descriptions: [{ value: "A one-line summary.", languages: ["en"] }] },
    query: { affinity: 0.8, explainability: { "signal.interests.entities": [{ entity_id: "E-BIGTHIEF", score: 0.9 }, { entity_id: "E-HER", score: 0.4 }] } },
  }));
}

function catalogue() {
  const q = makeQloo();
  q.override = (u) => {
    const t = u.searchParams.get("filter.type") || "";
    if (u.pathname === "/v2/insights" && /urn:entity:(movie|artist|book|tv_show|podcast)/.test(t)) {
      const kind = { "urn:entity:movie": "film", "urn:entity:artist": "music", "urn:entity:book": "book", "urn:entity:tv_show": "tv", "urn:entity:podcast": "podcast" }[t];
      return new Response(JSON.stringify({ results: { entities: mediaFor(kind) } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return null;
  };
  return q;
}

test("stay-in film why names the film card before the music card", async () => {
  const env = makeEnv();
  setQloo(catalogue(), env);
  const user = seedUser(env, "UD1");

  const stay = await makeStayIn(env, user, { text: "watch a movie tonight", mood: "familiar" }, () => {});
  assert.equal(stay.picks.length, 3);
  const film = stay.picks[0];
  assert.equal(film.kind, "film");
  assert.match(film.why_line, /^Because you kept Her and Big Thief/, `music card led the film reason: ${JSON.stringify(film.why_line)}`);
  assert.ok(film.why_line.indexOf("Her") < film.why_line.indexOf("Big Thief"), "cross-domain card is named first");
  assert.deepEqual(film.sources.map((s) => s.name), ["Her", "Big Thief"], "sources order must match the why line");
});

test("stay-in zh film why names the film card before the music card", async () => {
  const env = makeEnv();
  setQloo(catalogue(), env);
  const user = seedUser(env, "UD2");

  const stay = await makeStayIn(env, user, { text: "watch a movie tonight", mood: "familiar", lang: "zh" }, () => {});
  const film = stay.picks[0];
  assert.equal(film.kind, "film");
  assert.match(film.why_line, /因为你记过/);
  assert.ok(film.why_line.indexOf("《Her》") > -1, `film title missing from zh reason: ${JSON.stringify(film.why_line)}`);
  assert.ok(film.why_line.indexOf("《Her》") < film.why_line.indexOf("《Big Thief》"), `cross-domain card is named first in zh: ${JSON.stringify(film.why_line)}`);
});

test("each pick leads with a card of its own kind (film vs music)", async () => {
  const env = makeEnv();
  setQloo(catalogue(), env);
  const user = seedUser(env, "UD3");

  const stay = await makeStayIn(env, user, { text: "staying in tonight", mood: "familiar" }, () => {});
  const film = stay.picks.find((p) => p.kind === "film");
  const music = stay.picks.find((p) => p.kind === "music");
  assert.ok(film && music, "fixture lost its film or music pick");
  assert.match(film.why_line, /^Because you kept Her and Big Thief/, `film reason: ${JSON.stringify(film.why_line)}`);
  assert.match(music.why_line, /^Because you kept Big Thief and Her/, `music reason: ${JSON.stringify(music.why_line)}`);
});
