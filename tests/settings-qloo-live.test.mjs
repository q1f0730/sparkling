// settings-qloo-live: "How Sparkling uses Qloo" must show something from THIS notebook, not only policy prose.
import test from "node:test";
import assert from "node:assert/strict";
import { runFn, read, esc, stripTags } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const REL = "src/app/js/settings.js";
const en = (cards, plans, t = (s) => s) => runFn(REL, "qlooLiveHTML", { t, esc, attr: esc, LANG: "en" }, [cards, plans]);

const cards = [{ id: "a", qloo_id: "Q1" }, { id: "b", qloo_id: "Q2" }, { id: "c" }];

test("en counts the cards of this notebook that are matched", () => {
  const txt = stripTags(en(cards, [{ id: "p123" }]));
  assert.ok(txt.includes("In this notebook: 2 of 3 cards are matched to a Qloo catalogue entry."), txt);
});

test("the latest saved plan links to its receipt page", () => {
  const html = en(cards, [{ id: "p123" }, { id: "p999" }]);
  assert.match(html, /href="#\/plan\/p123"/);
  assert.ok(stripTags(html).includes("See the Qloo calls behind your latest plan"), stripTags(html));
});

test("no saved plan means no receipt link", () => {
  const html = en(cards, []);
  assert.ok(!/#\/plan\//.test(html), html);
  assert.ok(stripTags(html).includes("2 of 3 cards are matched"), stripTags(html));
});

test("missing qloo_id, null rows and a null latest plan render safely", () => {
  const html = en([null, { id: "x" }, { id: "y", qloo_id: "" }, { id: "z", qloo_id: "Q9" }], [null]);
  assert.ok(stripTags(html).includes("In this notebook: 1 of 4 cards are matched to a Qloo catalogue entry."), stripTags(html));
  assert.ok(!/#\/plan\//.test(html));
  assert.ok(stripTags(en(undefined, undefined)).includes("0 of 0 cards are matched"), "bad input still renders a count");
});

test("the plan id is escaped into the href", () => {
  const html = en(cards, [{ id: 'p"1<2' }]);
  assert.ok(html.includes('href="#/plan/p&quot;1&lt;2"'), html);
});

test("zh has its own sentence for the count", () => {
  const html = runFn(REL, "qlooLiveHTML", { t: (s) => s, esc, attr: esc, LANG: "zh" }, [cards, [{ id: "p123" }]]);
  assert.ok(stripTags(html).includes("这本笔记里：3 张卡片中有 2 张对上了 Qloo 目录条目。"), stripTags(html));
});

test("both lines go through t()", () => {
  const calls = [];
  en(cards, [{ id: "p123" }], (s) => { calls.push(s); return s; });
  assert.deepEqual(calls, [
    "In this notebook: 2 of 3 cards are matched to a Qloo catalogue entry.",
    "See the Qloo calls behind your latest plan",
  ]);
});

test("settings.js carries the zh dictionary entry for the link", () => {
  const m = read(REL).match(/Object\.assign\(ZH, \{[\s\S]*?\}\);/);
  assert.ok(m, "Object.assign(ZH, {...}) in settings.js");
  const ZH = {};
  new Function("ZH", m[0])(ZH);
  assert.equal(ZH["See the Qloo calls behind your latest plan"], "查看最近一次计划背后的 Qloo 调用");
});

test("the qloo page wires both sources into the live block", () => {
  const src = read(REL);
  assert.ok((src.match(/qlooLiveHTML\(/g) || []).length >= 2, "qlooLiveHTML defined and called");
  assert.match(src, /api\("\/api\/cards"\)/);
  assert.match(src, /api\("\/api\/plans"\)/);
  assert.match(src, /data-qloo-live/, "the qloo page has a slot for the live block");
});
