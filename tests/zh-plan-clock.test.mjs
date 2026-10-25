// zh-plan-clock: a zh plan must not show English AM/PM clock times. The server (fmtT in src/plan.js)
// sends "h:mm AM"/"h:mm PM" and ranges like "2:00–4:37 PM"; plan.result.js renders those in the stop
// time, the desktop route map labels and the header window. zhClock() converts them for LANG === "zh"
// and returns every other string untouched.
import test from "node:test";
import assert from "node:assert/strict";
import { runFn, esc, stripTags } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const REL = "src/app/js/plan.result.js";
const zh = (s) => runFn(REL, "zhClock", { LANG: "zh" }, [s]);
const en = (s) => runFn(REL, "zhClock", { LANG: "en" }, [s]);

test("zhClock turns English clock times into Chinese day halves", () => {
  assert.equal(zh("2:00 PM"), "下午 2:00");
  assert.equal(zh("11:30 AM"), "上午 11:30");
  assert.equal(zh("2:00–4:37 PM"), "下午 2:00–4:37");
  assert.equal(zh("11:00 AM–1:30 PM"), "上午 11:00–下午 1:30");
});

test("zhClock leaves en and non-matching text unchanged", () => {
  assert.equal(en("2:00–4:37 PM"), "2:00–4:37 PM");
  assert.equal(en("2:00 PM"), "2:00 PM");
  assert.equal(zh("Hours not checked"), "Hours not checked");
  assert.equal(zh(""), "");
  assert.equal(zh(null), null);
});

test("zh stop time uses the Chinese clock", () => {
  const stop = { name: "Café", arrive: "2:00 PM", stay_min: 40, kind: "place", coords: { lat: 40.72, lon: -73.95 } };
  const base = { esc, attr: esc, t: (s) => s, sourcesHTML: () => "", stopEvidenceHTML: () => "", stopRead: () => "", busyAction: false };
  const out = stripTags(runFn(REL, "stopHTML", { ...base, LANG: "zh" }, [stop, 0, [stop]]));
  assert.match(out, /下午 2:00 &middot; 40 分钟/);
  assert.doesNotMatch(out, /2:00 PM/);
  const enOut = stripTags(runFn(REL, "stopHTML", { ...base, LANG: "en" }, [stop, 0, [stop]]));
  assert.match(enOut, /2:00 PM &middot; 40 min/);
});

test("zh route map labels use the Chinese clock", () => {
  const stops = [
    { name: "A", arrive: "2:53 PM", coords: { lat: 40.72, lon: -73.95 } },
    { name: "B", arrive: "4:37 PM", coords: { lat: 40.73, lon: -73.94 } },
  ];
  const base = { esc, attr: esc, t: (s) => s };
  const out = stripTags(runFn(REL, "sideHTML", { ...base, LANG: "zh" }, [stops, {}]));
  assert.match(out, /下午 2:53/);
  assert.match(out, /下午 4:37/);
  assert.doesNotMatch(out, /PM/);
});

test("zh header window uses one shared day half for a same-half range", () => {
  const view = { classList: { add() {}, remove() {} }, innerHTML: "" };
  const plan = {
    mode: "out",
    stops: [
      { name: "A", arrive: "2:00 PM", leave: "2:40 PM", kind: "place", coords: { lat: 40.72, lon: -73.95 } },
      { name: "B", arrive: "2:53 PM", leave: "4:37 PM", kind: "place", coords: { lat: 40.73, lon: -73.94 } },
    ],
  };
  const scope = {
    LANG: "zh", t: (s) => s, esc, attr: esc, isCurrent: () => true, token: 1, currentPlan: null,
    view, plural: (n, a, b) => (n === 1 ? a : b), prefetchPlain: () => {}, stopRead: () => "",
    sourcesHTML: () => "", stopEvidenceHTML: () => "", receiptHTML: () => "", traceHeadHTML: () => "",
  };
  runFn(REL, "paint", scope, [plan]);
  assert.match(stripTags(view.innerHTML), /下午 2:00–4:37/);
  assert.doesNotMatch(stripTags(view.innerHTML), /PM/);
});
