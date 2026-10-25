// zh stay-in plans: the "How this was made" log lines read Chinese end to end, English stays byte-identical,
// and the server zh tag table (zhTag) covers every sample-notebook tag so a zh why_line never shows "Intimate".
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { makeEnv, makeQloo, setQloo } from "./adversarial/harness.mjs";
register("./adversarial/html-loader.mjs", import.meta.url);
const { default: worker } = await import("../src/index.js");
const { makeStayIn, zhTag } = await import("../src/plan.js");

// Every tag the sample notebook's catalogue rows can carry (same list as the sealed check).
const TAGS = ["Adult", "Aesthetic minded", "Ambition", "Art versus mundanity", "Asia", "Audiobook", "Biography", "Biography Memoir", "Chillout", "Cinematic", "Classics", "Composed", "Confessional", "Contemplative", "Contemporary", "Crime", "Dedicated", "Devoted", "Drama loving", "Dream Pop", "Elegantly", "Emotionally engaged", "Essays", "Event venue", "Everyday minimalism", "Fantasy", "Fiction", "Folk - Rock", "Food", "Forbidden desire", "Fragmentary", "Friendship", "German Literature", "Germany", "Grief", "Hip - Hop", "Hipster chic", "Identity", "Improvised feel", "Indie - Folk", "Indie Pop", "Indie Rock", "Intimate", "Introspective", "Japanese", "Japanese Literature", "Jazz Hop", "Literature", "Live music venue", "Lounge", "Lounge bar", "Lyrical", "Mature", "Memoir", "Memory", "Memory drama", "Moody", "Movie theater", "Muted", "Naturalistic", "Near future", "Novels", "Observational", "Obsession", "Passionate", "Photographic framing", "Quiet lyricism", "Repetitive musical motifs", "Sci fi romance", "Second chances", "Sensitive", "Singer & Songwriter", "Soft focus", "Speculative Fiction", "Stylized", "Sunrise motifs", "Temporal collage", "Thoughtful", "Tourist attraction", "Traditional", "Travel", "Trip - Hop", "Urban alienation", "Vulnerability"];

