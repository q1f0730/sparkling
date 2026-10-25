// Keyboard focus must be visible on the plan screen's inline When / Area / Budget inputs.
// The underline colour change alone is not a focus ring, so :focus-visible gets an outline.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "src/app/css/type-b.css"), "utf8");
const manifest = JSON.parse(readFileSync(join(root, "src/app/manifest.json"), "utf8"));
const moduleOrder = manifest.modules.map((m) => m.file);

function rules(selector) {
  const re = new RegExp("([^{}]*" + selector + "[^{}]*)\\{([^}]*)\\}", "g");
  return [...css.matchAll(re)].map((m) => ({ sel: m[1].trim(), body: m[2].replace(/\s+/g, " ").trim() }));
}

const baseIdx = css.indexOf(".inline-input:focus,.inline-input:focus-visible");
const baseRules = rules("\\.inline-input:focus,\\.inline-input:focus-visible");
const visibleRules = rules("\\.inline-input:focus-visible");

test("the old underline-only rule still exists and does not set an outline", () => {
  assert.ok(baseIdx >= 0, "type-b.css has the .inline-input focus rule");
  assert.equal(baseRules.length, 1, "exactly one combined focus rule");
  assert.match(baseRules[0].body, /border-bottom-color:var\(--b-sage-ink\)/);
  assert.doesNotMatch(baseRules[0].body, /outline\s*:/, "mouse focus keeps the plain underline change");
});

test("a dedicated :focus-visible rule draws a sage outline", () => {
  const ring = visibleRules.find((r) => /outline\s*:\s*2px solid/.test(r.body));
  assert.ok(ring, "type-b.css gives .inline-input:focus-visible a 2px outline");
  assert.equal(ring.sel, ".inline-input:focus-visible", "the ring rule targets focus-visible only");
  assert.match(ring.body, /outline:2px solid var\(--b-sage-ink\)/);
  assert.match(ring.body, /outline-offset:3px/);
  assert.match(ring.body, /border-radius:4px/);
});

test("the focus ring comes after the underline rule and after screens.css", () => {
  const ringIdx = css.lastIndexOf(".inline-input:focus-visible");
  assert.ok(ringIdx > baseIdx, "the outline rule comes after the old underline-only rule");
  assert.ok(moduleOrder.indexOf("css/screens.css") < moduleOrder.indexOf("css/type-b.css"),
    "type-b.css loads after screens.css so outline:none there is overridden");
});

test("the sage ink token exists in both themes", () => {
  const decls = [...css.matchAll(/--b-sage-ink:\s*([^;]+);/g)].map((m) => m[1].trim());
  assert.ok(decls.length >= 2, "light and dark themes define --b-sage-ink");
  assert.ok(decls.every((v) => v.length > 0));
});
