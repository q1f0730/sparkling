// Plan composer presets (shot 4, one tap): two chips under the form fill the composer without submitting.
// src/app/js/plan.js is loaded the same way the sealed check does (tools/orchestra/checks/swarm/lib_front.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { read, fnSource, runFn, loadZh } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const src = read("src/app/js/plan.js");

test("the composer renders both preset chips with their English labels", () => {
  assert.match(src, /<button class="plan-preset[^"]*" type="button" data-plan-preset="out"[^>]*>/);
  assert.match(src, /<button class="plan-preset[^"]*" type="button" data-plan-preset="in"[^>]*>/);
  assert.ok(src.includes('esc(t("Saturday afternoon in Greenpoint, $40"))'), "out label goes through t()");
  assert.ok(src.includes('esc(t("I want to watch a film"))'), "in label goes through t()");
});

test("planPreset maps each chip to composer values", () => {
  const out = runFn("src/app/js/plan.js", "planPreset", {}, ["out"]);
  assert.deepEqual(out, { mode: "out", when: "Saturday afternoon", area: "Greenpoint", budget: 40, text: "" });
  const stay = runFn("src/app/js/plan.js", "planPreset", {}, ["in"]);
  assert.deepEqual(stay, { mode: "in", when: "", area: "", budget: null, text: "I want to watch a film" });
  assert.equal(runFn("src/app/js/plan.js", "planPreset", {}, ["nope"]), null);
});

// Run applyPreset on its own (not via withHelpers, so the fake inputs are what it actually touches).
function apply(preset) {
  const inputs = {
    when: { value: "" }, area: { value: "" }, budget: { value: "" }, free: { value: "", focus() {} },
  };
  const calls = [];
  const setMode = (m, auto) => calls.push([m, auto]);
  const f = new Function(
    "setMode", "view", "whenInput", "areaInput", "budgetInput", "freeInput", "t",
    "let modeLocked = false;\n" + fnSource(src, "applyPreset") + "\n" +
    "applyPreset(" + JSON.stringify(preset) + ");\n" +
    "return { locked: modeLocked, when: whenInput.value, area: areaInput.value, budget: budgetInput.value, free: freeInput.value };"
  );
  const out = f(setMode, { querySelector: () => null }, inputs.when, inputs.area, inputs.budget, inputs.free, (s) => s);
  out.mode = calls;
  return out;
}

test("the out preset fills when, area and budget and selects Go out", () => {
  const r = apply({ mode: "out", when: "Saturday afternoon", area: "Greenpoint", budget: 40, text: "" });
  assert.deepEqual(r.mode, [["out", false]], "setMode('out') without the picked-from-your-note hint");
  assert.equal(r.when, "Saturday afternoon");
  assert.equal(r.area, "Greenpoint");
  assert.equal(r.budget, "40");
  assert.equal(r.free, "", "the out preset leaves the free line alone");
  assert.equal(r.locked, true, "an explicit preset pins the mode");
});

test("the in preset switches to Stay in and puts the text in the stay-in input", () => {
  const r = apply({ mode: "in", when: "", area: "", budget: null, text: "I want to watch a film" });
  assert.deepEqual(r.mode, [["in", false]]);
  assert.equal(r.free, "I want to watch a film");
});

test("the preset click handler reacts to [data-plan-preset] and never submits", () => {
  const m = src.match(/const presetBtn = e\.target\.closest\("\[data-plan-preset\]"\);[\s\S]*?return;\s*\}/);
  assert.ok(m, "a delegated [data-plan-preset] branch in the click handler");
  assert.ok(m[0].includes('applyPreset(planPreset(presetBtn.getAttribute("data-plan-preset")))'));
  assert.ok(!/submitPlan/.test(m[0]), "a preset only fills the form");
});

test("the zh labels are in the dictionary", () => {
  const trZh = loadZh();
  assert.equal(trZh("I want to watch a film"), "我想看一部电影");
  const out = trZh("Saturday afternoon in Greenpoint, $40");
  assert.ok(/[\u4e00-\u9fff]/.test(out), "out label is Chinese: " + out);
  assert.ok(out.includes("周六") && out.includes("Greenpoint") && out.includes("40"), out);
});
