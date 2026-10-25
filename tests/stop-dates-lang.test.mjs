// "From your notes" dates must follow the app language, not the browser locale.
// zh go-out plans printed "Oct 19"/"Oct 24" because sourcesHTML formatted with toLocaleDateString(undefined, …).
import test from "node:test";
import assert from "node:assert/strict";
import { runFn, esc, stripTags } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const REL = "src/app/js/plan.result.js";
// Local noon so the calendar day is Oct 24 in every timezone.
const AT = new Date(2026, 9, 24, 12).getTime();
const base = { esc, attr: esc, typeClass: () => "", t: (s) => s, seedHTML: () => "" };
const render = (LANG, stop) => stripTags(runFn(REL, "sourcesHTML", { ...base, LANG }, [stop]));

test("zh plan shows the source date in Chinese", () => {
  const out = render("zh", { sources: [{ name: "Mitski", card_id: "c1", type: "music", at: AT }] });
  assert.match(out, /10月24日/);
  assert.doesNotMatch(out, /Oct/);
  assert.match(out, /Mitski/);
});

test("en plan keeps the existing English date", () => {
  const out = render("en", { sources: [{ name: "Mitski", card_id: "c1", type: "music", at: AT }] });
  assert.match(out, /Oct 24/);
  assert.doesNotMatch(out, /月/);
});

test("each source row formats its own date in zh", () => {
  const out = render("zh", {
    sources: [
      { name: "Mitski", card_id: "c1", type: "music", at: AT },
      { name: "Solaris", card_id: "c2", type: "film", at: new Date(2026, 8, 19, 12).getTime() },
    ],
  });
  assert.match(out, /10月24日/);
  assert.match(out, /9月19日/);
  assert.doesNotMatch(out, /Oct|Sep/);
});

test("a source without a timestamp renders no date and does not throw", () => {
  const out = render("zh", { sources: [{ name: "Mitski", card_id: "c1", type: "music" }] });
  assert.match(out, /Mitski/);
  assert.doesNotMatch(out, /月|\d{4}/);
});

test("the from-notes fallback still renders when there are no sources", () => {
  const out = render("zh", { from_notes: "You wrote about Mitski." });
  assert.match(out, /You wrote about Mitski\./);
});
