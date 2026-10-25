// FP-87: footprint rows in card detail show a compact "×" detach control instead of the long
// "Not about this" label, while keeping the class, data-detach wiring and accessible name.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runFn } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const SRC = fs.readFileSync("src/app/js/detail.js", "utf8");

function render(footprints) {
  const scope = {
    footprints,
    card: { id: "c1", name: "In the Mood for Love", type: "film" },
    esc: (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"),
    attr: (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"),
    t: (s) => s,
    tr: (s) => s,
    formatDayLabel: () => "Mar 28",
    kindLabel: (k) => k,
    sourceLabel: () => null,
    imgSrc: () => "",
    LANG: "en",
  };
  return runFn("src/app/js/detail.js", "timelineHTML", scope);
}

test("source no longer shows the long detach text inside the button", () => {
  assert.doesNotMatch(SRC, /aria-label="Not about this footprint">Not about this<\/button>/);
  assert.doesNotMatch(SRC, />Not about this<\/button>/);
});

test("source keeps the fp-detach control wiring and its accessible name", () => {
  assert.match(SRC, /class="fp-detach"/);
  assert.match(SRC, /data-detach=/);
  assert.match(SRC, /aria-label="Not about this footprint"/);
  assert.match(SRC, /title="Not about this footprint"/);
});

test("a rendered footprint row has a compact × button with tooltip", () => {
  const html = render([{ id: "f1", created_at: Date.UTC(2026, 2, 28), kind: "note", quote: "I rewatched it." }]);
  assert.match(html, /<button class="fp-detach" type="button" data-detach="f1" aria-label="Not about this footprint" title="Not about this footprint">×<\/button>/);
  assert.doesNotMatch(html, />Not about this<\/button>/);
});
