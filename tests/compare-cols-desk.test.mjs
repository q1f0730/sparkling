// compare-cols-desk (walk 10-25 17:33 en 1440): the compare sheet (~420 px) listed the plain model, then
// Sparkling + Qloo, one under the other, so on a desktop a judge had to scroll to compare. Both final
// compare sheets now wrap the two halves in .pc-cols (plain left, Sparkling + Qloo right) and a desktop
// media query turns that into two columns and widens the sheet; phones keep one column.
import test from "node:test";
import assert from "node:assert/strict";
import { read, fnSource, runFn, esc } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const REL = "src/app/js/plan.result.js";
const CSS = "src/app/css/plan-stayin.css";
const base = { t: (x) => x, esc, attr: esc, LANG: "en" };

/* openPlain runs with the sheet/network helpers stubbed so the final sheet body can be inspected. */
function loadOpenPlain(scope) {
  const found = fnSource(read(REL), "openPlain");
  assert.ok(found, "openPlain exists");
  const body = found.replace(/^function\s+openPlain\s*\(/, "async function openPlain(");
  const proxy = new Proxy(scope, {
    has: (t, k) => typeof k === "string",
    get: (t, k) => (typeof k === "string" && k in t ? t[k] : typeof k === "string" && k in globalThis ? globalThis[k] : function () { return ""; })
  });
  return new Function("__scope", "with (__scope) { " + body + "\n return openPlain; }")(proxy);
}

async function finalSheetBody(plan, plain) {
  const sheets = [];
  const prefetchPlain = function () { return Promise.resolve({ plain: plain }); };
  prefetchPlain.cache = Object.create(null);
  const mineHalfHTML = function (p, eyebrow) { return runFn(REL, "mineHalfHTML", base, [p, eyebrow]); };
  const openPlain = loadOpenPlain({
    planId: "P1",
    currentPlan: plan,
    LANG: "en",
    t: function (x) { return x; },
    esc,
    attr: esc,
    mineHalfHTML,
    openSheet: function (o) { sheets.push(o); },
    prefetchPlain,
    verdictHTML: function () { return '<div class="plain-verdict">VERDICT</div>'; },
    stopRead: function () { return ""; }
  });
  await openPlain();
  assert.equal(sheets.length, 2, "skeleton, then the final sheet");
  return String(sheets[1].body || "");
}

function sectionBody(body, cls) {
  const open = '<section class="' + cls + '">';
  const start = body.indexOf(open);
  assert.ok(start >= 0, cls + " section exists");
  const end = body.indexOf("</section>", start);
  assert.ok(end > start, cls + " section closes");
  return body.slice(start + open.length, end);
}

function assertColumns(body, mine, plain) {
  assert.equal((body.match(/class="pc-cols"/g) || []).length, 1, "one .pc-cols wrapper");
  assert.equal((body.match(/class="pc-plain"/g) || []).length, 1, "one .pc-plain half");
  assert.equal((body.match(/class="pc-mine"/g) || []).length, 1, "one .pc-mine half");
  const cols = body.indexOf('<div class="pc-cols">');
  const plainAt = body.indexOf('<section class="pc-plain">');
  const mineAt = body.indexOf('<section class="pc-mine">');
  assert.ok(cols >= 0 && plainAt > cols && mineAt > plainAt, "plain half comes first, then Sparkling + Qloo");
  assert.ok(body.indexOf('<div class="plain-verdict">') >= 0, "the verdict box is present");
  assert.ok(body.indexOf('<div class="plain-verdict">') < cols, "the verdict box stays above the columns");
  const plainHalf = sectionBody(body, "pc-plain");
  const mineHalf = sectionBody(body, "pc-mine");
  assert.ok(plainHalf.indexOf("Sparkling + Qloo") < 0, "the plain half holds only the plain model");
  assert.ok(mineHalf.indexOf("Sparkling + Qloo") >= 0, "the mine half holds Sparkling + Qloo");
  plain.forEach(function (n) { assert.ok(plainHalf.indexOf(n) >= 0, "plain half names " + n); });
  mine.forEach(function (n) { assert.ok(mineHalf.indexOf(n) >= 0, "mine half names " + n); });
}

test("go-out final compare sheet puts the plain model and Sparkling + Qloo in .pc-cols", async () => {
  const body = await finalSheetBody(
    { mode: "out", id: "P1", stops: [{ name: "Cafe Quimby", qloo_id: "q1" }, { name: "Charlotte Patisserie", qloo_id: "q2" }] },
    { stops: [{ name: "Model Cafe", kind: "place", why: "a plain guess", check: { status: "found" } }], model: "meta/llama" }
  );
  assert.match(body, /Plain model/, "the plain half keeps its heading");
  assertColumns(body, ["Cafe Quimby", "Charlotte Patisserie"], ["Model Cafe"]);
  assert.ok(sectionBody(body, "pc-plain").indexOf("Model Cafe") >= 0);
  assert.ok(sectionBody(body, "pc-mine").indexOf("In Qloo") >= 0, "the Sparkling half keeps the catalogue badge");
});

test("stay-in final compare sheet puts the plain picks and Sparkling + Qloo in .pc-cols", async () => {
  const body = await finalSheetBody(
    { mode: "in", id: "P1", picks: [{ name: "Happy Together", kind: "film", sources: [{ name: "In the Mood for Love", card_id: "C1" }] }] },
    { picks: [{ name: "Aftersun", kind: "film", why: "a plain guess" }], model: "meta/llama" }
  );
  assert.match(body, /Plain model/, "the plain half keeps its heading");
  assertColumns(body, ["Happy Together"], ["Aftersun"]);
});

test("the sheet layout is one column on phones and two inside the 1000px desk query", () => {
  const css = read(CSS);
  const m = /@media[^{]*min-width:\s*1000px[^{]*\{([\s\S]*?)\n\}/.exec(css);
  assert.ok(m, "a min-width:1000px media query exists");
  const desk = m[1];
  assert.match(desk, /\.why-sheet \.pc-cols\{[^}]*display:grid/, "the desk query makes .pc-cols a grid");
  assert.match(desk, /grid-template-columns:\s*1fr 1fr/, "two equal columns");
  assert.match(desk, /gap:\s*24px/, "columns are separated");
  assert.match(desk, /align-items:\s*start/, "halves align at the top");
  assert.match(desk, /\.sheet:has\(\.pc-cols\)\{[^}]*max-width:\s*880px/, "the compare sheet widens");
  assert.match(desk, /width:\s*min\(880px,\s*calc\(100vw - 80px\)\)/, "the wide sheet keeps a viewport gutter");
  assert.match(desk, /dialog\.modal:has\(\.pc-cols\)\{[^}]*max-width:\s*880px/, "the dialog itself widens, not just the sheet");
  const outside = css.replace(m[0], "");
  assert.ok(!/\.pc-cols\s*\{[^}]*grid-template-columns/.test(outside), "phones get no column grid");
  assert.ok(!/\.pc-cols\s*\{[^}]*display:\s*grid/.test(outside), "the grid applies only from 1000px up");
});
