// letter-zh-client (FP-74): the monthly taste letter stayed partly English in 简体中文 —
// the taste-card footer ("15 cards touched · built on Qloo taste data"), the stats line
// ("4 new cards · 15 touched"), the taste-drift sentence (English commas and full stop) and
// the share-canvas annotations. Those nodes are not dictionary-driven (the canvas is text,
// the drift joins are inline), so the renderer must branch on LANG itself.
import test from "node:test";
import assert from "node:assert/strict";
import { runFn, fnSource, read, esc } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const THREADS = "src/app/js/threads.js";

const LETTER = {
  month: "October 2026",
  new_cards: 4,
  touched: 15,
  themes: [],
  returns: [],
  new: [],
  places: [],
  drift: { now: ["jazz", "noir"], before: ["pop", "folk"] },
  paragraphs: [],
  your_words: [],
  receipt: "No model wrote this.",
};

// renderLetter runs against a single fake letter element; the API resolves synchronously.
function render(lang) {
  const el = { innerHTML: "", querySelector: () => null };
  const view = { innerHTML: "", querySelector: (sel) => (sel === "[data-letter]" ? el : null) };
  runFn(THREADS, "renderLetter", {
    LANG: lang,
    beginView: () => 1,
    isCurrent: () => true,
    setShell: () => {},
    view,
    api: () => ({ then(cb) { cb({ letter: LETTER }); return { catch() {} }; } }),
    esc,
    attr: esc,
    tasteProfileName: () => "Juno Park",
    document: { documentElement: { lang } },
    console,
  }, []);
  return el.innerHTML;
}

test("zh: the taste-card footer and stats line speak 简体中文", () => {
  const html = render("zh");
  assert.ok(html.includes("15 张卡片 · 基于口味目录数据"), "taste-card footer stayed English: " + html);
  assert.ok(html.includes("<b>4</b> 新卡片 · <b>15</b> 张卡片"), "stats line stayed English: " + html);
  assert.ok(!html.includes("cards touched"), "zh taste-card footer still says 'cards touched'");
  assert.ok(!html.includes("new cards"), "zh stats line still says 'new cards'");
});

test("zh: taste drift joins with 、 and closes with 。", () => {
  const html = render("zh");
  assert.ok(
    html.includes("本月新卡片偏向：jazz、noir。之前的卡片偏向：pop、folk。"),
    "drift sentence is not Chinese-punctuated: " + html
  );
});

test("en: the letter copy stays byte-identical", () => {
  const html = render("en");
  assert.ok(html.includes("15 cards touched · built on Qloo taste data"), html);
  assert.ok(html.includes("<b>4</b> new cards · <b>15</b> touched"), html);
  assert.ok(
    html.includes("This month's new cards lean toward: jazz, noir. Your earlier cards leaned toward: pop, folk."),
    html
  );
  assert.ok(!html.includes("张卡片"), "English letter must not leak Chinese copy");
});

test("zh: the share-canvas annotations are translated too", () => {
  const src = fnSource(read(THREADS), "renderLetter");
  assert.ok(src, "threads.js still defines renderLetter");
  assert.ok(src.includes('" 张卡片 \\u00b7 "'), "canvas stats label needs a zh branch");
  assert.ok(src.includes('" 新卡片"'), "canvas new-cards label needs a zh branch");
  assert.ok(src.includes('"基于口味目录数据 \\u00b7 sparkling"'), "canvas footer needs a zh branch");
  assert.ok(src.includes('" cards touched \\u00b7 "'), "English canvas stats label is lost");
  assert.ok(src.includes('"Built on Qloo taste data \\u00b7 sparkling"'), "English canvas footer is lost");
});
