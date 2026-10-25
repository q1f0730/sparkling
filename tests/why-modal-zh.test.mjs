// FP-67/68/72: the "Why this stop?" sheet and the re-plan diff must speak 简体中文 in a zh plan.
// Everything in the Qloo evidence card (popularity scale, attribution note, model-vs-template footnote),
// the contribution dates and the numbered diff lines were still English ("Popularity 0.72 (0 is obscure…)",
// "24 Oct", "Pick 1"). en output must stay byte-identical.
import test from "node:test";
import assert from "node:assert/strict";
import { runFn, esc, stripTags } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const REL = "src/app/js/plan.result.js";
const AT = new Date(2026, 9, 24, 12).getTime(); // local noon, 24 Oct 2026
const EN_DATE = "24 Oct";
const base = {
  esc, attr: esc, t: (s) => s, plural: (n, one, many) => (Number(n) === 1 ? one : many),
  seedHTML: () => "", typeClass: () => "", stopRead: (s) => (s && s.read) || "",
  formatDate: () => EN_DATE,
};
const whyHTML = (lang, stop) => runFn(REL, "whyStopHTML", { ...base, LANG: lang }, [stop, { stops: [stop] }]);
const whyText = (lang, stop) => stripTags(whyHTML(lang, stop));

const stop = (over = {}) => ({
  name: "Word Bookstore",
  kind: "bookstore",
  read: "A quiet shop.",
  why: {
    affinity: 0.81,
    popularity: 0.72,
    vibes: ["quiet"],
    contributions: [
      { name: "Mitski", card_id: "c1", type: "music", score: 0.6, at: AT, quote: "saw her live" },
      { name: "Solaris", card_id: "c2", type: "film", score: 0.4, at: AT },
    ],
  },
  ...over,
});

test("zh popularity line uses the 冷门 / 人人都知道 scale", () => {
  const txt = whyText("zh", stop());
  assert.ok(txt.includes("0.72"), "keeps the number: " + txt);
  assert.ok(txt.includes("0 代表冷门，1 代表人人都知道"), "zh scale copy: " + txt);
  assert.doesNotMatch(txt, /Popularity|0 is obscure|everywhere/);
});

test("en popularity line is byte-identical", () => {
  const html = whyHTML("en", stop());
  assert.ok(html.includes('<p class="why-line">Popularity 0.72 (0 is obscure, 1 is everywhere).</p>'), html);
});

test("zh model-written read footnote says it is not Qloo data", () => {
  const txt = whyText("zh", stop({ read_src: "model" }));
  assert.ok(txt.includes("不是 Qloo 的数据"), "zh footnote: " + txt);
  assert.doesNotMatch(txt, /A sentence written by a model|It is not Qloo data/);
});

test("en model footnote unchanged and zh template footnote is Chinese", () => {
  assert.ok(whyHTML("en", stop({ read_src: "model" })).includes("It is not Qloo data."));
  const tpl = whyText("zh", stop({ read_src: "template" }));
  assert.ok(tpl.includes("没有模型"), "zh template footnote: " + tpl);
  assert.doesNotMatch(tpl, /A plain template|No model wrote this/);
});

test("zh contribution dates read N月N日", () => {
  const txt = whyText("zh", stop());
  assert.ok(txt.includes("10月24日"), "zh date: " + txt);
  assert.doesNotMatch(txt, /Oct/);
});

test("en contribution dates keep formatDate output", () => {
  const txt = whyText("en", stop());
  assert.ok(txt.includes(EN_DATE), "en date: " + txt);
  assert.doesNotMatch(txt, /月/);
});

test("zh Qloo evidence copy is Chinese", () => {
  const txt = whyText("zh", stop());
  assert.ok(txt.includes("Qloo 的依据"), "label: " + txt);
  assert.ok(txt.includes("三层分开呈现"), "zh intro: " + txt);
  const bare = whyText("zh", { name: "Some Cafe", why: { affinity: 0.5 } });
  assert.ok(bare.includes("这一站没有逐项归因"), "zh attribution note: " + bare);
  assert.doesNotMatch(bare, /Per-input attribution/);
});

test("zh diff numbers the changed pick with a full-width colon", () => {
  const plan = { diff: { card: "Solaris", unit: "pick", changes: [{ stop: 1, was: "Her", now: "Arrival" }], kept: ["Blue"] } };
  const txt = stripTags(runFn(REL, "diffHTML", { ...base, LANG: "zh" }, [plan]));
  assert.ok(txt.includes("第1个："), "zh numbered diff: " + txt);
});

test("zh diff numbers stops too, and en keeps its wording", () => {
  const plan = { diff: { card: "Solaris", unit: "stop", changes: [{ stop: 2, was: "A", now: "B" }] } };
  const zh = stripTags(runFn(REL, "diffHTML", { ...base, LANG: "zh" }, [plan]));
  assert.ok(zh.includes("第2站："), "zh stop number: " + zh);
  const en = stripTags(runFn(REL, "diffHTML", { ...base, LANG: "en" }, [plan]));
  assert.ok(en.includes("Stop 2"), "en unchanged: " + en);
  assert.doesNotMatch(en, /第/);
});
