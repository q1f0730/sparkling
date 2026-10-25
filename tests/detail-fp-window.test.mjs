// Card detail footprints show the context of the mention, not the whole note: a ~200 char window around
// the card's name with the name marked, ellipses on trimmed sides, short notes whole. Loaded the same way
// the sealed check does (tools/orchestra/checks/swarm/lib_front.mjs runFn).
import { test } from "node:test";
import assert from "node:assert/strict";
import { runFn, stripTags } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const NAME = "In the Mood for Love";
const pad = (n, w) => Array.from({ length: n }, (_, i) => w + i).join(" ");

function render(footprints, cardName = NAME) {
  const scope = {
    footprints,
    card: { id: "c1", name: cardName, type: "film" },
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

function quoteText(html) {
  const start = html.indexOf("fp-quote");
  if (start < 0) return null;
  return stripTags(html.slice(start).replace(/^[^>]*>/, "").split("</p>")[0]);
}

function rows(html) {
  return html.split('data-fp-id="').slice(1);
}

test("a long note that names the card shows a window around the mention, name marked", () => {
  const note = pad(40, "before") + " then I rewatched in the mood for love, the corridor and the score, " + pad(40, "after");
  const html = render([{ id: "f1", created_at: Date.UTC(2026, 2, 28), kind: "note", quote: note }]);
  const row = rows(html)[0];
  assert.match(row, /<mark class="fp-hit">in the mood for love<\/mark>/i, "the mention is marked in the quote's own casing");
  const text = quoteText(row);
  assert.ok(text.length <= 210, "window stays at most ~200 chars, got " + text.length);
  assert.ok(text.startsWith("…") && text.endsWith("…"), "ellipsis on both trimmed sides");
  assert.ok(/corridor/.test(text), "the window keeps the words around the mention");
});

test("a short note is shown whole with the name marked", () => {
  const short = "Rewatched In the Mood for Love with Sam.";
  const html = render([{ id: "f2", created_at: Date.UTC(2026, 3, 2), kind: "note", quote: short }]);
  const row = rows(html)[0];
  assert.match(row, /<mark class="fp-hit">In the Mood for Love<\/mark>/);
  assert.equal(quoteText(row), short, "no trimming for a quote that fits");
});

test("a long note without the name shows its head plus an ellipsis and no mark", () => {
  const note = "The corridor scene again. " + pad(60, "word");
  const html = render([{ id: "f3", created_at: Date.UTC(2026, 3, 9), kind: "note", quote: note }]);
  const row = rows(html)[0];
  assert.ok(!/fp-hit/.test(row), "no mark when the note does not name the card");
  const text = quoteText(row);
  assert.ok(text.startsWith("The corridor scene"), "head is kept");
  assert.ok(text.endsWith("…") && !text.startsWith("…"), "only the cut tail is marked with an ellipsis");
  assert.equal(text.length, 201, "first 200 chars plus one ellipsis");
});

test("quote text stays escaped, including inside the marked window", () => {
  const short = "Rewatched <b>In the Mood for Love</b> & left shaken.";
  const html = render([{ id: "f4", created_at: Date.UTC(2026, 3, 10), kind: "note", quote: short }]);
  const row = rows(html)[0];
  assert.ok(!/<b>/.test(row), "no raw tags from the note");
  assert.match(row, /&lt;b&gt;<mark class="fp-hit">In the Mood for Love<\/mark>&lt;\/b&gt;/);
  assert.match(row, /&amp; left shaken/);
});

test("rows keep their data-fp-id, fp-top and fp-detach markup", () => {
  const html = render([{ id: "f5", created_at: Date.UTC(2026, 3, 11), kind: "note", quote: "A short note." }]);
  const row = rows(html)[0];
  assert.ok(row.startsWith('f5"'), "data-fp-id is unchanged");
  assert.match(row, /class="fp-top"/);
  assert.match(row, /class="fp-detach"/);
});
