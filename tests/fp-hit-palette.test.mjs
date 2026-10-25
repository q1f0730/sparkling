// The matched card name inside a footprint quote (<mark class="fp-hit">, src/app/js/detail.js) must use the
// type-B palette instead of the browser's default neon mark colour, and stay readable in both themes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/app/css/type-b.css", import.meta.url), "utf8");

function fpHitRules(source) {
  return [...source.matchAll(/(^|[}\n])\s*([^{}@]*\.fp-hit[^{}]*)\{([^}]*)\}/g)];
}

test("type-b.css declares a .fp-hit rule", () => {
  const rules = fpHitRules(css);
  assert.ok(rules.length >= 1, "expected a .fp-hit rule in src/app/css/type-b.css");
});

test(".fp-hit uses the butter palette tokens for background and colour", () => {
  const body = fpHitRules(css).map((m) => m[3]).join(";");
  assert.match(body, /background[^;]*var\(--b-butter\)/, "background should use var(--b-butter)");
  assert.match(body, /color\s*:[^;]*(var\(--b-butter-ink\)|inherit)/, "text colour should be var(--b-butter-ink) or inherit");
});

test(".fp-hit is rounded, padded and clones across line breaks", () => {
  const body = fpHitRules(css).map((m) => m[3]).join(";");
  assert.match(body, /border-radius\s*:\s*[34]px/, "small border-radius");
  assert.match(body, /padding\s*:\s*0\s+[0-9]+px/, "horizontal-only padding");
  assert.match(body, /box-decoration-break\s*:\s*clone/, "box-decoration-break: clone for wrapped marks");
  assert.match(body, /-webkit-box-decoration-break\s*:\s*clone/, "webkit prefix for Safari");
});

test(".fp-hit carries no neon literal", () => {
  const body = fpHitRules(css).map((m) => m[3]).join(";");
  assert.ok(!/#ff0\b|#ffff00|yellow/i.test(body), "no browser-default neon yellow");
});
