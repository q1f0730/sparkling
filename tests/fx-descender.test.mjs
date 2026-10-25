import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/app/css/fx.css", import.meta.url), "utf8");

function ruleFor(selector) {
  const re = new RegExp("(^|[}\\n])\\s*" + selector + "\\s*\\{([^}]*)\\}");
  const m = css.match(re);
  assert.ok(m, selector + " rule exists");
  return m[2];
}

function decl(rule, prop) {
  const m = rule.match(new RegExp("(?:^|;)\\s*" + prop + "\\s*:\\s*([^;]+)"));
  assert.ok(m, prop + " is set");
  return m[1];
}

function sides(value) {
  const p = value.trim().split(/\s+/);
  if (p.length === 1) return [p[0], p[0], p[0], p[0]];
  if (p.length === 2) return [p[0], p[1], p[0], p[1]];
  if (p.length === 3) return [p[0], p[1], p[2], p[1]];
  return p;
}

function em(value) {
  if (value === "0") return 0;
  const m = value.match(/^(-?[\d.]+)em$/);
  assert.ok(m, "em value: " + value);
  return parseFloat(m[1]);
}

test(".fx-w leaves room for serif descenders (padding-bottom >= .25em)", () => {
  const pad = sides(decl(ruleFor("\\.fx-w"), "padding"));
  assert.ok(em(pad[2]) >= 0.25, "padding-bottom >= .25em, got " + pad[2]);
});

test(".fx-w negative margin-bottom exactly cancels padding-bottom so layout does not move", () => {
  const rule = ruleFor("\\.fx-w");
  const pad = sides(decl(rule, "padding"));
  const mar = sides(decl(rule, "margin"));
  assert.ok(Math.abs(em(mar[2]) + em(pad[2])) < 0.001,
    "margin-bottom must cancel padding-bottom: " + mar[2] + " vs " + pad[2]);
});

test(".fx-w keeps the reveal mask and the other shorthand values", () => {
  const rule = ruleFor("\\.fx-w");
  assert.match(rule, /overflow\s*:\s*hidden/, "overflow stays hidden (reveal mask)");
  assert.match(rule, /display\s*:\s*inline-block/);
  assert.match(rule, /vertical-align\s*:\s*top/);
  const pad = sides(decl(rule, "padding"));
  const mar = sides(decl(rule, "margin"));
  assert.equal(em(pad[0]), 0, "padding-top");
  assert.equal(em(pad[1]), 0.06, "padding-right");
  assert.equal(em(pad[3]), 0, "padding-left");
  assert.equal(em(mar[0]), 0, "margin-top");
  assert.equal(em(mar[1]), -0.06, "margin-right");
  assert.equal(em(mar[3]), 0, "margin-left");
});
