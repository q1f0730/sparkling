// zh go-out plans: every "How this was made" log line reads Simplified Chinese end to end
// (venue names kept, works in 《》), while the English log stays byte-identical.
// Fixtures follow tests/demo-mainline-plan.test.mjs and the sealed plan_out_log_zh check.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makePlan } from "../src/plan.js";
import { makeEnv, setQloo, makeQloo } from "./adversarial/harness.mjs";

const OUT_NOTED = [["E-KLARA", "Klara and the Sun", "book"], ["E-ITML", "In the Mood for Love", "film"], ["E-BIGTHIEF", "Big Thief", "music"], ["E-NORWOOD", "Norwegian Wood", "book"]];

// ---------- fixtures ----------
const cat = (name) => ({ name, type: "urn:tag:category:place" });
const sat = (o, c) => ({ saturday: [{ opens: `T${o}:00`, closes: `T${c}:00`, closed: false }] });
function place(id, name, primary, cats, extra = {}) {
  return {
    entity_id: id, name, popularity: 0.8,
    location: extra.loc || { lat: 40.7295, lon: -73.9540 },
    tags: [...cats.map(cat), { name: "Afternoon", type: "urn:tag:time_of_day_fit:qloo" }, { name: "Cozy", type: "urn:tag:ambience:qloo" }],
    properties: {
      address: extra.address || "100 Franklin St Brooklyn, NY 11222", neighborhood: extra.hood || "Greenpoint",
      primary_genre: { name: primary }, price_level: 1, is_closed: !!extra.closed, hours: extra.hours === undefined ? sat("08", "19") : extra.hours,
      localities: extra.localities || [{ name: "11222", place: "ZCTA" }, { name: "Greenpoint", place: "neighbourhood" }, { name: "Brooklyn", place: "borough" }],
    },
    query: { affinity: 0.8, explainability: { "signal.interests.entities": [{ entity_id: "E-KLARA", score: 0.6 }, { entity_id: "E-ITML", score: 0.4 }] } },
  };
}

function seedUser(env, U, cards) {
  const db = env.DB._db, now = Date.now();
  db.prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)").run(U, "t" + U, "Greenpoint, Brooklyn", 40, "Saturday afternoon", now);
  cards.forEach(([qlooid, name, type], i) => {
    db.prepare("INSERT INTO cards (id,user_id,qloo_id,name,type,heart,created_at) VALUES (?,?,?,?,?,?,?)").run("C" + i + U, U, qlooid, name, type, 1, now);
    db.prepare("INSERT INTO footprints (id,user_id,card_id,note_id,kind,sentiment,quote,created_at) VALUES (?,?,?,?,?,?,?,?)").run("F" + i + U, U, "C" + i + U, null, "note", "positive", "a line I wrote about " + name, now - i * 1000);
  });
  return db.prepare("SELECT * FROM users WHERE id=?").get(U);
}

