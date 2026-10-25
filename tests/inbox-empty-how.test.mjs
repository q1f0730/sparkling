// Feature card inbox-empty-how (SPEC shot 2): an inbox with nothing waiting explains itself in product
// voice instead of a bare "Nothing to look at." The empty state keeps the done-wrap layout and the way back
// to the notes, adds an .inbox-how block with the line "Sparkling never guesses silently." plus the
// Margaret (singer / 2011 film) example, and every visible string has a zh entry.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runFn, read, esc, loadZh, stripTags } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const MODULE = "src/app/js/inbox.js";
const enScope = { esc, attr: esc, t: (s) => s, tr: (s) => s, LANG: "en" };

const textNodes = (html) => html.split(/<[^>]+>/).map((s) => s.trim()).filter((s) => s && /[a-z]{3}/i.test(s))
  .map((s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'"));

test("empty inbox keeps the done layout and the way back to notes", () => {
  const html = runFn(MODULE, "emptyHTML", enScope);
  assert.match(html, /class="done-wrap"/);
  assert.match(html, /data-nav="#\/notes"/);
  assert.ok(stripTags(html).includes("Back to your notes"));
  assert.match(html, /class="btn btn-sm"/);
});

test("empty inbox explains the inbox with the no-silent-guess line and the Margaret example", () => {
  const html = runFn(MODULE, "emptyHTML", enScope);
  assert.match(html, /class="[^"]*inbox-how/);
  const text = stripTags(html);
  assert.ok(text.includes("Sparkling never guesses silently."));
  assert.ok(text.includes("Margaret"));
  assert.match(text, /a singer and a 2011 film/);
  // The explainer sits inside done-wrap and before the back button.
  assert.ok(html.indexOf('class="inbox-how"') > html.indexOf('class="done-wrap"'));
  assert.ok(html.indexOf('class="inbox-how"') < html.indexOf('data-nav="#/notes"'));
});

test("every visible empty-state string has a zh entry, Margaret stays as is", () => {
  const html = runFn(MODULE, "emptyHTML", enScope);
  const trZh = loadZh();
  const nodes = textNodes(html);
  assert.ok(nodes.length >= 4, "expected title, copy, how block text and the button");
  for (const n of nodes) {
    const z = trZh(n);
    assert.notEqual(z, n, "zh missing for: " + n);
    assert.match(z, /[\u4e00-\u9fff]/, "zh not Chinese for: " + n);
  }
  assert.ok(read("src/app/js/i18n.zh.js").includes("Sparkling never guesses silently."));
});

test("the empty state renders Chinese copy when the language is zh", () => {
  const trZh = loadZh();
  const zhScope = { esc, attr: esc, t: (s) => trZh(s), tr: (s) => trZh(s), LANG: "zh" };
  const text = stripTags(runFn(MODULE, "emptyHTML", zhScope));
  assert.ok(text.includes("Sparkling 从不悄悄替你猜。"));
  assert.ok(text.includes("当一个名字可能指两样东西时，比如 Margaret（一位歌手和一部 2011 年的电影），它会在这里等你来选。"));
  assert.ok(text.includes("Margaret"), "the example name stays untranslated");
  // The button string is translated by the DOM pass, not by t() at render time.
  assert.equal(trZh("Back to your notes"), "回到笔记");
});
