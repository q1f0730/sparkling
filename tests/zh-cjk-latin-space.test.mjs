// FP-32b: zh plan copy keeps clean CJK/Latin spacing — no stray space before CJK punctuation and
// exactly one space between a Latin run and a CJK character. The widened plan notice is built in
// plan.js (it used to be left to the client translator, which produced "Williamsburg 。").
import { test } from "node:test";
import assert from "node:assert/strict";
import { planNotice, zhSpace, makePlan } from "../src/plan.js";
import { makeEnv, setQloo, makeQloo } from "./adversarial/harness.mjs";

const GLUED = /[A-Za-z][\u4e00-\u9fff]|[\u4e00-\u9fff][A-Za-z]/;
const SPACE_BEFORE_PUNCT = /[ \t]+[，。、；：！？）」』》]/;

function assertClean(s) {
  assert.doesNotMatch(s, SPACE_BEFORE_PUNCT, "stray space before CJK punctuation: " + s);
  assert.doesNotMatch(s, GLUED, "Latin run glued to a CJK character: " + s);
}

test("zhSpace: no space before CJK punctuation", () => {
  assert.equal(zhSpace("这一站在 Williamsburg 。"), "这一站在 Williamsburg。");
  assert.equal(zhSpace("两站都在 Greenpoint 。"), "两站都在 Greenpoint。");
  assert.equal(zhSpace("范围在 Greenpoint, Brooklyn ，又找到 2 个"), "范围在 Greenpoint, Brooklyn，又找到 2 个");
});

test("zhSpace: exactly one space between Latin and CJK", () => {
  assert.equal(zhSpace("扩大到Williamsburg"), "扩大到 Williamsburg");
  assert.equal(zhSpace("Margaret去问口味目录"), "Margaret 去问口味目录");
  assert.equal(zhSpace("回来3个"), "回来 3 个");
  assert.equal(zhSpace("在  Williamsburg   附近"), "在 Williamsburg 附近");
  // Chinese-to-Chinese spacing is left alone (the catalogue why line keeps its own layout).
  assert.equal(zhSpace("口味目录把它归在 剧情。"), "口味目录把它归在 剧情。");
  assert.equal(zhSpace(null), "");
});

test("zh plan notice: widened stop names the hood without a stray space", () => {
  const zh = planNotice([{ neighborhood: "Williamsburg" }], "Greenpoint, Brooklyn", true, "zh");
  assert.equal(zh, "Greenpoint 附近匹配的不多，所以我往外多找了一点。这一站在 Williamsburg。");
  assertClean(zh);
});

test("zh plan notice: border, multi-hood and counted forms stay clean", () => {
  const both = planNotice([{ neighborhood: "Williamsburg" }, { neighborhood: "Williamsburg" }], "Greenpoint, Brooklyn", false, "zh");
  assert.equal(both, "Qloo 在 Greenpoint 附近最匹配的地方，有的在边界外。两站都在 Williamsburg。");
  assertClean(both);

  const twoHoods = planNotice([{ neighborhood: "Williamsburg" }, { neighborhood: "Ridgewood" }], "Greenpoint, Brooklyn", true, "zh");
  assert.equal(twoHoods, "Greenpoint 附近匹配的不多，所以我往外多找了一点。这几站在 Williamsburg 和 Ridgewood。");
  assertClean(twoHoods);

  const one = planNotice([{ neighborhood: "Greenpoint" }, { neighborhood: "Williamsburg" }], "Greenpoint, Brooklyn", false, "zh");
  assert.equal(one, "Qloo 在 Greenpoint 附近最匹配的地方，有的在边界外。有一站在 Williamsburg。");
  assertClean(one);

  const many = planNotice([{ neighborhood: "Greenpoint" }, { neighborhood: "Williamsburg" }, { neighborhood: "Ridgewood" }], "Greenpoint, Brooklyn", true, "zh");
  assert.equal(many, "Greenpoint 附近匹配的不多，所以我往外多找了一点。有 2 站在 Williamsburg 和 Ridgewood。");
  assertClean(many);
});