async function run(lang, opts = {}) {
  const env = makeEnv({ READ_TIMEOUT_MS: "50" });
  const q = makeQloo();
  q.places = [
    place("OK-BOOK", "Word", "Book store", ["Book store"], { address: "126 Franklin St Brooklyn, NY 11222", loc: { lat: 40.729, lon: -73.957 } }),
    place("OK-CAFE", "Odd Fox Coffee", "Coffee shop", ["Coffee shop"], { address: "984 Manhattan Ave Brooklyn, NY 11222", loc: { lat: 40.731, lon: -73.954 } }),
    place("OK-REC", "Rough Trade", "Record store", ["Record store"], { address: "64 N 9th St Brooklyn, NY 11249", hood: "Greenpoint", loc: { lat: 40.721, lon: -73.957 } }),
  ];
  // A cafe that only opens after the afternoon window closes is dropped by the checks; one that opens
  // mid-afternoon but shuts before the visit ends survives the checks and is skipped when walking.
  if (opts.cafeHours) q.places[1].properties.hours = opts.cafeHours;
  // Stub every place lookup; anything the code does not get here would hit the disabled real network.
  q.override = (u) => {
    if (u.pathname !== "/v2/insights" || u.searchParams.get("filter.type") !== "urn:entity:place") return null;
    return new Response(JSON.stringify({ results: { entities: q.places } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  setQloo(q, env);
  const user = seedUser(env, "UO", OUT_NOTED);
  const lines = [];
  const plan = await makePlan(env, user, { area: "Greenpoint, Brooklyn", mood: "familiar", lang, period: opts.period, when: lang === "zh" ? "周六下午" : "Saturday afternoon" }, (l) => lines.push(String(l)));
  return { plan, lines };
}
const han = (s) => /[\u4e00-\u9fff]/.test(String(s || ""));

test("zh go-out: every log line is Chinese and matches the zh copy", async () => {
  const { plan, lines } = await run("zh");
  assert.equal(plan.stops.length, 3, "the afternoon should walk three stops");
  assert.deepEqual(lines.filter((l) => !han(l)), [], "English-only log lines in a zh go-out plan");
  assert.deepEqual(lines, [
    "用 4 张卡片做种子：《Klara and the Sun》、《In the Mood for Love》、《Big Thief》、《Norwegian Wood》。",
    "要找：书店、咖啡馆、唱片店，范围在 Greenpoint, Brooklyn。",
    "拿《Klara and the Sun》、《Norwegian Wood》、《In the Mood for Love》等去问口味目录要书店，范围在 Greenpoint, Brooklyn：回来 3 个，1 个通过检查（2 个品类不对、已关门或不是能停留的地方）。",
    "拿《Klara and the Sun》、《In the Mood for Love》、《Big Thief》等去问口味目录要咖啡馆，范围在 Greenpoint, Brooklyn：回来 3 个，1 个通过检查（2 个品类不对、已关门或不是能停留的地方）。",
    "拿《Big Thief》、《Klara and the Sun》、《In the Mood for Love》等去问口味目录要唱片店，范围在 Greenpoint, Brooklyn：回来 3 个，1 个通过检查（2 个品类不对、已关门或不是能停留的地方）。",
    "检查排除了 18 个品类不对。",
    "让各站靠得近一些：Word、Odd Fox Coffee、Rough Trade。",
    "查过周六的营业时间，并为每一站写了一句。",
  ]);
});

test("zh go-out: the period line is Chinese too", async () => {
  const { lines } = await run("zh", { period: "now" });
  assert.equal(lines[0], "只依据你最近的记录。");
  assert.ok(lines.every(han), lines.join(" | "));
});

test("zh go-out: a stop skipped for hours reads Chinese and names the time", async () => {
  const { plan, lines } = await run("zh", { cafeHours: sat("14", "15") });
  assert.equal(plan.stops.length, 2, "the cafe should be left out");
  assert.ok(lines.includes("我找到的咖啡馆在周六 14:40 前后都没开门，所以这一站先跳过。"), lines.join(" | "));
  assert.ok(lines.every(han), lines.join(" | "));
});

test("en go-out: every log line is byte-identical to before (no Chinese)", async () => {
  const { plan, lines } = await run("en");
  assert.equal(plan.stops.length, 3);
  assert.deepEqual(lines, [
    "Using 4 cards as seeds: Klara and the Sun, In the Mood for Love, Big Thief, Norwegian Wood.",
    "Looking for: bookstore, then cafe, then record store, around Greenpoint, Brooklyn.",
    "Asked the catalogue for bookstore near Greenpoint, Brooklyn with Klara and the Sun, Norwegian Wood, In the Mood for Love…: 3 came back, 1 passed the checks (2 wrong kind, closed or not a stop).",
    "Asked the catalogue for cafe near Greenpoint, Brooklyn with Klara and the Sun, In the Mood for Love, Big Thief…: 3 came back, 1 passed the checks (2 wrong kind, closed or not a stop).",
    "Asked the catalogue for record store near Greenpoint, Brooklyn with Big Thief, Klara and the Sun, In the Mood for Love…: 3 came back, 1 passed the checks (2 wrong kind, closed or not a stop).",
    "Checks left out 18 of the wrong kind.",
    "Kept stops close together: Word then Odd Fox Coffee then Rough Trade.",
    "Checked hours for Saturday and wrote one line per stop.",
  ]);
  assert.ok(lines.every((l) => !han(l)), "no Chinese in an en log: " + lines.join(" | "));
});
