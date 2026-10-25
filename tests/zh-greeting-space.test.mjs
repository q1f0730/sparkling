// zh-greeting-no-space: the notes greeting joins a day part and a sentence
// (<span>day.</span> + <em>sentence</em>). In zh the two must touch ("周日。这周…"), while en
// keeps its single space ("Sunday. Two things…").
import test from "node:test";
import assert from "node:assert/strict";
import { read, fnSource, esc, stripTags } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const SRC = "src/app/js/notes.feed.js";
const TEXT = "Sunday. Two things came back to you this week.";
const ZH_TEXT = "周日。这周有两样东西又回到你的身边。";

function paintGreetingHTML(lang, text) {
  const src = fnSource(read(SRC), "paintGreeting");
  assert.ok(src, "paintGreeting found in notes.feed.js");
  const slot = { innerHTML: "" };
  const scope = {
    LANG: lang,
    view: { querySelector: (sel) => (sel === "[data-greeting]" ? slot : null) },
    esc,
    greetingText: () => text,
    greetingNotes: [],
    greetingCards: [],
    weekdayShort: () => "Sun",
    formatDate: () => "Oct 25",
  };
  const f = new Function("__scope", "with (__scope) { " + src + "\n return paintGreeting; }");
  f(scope)();
  return slot.innerHTML;
}

function greeting(html) {
  const m = /<h2 class="greeting r7-greeting">([\s\S]*?)<\/h2>/.exec(html);
  assert.ok(m, "greeting heading rendered");
  return m[1];
}

test("source: the greeting never joins span and em with a literal space", () => {
  const line = read(SRC)
    .split("\n")
    .find((l) => l.includes('class="greeting r7-greeting"'));
  assert.ok(line, "greeting markup line found");
  assert.ok(!/<\/span> <em>/.test(line), "literal space joiner left: " + line.trim());
  assert.ok(/LANG\s*===\s*"zh"/.test(line), "joiner must depend on LANG: " + line.trim());
});

test("zh greeting renders the day and the sentence with no ASCII space", () => {
  const h = greeting(paintGreetingHTML("zh", TEXT));
  assert.equal(h, "<span>Sunday.</span><em>Two things came back to you this week.</em>");
  // The DOM pass translates the two text nodes; the join between them must add nothing.
  const translated = h.replace("Sunday.", "周日。").replace("Two things came back to you this week.", "这周有两样东西又回到你的身边。");
  assert.equal(stripTags(translated), ZH_TEXT);
});

test("en greeting keeps its single space", () => {
  const h = greeting(paintGreetingHTML("en", TEXT));
  assert.equal(h, "<span>Sunday.</span> <em>Two things came back to you this week.</em>");
  assert.equal(stripTags(h), TEXT);
});
