// pickWhyLine zh parity (shot 4 stay-in): untranslatable catalogue tags are dropped from the zh reason,
// and the 口味目录 clause disappears entirely when no tag has a Chinese name. en stays byte-identical.
import test from "node:test";
import assert from "node:assert/strict";
import { runFn } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const REL = "src/app/js/plan.result.js";
const tagZh = (x) => (String(x).toLowerCase() === "drama" ? "剧情" : x);
const base = { tagZh, t: (s) => s };

test("zh keeps translated tags and drops the rest", () => {
  const out = runFn(REL, "pickWhyLine", { ...base, LANG: "zh" }, [{ sources: [{ name: "Her" }, { name: "In the Mood for Love" }], tags: ["Drama", "Pager"] }]);
  assert.equal(out, "因为你记过《Her》和《In the Mood for Love》；口味目录把它归在 剧情。");
  assert.ok(!/Pager/.test(out));
});

test("zh with no translatable tag ends after the kept cards", () => {
  const out = runFn(REL, "pickWhyLine", { ...base, LANG: "zh" }, [{ sources: [{ name: "Her" }], tags: ["Pager", "Intimate"] }]);
  assert.equal(out, "因为你记过《Her》。");
  assert.ok(!/口味目录/.test(out));
  assert.ok(!/[A-Za-z]{4,}/.test(out.replace(/《[^》]*》/g, "")));
});

test("zh with no tags at all has no catalogue clause", () => {
  const out = runFn(REL, "pickWhyLine", { ...base, LANG: "zh" }, [{ sources: [{ name: "Her" }, { name: "Dune" }], tags: [] }]);
  assert.equal(out, "因为你记过《Her》和《Dune》。");
});

test("zh still falls back to why_line when there are no sources", () => {
  const out = runFn(REL, "pickWhyLine", { ...base, LANG: "zh" }, [{ sources: [], tags: ["Drama"], why_line: "A quiet double bill." }]);
  assert.equal(out, "A quiet double bill.");
});

test("en branch is byte-identical", () => {
  const out = runFn(REL, "pickWhyLine", { ...base, LANG: "en" }, [{ sources: [{ name: "Her" }, { name: "In the Mood for Love" }], tags: ["Drama", "Pager"] }]);
  assert.equal(out, "Because you kept Her and In the Mood for Love; the catalogue files it under drama, pager.");
});

test("en with no tags has no catalogue clause", () => {
  const out = runFn(REL, "pickWhyLine", { ...base, LANG: "en" }, [{ sources: [{ name: "Her" }], tags: [] }]);
  assert.equal(out, "Because you kept Her.");
});

test("non-array tags and sources stay safe", () => {
  const zh = runFn(REL, "pickWhyLine", { ...base, LANG: "zh" }, [{ sources: [{ name: "Her" }], tags: null }]);
  assert.equal(zh, "因为你记过《Her》。");
  const en = runFn(REL, "pickWhyLine", { ...base, LANG: "en" }, [{ sources: [{ name: "Her" }], tags: "Drama" }]);
  assert.equal(en, "Because you kept Her.");
});
