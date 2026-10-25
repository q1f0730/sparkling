// compare-mine-first (walk 10-25 17:30): after tapping "Same notes, no Qloo" the sheet showed only a
// skeleton for 2.8–4.1 s although the Sparkling + Qloo half was already on the page. The half is now
// built by one helper, mineHalfHTML(plan), used for the first paint (before awaiting prefetchPlain) and
// for both final sheets (go-out stops, stay-in picks).
import test from "node:test";
import assert from "node:assert/strict";
import { read, fnSource, runFn, esc, stripTags } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const REL = "src/app/js/plan.result.js";
const base = { t: (x) => x, esc, attr: esc, LANG: "en" };

test("mineHalfHTML builds the go-out half from plan.stops", () => {
  const html = runFn(REL, "mineHalfHTML", base, [{
    mode: "out",
    stops: [{ name: "Quimby's Bookstore NYC" }, { name: "Charlotte Patisserie" }],
  }]);
  const text = stripTags(html);
  assert.match(html, /^<h3>Sparkling \+ Qloo<\/h3><ol class="plain-list">/, "header + list: " + html.slice(0, 80));
  assert.match(html, /<\/ol>$/, "the helper returns only the header and its list");
  assert.match(text, /Quimby's Bookstore NYC/);
  assert.match(text, /Charlotte Patisserie/);
  assert.match(text, /In Qloo/, "each stop keeps its catalogue badge");
});

test("mineHalfHTML builds the stay-in half from plan.picks with the kept-card line", () => {
  const html = runFn(REL, "mineHalfHTML", base, [{
    mode: "in",
    picks: [
      { name: "Happy Together", kind: "film", sources: [{ name: "In the Mood for Love", card_id: "C1" }] },
      { name: "Aftersun", kind: "film", why_line: "Because you kept Blue." },
    ],
  }]);
  const text = stripTags(html);
  assert.match(html, /^<h3>Sparkling \+ Qloo<\/h3><ol class="plain-list">/, "same header shape as go-out");
  assert.match(text, /Happy Together/);
  assert.match(html, /href="#\/cards\/C1"/, "kept cards keep their card link");
  assert.match(text, /because you kept/);
  assert.match(text, /In the Mood for Love/);
  assert.match(text, /Aftersun/);
  assert.match(text, /Because you kept Blue\./, "a pick without sources keeps its why_line");
  assert.match(text, /\(film\)/, "picks keep their kind label");
});

test("mineHalfHTML is safe for a missing plan and keeps the zh label form", () => {
  const empty = runFn(REL, "mineHalfHTML", base, [null]);
  assert.equal(empty, '<h3>Sparkling + Qloo</h3><ol class="plain-list"></ol>');
  const zh = runFn(REL, "mineHalfHTML", { t: (x) => x, esc, attr: esc, LANG: "zh" }, [{
    mode: "in",
    picks: [{ name: "Happy Together", sources: [{ name: "In the Mood for Love", card_id: "C1" }] }],
  }]);
  assert.match(stripTags(zh), /《In the Mood for Love》/);
});

test("openPlain paints the known half before awaiting the plain request", () => {
  const src = read(REL);
  const op = fnSource(src, "openPlain");
  assert.ok(op, "openPlain exists");
  const awaitAt = op.indexOf("await prefetchPlain");
  const pre = op.slice(0, awaitAt);
  assert.ok(awaitAt > 0, "openPlain still awaits prefetchPlain");
  assert.match(pre, /class="plain-skel"/, "the plain skeleton comes first");
  assert.match(pre, /mineHalfHTML\(/, "the Sparkling + Qloo half is painted before the await");
  const calls = (src.match(/mineHalfHTML\(/g) || []).length;
  assert.ok(calls >= 4, "helper defined and used in the first paint plus both final sheets (found " + calls + ")");
  assert.ok(/mineHalfHTML\(currentPlan, "r7-eyebrow"\)/.test(op), "the stay-in final sheet uses the helper");
  assert.ok(/mineHalfHTML\(currentPlan\)/.test(op), "the go-out final sheet uses the helper");
});

/* openPlain runs with the sheet/network helpers stubbed so the sheet sequence can be observed directly. */
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

test("the first sheet carries the plan's own stops while the plain request is pending", async () => {
  const sheets = [];
  let release;
  const pending = new Promise(function (res) { release = res; });
  const prefetchPlain = function () { return pending; };
  prefetchPlain.cache = Object.create(null);
  const mineHalfHTML = function (plan, eyebrow) { return runFn(REL, "mineHalfHTML", base, [plan, eyebrow]); };
  const openPlain = loadOpenPlain({
    planId: "P1",
    currentPlan: { mode: "out", id: "P1", stops: [{ name: "Cafe Quimby" }] },
    LANG: "en",
    t: function (x) { return x; },
    esc,
    attr: esc,
    mineHalfHTML,
    openSheet: function (o) { sheets.push(o); },
    prefetchPlain,
    verdictHTML: function () { return ""; },
    stopRead: function () { return ""; }
  });
  const run = openPlain();
  assert.equal(sheets.length, 1, "one sheet opens synchronously");
  const first = String(sheets[0].body || "");
  assert.match(first, /class="plain-skel"/, "the plain half shows its skeleton");
  assert.match(first, /<h3>Sparkling \+ Qloo<\/h3>/, "the known half is painted at once");
  assert.match(first, /Cafe Quimby/, "the plan's own stop is visible before the request settles");
  release({ plain: { stops: [], note: "none" } });
  await run;
  assert.equal(sheets.length, 2, "the result replaces the skeleton");
  assert.match(String(sheets[1].body), /Sparkling \+ Qloo/);
  assert.match(String(sheets[1].body), /Cafe Quimby/, "the final sheet builds the same half");
  assert.match(String(sheets[1].body), /Plain model/);
});