test("en plan notice is byte-identical to before", () => {
  assert.equal(planNotice([{ neighborhood: "Williamsburg" }], "Greenpoint, Brooklyn", true),
    "Not much matched right in Greenpoint, so I looked a little further. The stop is in Williamsburg.");
  assert.equal(planNotice([{ neighborhood: "Greenpoint" }, { neighborhood: "Williamsburg" }], "Greenpoint, Brooklyn", false),
    "The best matches near Greenpoint spill over the border. One stop is in Williamsburg.");
});

// ---- integration: a zh go-out plan with a person seed (bare Latin name, no 《》) in the log.
const OUT_SEEDS = [["E-ITML", "In the Mood for Love", "film"], ["E-MARGARET", "Margaret", "person"]];
const cat = (name) => ({ name, type: "urn:tag:category:place" });
const sat = (o, c) => ({ saturday: [{ opens: `T${o}:00`, closes: `T${c}:00`, closed: false }] });
const place = (id, name, primary, cats, extra = {}) => ({
  entity_id: id, name, popularity: 0.8,
  location: extra.loc || { lat: 40.7295, lon: -73.9540 },
  tags: [...cats.map(cat), { name: "Afternoon", type: "urn:tag:time_of_day_fit:qloo" }],
  properties: {
    address: extra.address || "100 Franklin St Brooklyn, NY 11222", neighborhood: "Greenpoint",
    primary_genre: { name: primary }, price_level: 1, is_closed: false,
    hours: extra.hours === undefined ? sat("08", "19") : extra.hours,
    localities: [{ name: "11222", place: "ZCTA" }, { name: "Greenpoint", place: "neighbourhood" }, { name: "Brooklyn", place: "borough" }],
  },
  query: { affinity: 0.8, explainability: { "signal.interests.entities": [{ entity_id: "E-ITML", score: 0.6 }] } },
});

function seedUser(env, U, cards) {
  const db = env.DB._db, now = Date.now();
  db.prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)").run(U, "t" + U, "Greenpoint, Brooklyn", 40, "周六下午", now);
  cards.forEach(([qlooid, name, type], i) => {
    db.prepare("INSERT INTO cards (id,user_id,qloo_id,name,type,heart,created_at) VALUES (?,?,?,?,?,?,?)").run("C" + i + U, U, qlooid, name, type, 1, now);
    // The film card is the newest footprint, so seeds sort [film, person] and the bare name ends up
    // right before 去问 in the catalogue line.
    db.prepare("INSERT INTO footprints (id,user_id,card_id,note_id,kind,sentiment,quote,created_at) VALUES (?,?,?,?,?,?,?,?)").run("F" + i + U, U, "C" + i + U, null, "note", "positive", "a line about " + name, now - i * 1000);
  });
  return db.prepare("SELECT * FROM users WHERE id=?").get(U);
}

test("zh go-out log: bare Latin seed names keep one space before CJK", async () => {
  const env = makeEnv({ READ_TIMEOUT_MS: "50" });
  const q = makeQloo();
  q.places = [
    place("OK-BOOK", "Word", "Book store", ["Book store"]),
    place("OK-CAFE", "Odd Fox Coffee", "Coffee shop", ["Coffee shop"]),
    place("OK-REC", "Rough Trade", "Record store", ["Record store"]),
  ];
  q.override = (u) => {
    if (u.pathname !== "/v2/insights" || u.searchParams.get("filter.type") !== "urn:entity:place") return null;
    return new Response(JSON.stringify({ results: { entities: q.places } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  setQloo(q, env);
  const user = seedUser(env, "UC", OUT_SEEDS);
  const lines = [];
  const plan = await makePlan(env, user, { area: "Greenpoint, Brooklyn", mood: "familiar", lang: "zh", when: "周六下午" }, (l) => lines.push(String(l)));

  assert.equal(plan.stops.length, 3);
  const askLine = lines.find((l) => /Margaret/.test(l) && /去问/.test(l));
  assert.ok(askLine, "the catalogue line names the person seed: " + lines.join(" | "));
  assert.match(askLine, /、Margaret 去问口味目录/);
  assert.doesNotMatch(askLine, /Margaret去/);
  for (const l of lines) assertClean(l);
});
