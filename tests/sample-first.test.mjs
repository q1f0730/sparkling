// sample-first (prod): SAMPLE_FIRST=1 marks the page and the welcome screen leads with Juno Park's sample notebook.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs"; import vm from "node:vm";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, call } from "./adversarial/harness.mjs";
const { default: worker } = await import("../src/index.js");
const ob = fs.readFileSync(new URL("../src/app/js/onboarding.js", import.meta.url), "utf8");
function load() {
  const pick = (name) => { const m = new RegExp("function\\s+" + name + "\\s*\\(").exec(ob); let i = ob.indexOf("{", m.index), d = 0;
    for (let j = i; j < ob.length; j++) { if (ob[j] === "{") d++; else if (ob[j] === "}" && --d === 0) return ob.slice(m.index, j + 1); } };
  const ctx = { esc: String, attr: String, icons: { chevron: "" } };
  vm.createContext(ctx); vm.runInContext(pick("onboardingChoiceHTML") + pick("onboardingChoicesHTML") + ";globalThis.f=onboardingChoicesHTML;", ctx);
  return ctx.f;
}
test("flag off: welcome choices unchanged (note, sample, history)", () => {
  const html = load()(false);
  assert.deepEqual([...html.matchAll(/data-choice="(\w+)"/g)].map((m) => m[1]), ["note", "sample", "history"]);
  assert.ok(!html.includes("choice-primary"));
});
test("flag on: sample first, primary, named after Juno Park", () => {
  const html = load()(true);
  assert.deepEqual([...html.matchAll(/data-choice="(\w+)"/g)].map((m) => m[1]), ["sample", "note", "history"]);
  assert.match(html, /class="choice choice-primary" type="button" data-choice="sample"/);
  assert.ok(html.includes("Open Juno Park's sample notebook"));
});
test("server marks the page only when SAMPLE_FIRST=1", async () => {
  const on = await call(worker, makeEnv({ SAMPLE_FIRST: "1" }), "GET", "/");
  assert.match(on.text, /<html data-sample-first="1"/);
  const off = await call(worker, makeEnv(), "GET", "/");
  assert.ok(!/^<html[^>]*data-sample-first/m.test(off.text.split("<head")[0]), "flag off: <html> must not be marked");
});
