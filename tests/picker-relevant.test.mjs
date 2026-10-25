// FP-82: the Inbox "Something else" picker listed unrelated hits for a two-word name
// ("Normal People" surfaced "Axwell · DJ" from the catalogue's fuzzy search). The picker
// must keep only rows whose name shares a real word with the query, while never emptying
// the list and never filtering CJK queries (where word splitting does not apply).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(ROOT, "src/app/js/picker.js"), "utf8");

// string/comment aware brace matcher (same shape as the other front-end tests)
function fnSource(text, name) {
  const re = new RegExp("function\\s+" + name + "\\s*\\(");
  const m = re.exec(text);
  assert.ok(m, "picker.js defines " + name);
  let i = text.indexOf("{", m.index), depth = 0, q = null;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (q) { if (c === "\\") { j++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; continue; }
    if (c === "/" && text[j + 1] === "/") { j = text.indexOf("\n", j); continue; }
    if (c === "/" && text[j + 1] === "*") { j = text.indexOf("*/", j) + 1; continue; }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(m.index, j + 1);
  }
  return null;
}

const pickerRelevant = new Function(fnSource(src, "pickerRelevant") + "; return pickerRelevant;")();
const names = (rows) => rows.map((r) => r.name);

test("drops catalogue noise that shares no word with the query, keeps order", () => {
  const rows = [
    { name: "Normal People" },
    { name: "Axwell · DJ" },
    { name: "Awesome People" },
    { name: "The Bible For Normal People" },
  ];
  const out = pickerRelevant(rows, "Normal People");
  assert.deepEqual(names(out), ["Normal People", "Awesome People", "The Bible For Normal People"]);
  assert.equal(out[0], rows[0], "the exact row stays first");
});

test("case-insensitive and ignores words shorter than three letters", () => {
  const rows = [{ name: "normal people" }, { name: "AXWELL · DJ" }, { name: "People Just Do Nothing" }];
  assert.deepEqual(names(pickerRelevant(rows, "Normal People")), ["normal people", "People Just Do Nothing"]);
  // "tv" is too short to be evidence, so the query carries no usable word and every row stays.
  assert.equal(pickerRelevant(rows, "tv").length, rows.length);
});

test("keeps every row when the query has no word of three or more letters", () => {
  const rows = [{ name: "Her" }, { name: "Axwell · DJ" }];
  const asIs = pickerRelevant(rows, "go");
  assert.equal(asIs, rows, "the original array is returned untouched");
});

test("any row survives a CJK query, even with no Latin overlap", () => {
  const rows = [{ name: "君の名は" }, { name: "Normal People" }];
  assert.deepEqual(names(pickerRelevant(rows, "君の名は")), ["君の名は", "Normal People"]);
});

test("never empties the list: unrelated hits stay when filtering would leave nothing", () => {
  const rows = [{ name: "Axwell · DJ" }, { name: "Boards of Canada" }];
  const out = pickerRelevant(rows, "Normal People");
  assert.equal(out.length, rows.length, "an empty picker is worse than a fuzzy one");
  assert.deepEqual(names(out), names(rows));
});

test("tolerates missing names and non-array input", () => {
  const rows = [{ name: "Normal People" }, {}, { name: null }];
  assert.deepEqual(names(pickerRelevant(rows, "normal")), ["Normal People"]);
  assert.deepEqual(pickerRelevant(null, "normal"), []);
  assert.deepEqual(pickerRelevant(rows, null).length, 3);
});

test("search() stores the filtered rows (not the raw catalogue answer)", () => {
  const m = src.match(/async function search\(force\)\{[\s\S]*?\n  \}\n/);
  assert.ok(m, "search() is present");
  assert.match(m[0], /pickerRelevant\(/, "search() funnels the catalogue rows through pickerRelevant");
});
