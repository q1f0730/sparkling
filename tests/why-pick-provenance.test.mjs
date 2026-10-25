// FP-70: a stay-in pick's read is the catalogue's synopsis, not a Qloo-tag template and not model copy.
// The why sheet must say so in both languages; go-out template/model footnotes stay byte-identical.
import test from "node:test";
import assert from "node:assert/strict";
import { runFn, esc, stripTags } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const REL = "src/app/js/plan.result.js";
const base = {
  esc, attr: esc, t: (s) => s,
  plural: (n, one, many) => (Number(n) === 1 ? one : many),
  seedHTML: () => "", typeClass: () => "", stopRead: (s) => (s && s.read) || "",
  formatDate: () => "24 Oct", whyZhDate: () => "10月24日",
};
const whyHTML = (lang, stop, plan) => runFn(REL, "whyStopHTML", { ...base, LANG: lang }, [stop, plan || { stops: [stop] }]);
const whyText = (lang, stop, plan) => stripTags(whyHTML(lang, stop, plan));

const pick = (over = {}) => ({
  name: "Word Bookstore",
  kind: "bookstore",
  overview: "A quiet shop for film lovers.",
  read: "A quiet shop for film lovers.",
  why: { affinity: 0.6 },
  ...over,
});

test("en stay-in pick read is labelled from the catalogue's description", () => {
  const html = whyHTML("en", pick(), { mode: "in", picks: [pick()] });
  assert.ok(html.includes("From the catalogue's description."), html);
  assert.doesNotMatch(html, /A plain template filled|A sentence written by a model/);
});

test("zh stay-in pick read is labelled 目录里的简介", () => {
  const txt = whyText("zh", pick(), { mode: "in", picks: [pick()] });
  assert.ok(txt.includes("目录里的简介"), "zh label: " + txt);
  assert.doesNotMatch(txt, /固定模板|由模型根据场所介绍写成/);
});

test("stay-in pick without overview falls back to its description", () => {
  const s = pick({ overview: undefined, description: "A quiet shop for film lovers." });
  const html = whyHTML("en", s, { mode: "in", picks: [s] });
  assert.ok(html.includes("From the catalogue's description."), html);
});

test("stay-in pick whose read is not the synopsis keeps the template line", () => {
  const s = pick({ read: "A sentence the reader wrote.", overview: "A quiet shop for film lovers." });
  const txt = whyText("en", s, { mode: "in", picks: [s] });
  assert.ok(txt.includes("No model wrote this."), txt);
  assert.doesNotMatch(txt, /catalogue's description/);
});

test("go-out model and template footnotes are unchanged", () => {
  const tpl = whyText("en", { name: "Some Cafe", read: "A spot.", why: { affinity: 0.4 } });
  assert.ok(tpl.includes("A plain template filled"), tpl);
  assert.ok(tpl.includes("No model wrote this."), tpl);
  assert.doesNotMatch(tpl, /catalogue's description/);

  const model = whyText("en", { name: "Some Cafe", read: "A spot.", read_src: "model", why: { affinity: 0.4 } });
  assert.ok(model.includes("A sentence written by a model"), model);
  assert.ok(model.includes("It is not Qloo data."), model);
});
