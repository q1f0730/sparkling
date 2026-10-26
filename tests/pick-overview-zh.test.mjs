// FP-73: zh stay-in picks get a Simplified-Chinese catalogue synopsis (overview_zh).
// zhOverviews mirrors zhReads: cached by content hash under "ov:zh:", time-capped, and it must
// never throw when the model is unavailable — the English overview stays as the fallback.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { zhOverviews } from "../src/plan.js";

const PLAN = fs.readFileSync("src/plan.js", "utf8");
const FRONT = fs.readFileSync("src/app/js/plan.result.js", "utf8");

const pick = (over = {}) => ({ name: "Her", kind: "film", overview: "A quiet life with a voice.", ...over });

// A DB stub that serves one cached overview list (no model, no network).
function envWithCache(out) {
  return {
    DB: {
      prepare: () => ({
        bind: () => ({
          first: async () => ({ value: JSON.stringify(out), created_at: Date.now() }),
          run: async () => ({ success: true }),
        }),
      }),
    },
  };
}
const offlineEnv = () => ({
  DB: { prepare: () => { throw new Error("offline harness: no database"); } },
});

test("zhOverviews is exported and wired into makeStayIn right after zhReads", () => {
  assert.match(PLAN, /export async function zhOverviews\(env, picks, ms\)/);
  assert.match(PLAN, /"ov:zh:" \+ \(await sha\(/);
  assert.match(
    PLAN,
    /if \(lang === "zh"\) await zhReads\(env, dressed, 2500\);[^\n]*\n\s*if \(lang === "zh"\) await zhOverviews\(env, dressed, 2500\);/,
    "zhOverviews must run right after the zhReads cap in makeStayIn",
  );
  assert.match(PLAN, /overview: p\.overview \|\| p\.description/, "stay-in picks must carry the synopsis as overview");
});

test("zhOverviews applies cached Chinese synopses and spaces them", async () => {
  const picks = [pick(), pick({ name: "Rumours", overview: "A breakup album." })];
  await zhOverviews(envWithCache(["一段和声音相伴的安静生活。", "一张关于分手的专辑。"]), picks, 20);
  assert.equal(picks[0].overview_zh, "一段和声音相伴的安静生活。");
  assert.equal(picks[1].overview_zh, "一张关于分手的专辑。");
});

test("zhOverviews only keeps translations that actually contain Chinese", async () => {
  const picks = [pick(), pick({ name: "Rumours" })];
  await zhOverviews(envWithCache(["Still English.", "一张专辑。"]), picks, 20);
  assert.equal(picks[0].overview_zh, undefined);
  assert.equal(picks[1].overview_zh, "一张专辑。");
});

test("zhOverviews with no model does not throw and leaves overview_zh unset", async () => {
  const picks = [pick(), pick({ name: "Rumours" })];
  await zhOverviews(offlineEnv(), picks, 20);
  assert.equal(picks[0].overview_zh, undefined);
  assert.equal(picks[1].overview_zh, undefined);
});

test("zhOverviews ignores picks with no overview at all", async () => {
  const picks = [{ name: "Her" }, { name: "Rumours", overview: "" }];
  await zhOverviews(offlineEnv(), picks, 20);
  assert.equal(picks[0].overview_zh, undefined);
  assert.equal(picks[1].overview_zh, undefined);
});

test("the pick renderer prefers overview_zh in zh and keeps overview otherwise", () => {
  assert.match(FRONT, /pk\.overview_zh/, "plan.result.js must render pick.overview_zh");
  assert.match(FRONT, /pk\.overview != null/, "plan.result.js must fall back to pick.overview");
  const html = FRONT.slice(FRONT.indexOf("function pickHTML"), FRONT.indexOf("function paintIn"));
  assert.match(html, /const synopsis = zh \? \(pk\.overview_zh/, "zh must choose overview_zh before the English overview");
});

test("zhOverviews reuses read_zh when the overview is the same text (no second translation)", async () => {
  let calls = 0;
  const env = { DB: { prepare: () => ({ bind: () => ({ first: async () => null, run: async () => ({}) }) }) }, AI: { run: async () => { calls++; return { response: "{}" }; } } };
  const picks = [{ overview: "A quiet life.", read: "A quiet life.", read_zh: "安静的生活。" }];
  await zhOverviews(env, picks, 20);
  assert.equal(picks[0].overview_zh, "安静的生活。");
  assert.equal(calls, 0);
});