async function newSession(env) {
  const U = "U" + Math.random().toString(36).slice(2, 10);
  env.DB._db.prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)").run(U, "t" + U, "Greenpoint, Brooklyn", 40, "Saturday afternoon", Date.now());
  return { token: "t" + U, user: { id: U } };
}
// Catalogue mock: movies for urn:entity:movie insights, with explainability back to the seed cards.
const MOVIES = ["Chungking Express", "Tokyo Story", "Happy Together", "Yi Yi", "Fallen Angels", "In the Mood for Love"].map((n, i) => ({
  entity_id: i === 5 ? "E-ITML" : "M-" + i, name: n, popularity: 0.9 - i * 0.01,
  tags: [{ name: "Drama", type: "urn:tag:genre:media" }, { name: "Intimate", type: "urn:tag:plot:qloo" }, { name: "Pager", type: "urn:tag:keyword:media" }],
  properties: { release_year: 1990 + i, image: { url: `https://images.qloo.com/i/M${i}.jpg` }, collaborators: ["Director " + i], short_descriptions: [{ value: "A one-line summary " + i + ".", languages: ["en"] }] },
  query: { affinity: 0.8, explainability: { "signal.interests.entities": [{ entity_id: "E-ITML", score: 0.7 }, { entity_id: "E-HER", score: 0.3 }] } },
}));
function qlooWithMovies() {
  const q = makeQloo();
  q.override = (u) => {
    if (u.pathname === "/v2/insights" && /urn:entity:(movie|artist|book|tv_show|podcast)/.test(u.searchParams.get("filter.type") || "")) {
      const t = u.searchParams.get("filter.type");
      const ents = t === "urn:entity:movie" ? MOVIES : MOVIES.map((m, i) => ({ ...m, entity_id: t + i, name: t.split(":").pop() + " " + i }));
      return new Response(JSON.stringify({ results: { entities: ents } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return null;
  };
  return q;
}
function seed(env, U) {
  const db = env.DB._db, now = Date.now();
  [["E-ITML", "In the Mood for Love", "film"], ["E-HER", "Her", "film"], ["E-BIGTHIEF", "Big Thief", "music"], ["E-KLARA", "Klara and the Sun", "book"]].forEach(([q, n, t], i) => {
    db.prepare("INSERT INTO cards (id,user_id,qloo_id,name,type,heart,image,created_at) VALUES (?,?,?,?,?,?,?,?)").run("C" + i + U, U, q, n, t, i === 0 ? 1 : 0, null, now);
    db.prepare("INSERT INTO footprints (id,user_id,card_id,note_id,kind,sentiment,quote,created_at) VALUES (?,?,?,?,?,?,?,?)").run("F" + i + U, U, "C" + i + U, null, "note", "positive", "a line I wrote about " + n, now - i * 1000);
  });
}
const han = (s) => /[\u4e00-\u9fff]/.test(String(s || ""));
async function run(env, req) {
  const { user } = await newSession(env);
  seed(env, user.id);
  const lines = [];
  const plan = await makeStayIn(env, { id: user.id }, req, (l) => lines.push(String(l)));
  return { plan, lines };
}
const zhEnv = () => { const env = makeEnv({ READ_TIMEOUT_MS: "50" }); setQloo(qlooWithMovies(), env); return env; };

test("zh stay-in: every log line is Chinese and matches the zh copy", async () => {
  const { plan, lines } = await run(zhEnv(), { text: "我想看一部电影，根据我的记录推荐", lang: "zh", mood: "familiar", period: "all" });
  assert.ok(lines.length >= 3, "log lines: " + lines.length);
  assert.deepEqual(lines.filter((l) => !han(l)), [], "English-only log lines in a zh plan");
  assert.equal(lines[0], "在家：找一部电影，不需要选街区。");
  assert.ok(lines.some((l) => /^拿.+去问口味目录要电影：回来 6 个，其中 1 个你已经记过。$/.test(l)), lines.join(" | "));
  assert.ok(lines.some((l) => /^选了 3 个：《.+》。$/.test(l)), lines.join(" | "));
  assert.equal(plan.picks.length, 3);
  for (const p of plan.picks) {
    assert.ok(!/Intimate|Drama/.test(p.why_line || ""), "zh why_line still shows English tags: " + p.why_line);
    assert.match(p.why_line, /因为你记过.*；口味目录把它归在 剧情、亲密。/);
  }
});

test("zh stay-in: two kinds are both named in the staying-in line", async () => {
  const { lines } = await run(zhEnv(), { text: "A film and an album", lang: "zh" });
  assert.equal(lines[0], "在家：找一部电影、一些音乐，不需要选街区。");
  assert.ok(lines.every(han), lines.join(" | "));
});

test("zh stay-in: the period line is Chinese too", async () => {
  const { lines } = await run(zhEnv(), { text: "我想看一部电影", lang: "zh", mood: "familiar", period: "now" });
  assert.ok(lines.includes("只依据你最近的记录。"), lines.join(" | "));
  assert.ok(lines.every(han), lines.join(" | "));
});

test("en stay-in: every log line is byte-identical to before (no Chinese)", async () => {
  const env = makeEnv({ READ_TIMEOUT_MS: "50" }); setQloo(qlooWithMovies(), env);
  const { lines } = await run(env, { text: "Watch a movie tonight", lang: "en", mood: "familiar", period: "all" });
  assert.equal(lines[0], "Staying in: looking for a film. No neighbourhood needed.");
  assert.ok(lines.some((l) => /^Asked the catalogue for film with .+: 6 came back, 1 you already have cards for\.$/.test(l)), lines.join(" | "));
  assert.ok(lines.some((l) => /^Picked 3: .+\.$/.test(l)), lines.join(" | "));
  assert.ok(lines.every((l) => !han(l.replace(/《[^》]*》/g, ""))), "no Chinese in en log: " + lines.join(" | "));
});

test("server zhTag covers every sample-notebook tag", () => {
  const miss = TAGS.filter((t) => !han(zhTag(t)));
  assert.equal(miss.length, 0, miss.length + " tags without zh: " + miss.join(", "));
  assert.equal(zhTag("Intimate"), "亲密");
  assert.equal(zhTag("Drama"), "剧情");
  assert.equal(zhTag("Folk - Rock"), "民谣摇滚");
  assert.equal(zhTag("Not a real tag"), "Not a real tag", "unknown tags keep the catalogue name");
});
