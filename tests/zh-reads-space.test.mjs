// Re-walk 10-25 18:00 zh 390: model prose must not glue Latin names to CJK.
// (1) plan.js zhReads stores s.read_zh through zhSpace ("你会喜欢Quimby's Bookstore NYC的艺术氛围" ->
//     "你会喜欢 Quimby's Bookstore NYC 的艺术氛围").
// (2) index.js act === "plain" runs every zh why through zhSpace after the plainWhyOk/fallback choice
//     ("作家如Kazuo Ishiguro或Mitski" -> "作家如 Kazuo Ishiguro 或 Mitski"); en whys stay byte-identical.
// Offline: tests/adversarial/harness.mjs mocks D1, Workers AI and Qloo (no real network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, call } from "./adversarial/harness.mjs";
import { zhReads, zhSpace } from "../src/plan.js";
const { default: worker } = await import("../src/index.js");

const GLUED = /[A-Za-z][\u4e00-\u9fff]|[\u4e00-\u9fff][A-Za-z]/;

test("zhReads: read_zh is spaced between Latin names and CJK", async () => {
  const env = makeEnv();
  env.AI.run = async (model, input) => {
    const sys = input.messages?.[0]?.content || "";
    if (/Translate each English sentence/.test(sys)) {
      return { response: { reads: ["你会喜欢Quimby's Bookstore NYC的艺术氛围"] } };
    }
    return { response: {} };
  };
  const stops = [{ name: "Quimby's Bookstore NYC", read: "You would like the atmosphere at Quimby's Bookstore NYC." }];
  await zhReads(env, stops);
  assert.equal(stops[0].read_zh, "你会喜欢 Quimby's Bookstore NYC 的艺术氛围");
  assert.doesNotMatch(stops[0].read_zh, GLUED);
  assert.equal(zhSpace("你会喜欢Quimby's Bookstore NYC的艺术氛围"), "你会喜欢 Quimby's Bookstore NYC 的艺术氛围");
});

const SEEDS = [
  { name: "Kazuo Ishiguro", qloo_id: "E-KI" },
  { name: "Mitski", qloo_id: "E-MI" },
];
const ZH_WHY = "作家如Kazuo Ishiguro或Mitski";
const ZH_WHY_SPACED = "作家如 Kazuo Ishiguro 或 Mitski";

function setup(U, mode, lang, why) {
  const env = makeEnv(), db = env.DB._db, now = Date.now();
  db.prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)")
    .run(U, "t" + U, "Greenpoint, Brooklyn", 40, "Saturday afternoon", now);
  const plan = mode === "in"
    ? {
      id: "P" + U, mode: "in", lang, kinds: ["book", "music"],
      picks: [
        { name: "Klara and the Sun", kind: "book", qloo_id: "X1", why_line: "Because you kept Kazuo Ishiguro." },
        { name: "Puberty 2", kind: "music", qloo_id: "X2", why_line: "Because you kept Mitski." },
      ],
      receipt: { seeds: SEEDS },
    }
    : {
      id: "P" + U, mode: "out", lang,
      stops: [{ name: "Word Bookstore", kind: "bookstore", coords: { lat: 40.73, lon: -73.95 } }],
      receipt: { seeds: SEEDS },
    };
  db.prepare("INSERT INTO plans (id,user_id,request,plan,pool,saved,created_at) VALUES (?,?,?,?,?,0,?)")
    .run("P" + U, U, JSON.stringify({ area: "Greenpoint, Brooklyn", mode, lang }), JSON.stringify(plan), "[]", now);
  env.AI.raw = () => (mode === "in"
    ? { picks: [{ name: "Never Let Me Go", kind: "book", why }] }
    : { stops: [{ name: "Some Cafe", kind: "cafe", why }] });
  return { env, cookie: "t" + U, id: "P" + U };
}

for (const mode of ["in", "out"]) {
  test(`${mode}: zh plain whys get CJK/Latin spacing`, async () => {
    const { env, cookie, id } = setup("ZS" + mode, mode, "zh", ZH_WHY);
    const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
    assert.equal(r.status, 200);
    const row = mode === "in" ? r.json.plain.picks[0] : r.json.plain.stops[0];
    assert.equal(row.why, ZH_WHY_SPACED);
    assert.doesNotMatch(row.why, GLUED);
  });

  test(`${mode}: en plain whys stay byte-identical`, async () => {
    const en = "Writers like Kazuo Ishiguro or Mitski.";
    const { env, cookie, id } = setup("ES" + mode, mode, "en", en);
    const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
    assert.equal(r.status, 200);
    const row = mode === "in" ? r.json.plain.picks[0] : r.json.plain.stops[0];
    assert.equal(row.why, en);
  });

  test(`${mode}: zh plain fallback stays clean after spacing`, async () => {
    // A rejected why (too long) falls back to the honest Chinese sentence; zhSpace must leave it intact.
    const bad = "作家如Kazuo Ishiguro或Mitski".repeat(20);
    const { env, cookie, id } = setup("FS" + mode, mode, "zh", bad);
    const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
    assert.equal(r.status, 200);
    const row = mode === "in" ? r.json.plain.picks[0] : r.json.plain.stops[0];
    assert.equal(row.why, "纯模型没有给出和你笔记相关的理由。");
  });
}
