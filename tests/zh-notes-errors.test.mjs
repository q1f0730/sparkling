// In 简体中文 mode the notes feed and the inbox still showed English when
// something failed: "That did not save. Try again." (twice in the composer /
// note edit), "What got in the way?" (the did-you-go sheet) and
// "That did not go through. Try again." (inbox actions). The dictionary already
// holds those sentences; the renderers just never asked it. This test pins both
// halves: the keys exist, and every call site in the two modules goes through
// t() so the visible text is translated at write time.
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const HTML = fs.readFileSync(path.join(ROOT, "src", "app.html"), "utf8");
const NOTES = fs.readFileSync(path.join(ROOT, "src", "app", "js", "notes.feed.js"), "utf8");
const INBOX = fs.readFileSync(path.join(ROOT, "src", "app", "js", "inbox.js"), "utf8");

// Pull the whole i18n block (ZH table, Object.assign additions, trZh, t) out of
// the generated app and run it, so the app stays the only source of truth.
function loadI18n() {
  const start = HTML.indexOf("const ZH = {");
  const end = HTML.indexOf("/* DOM pass: translate exact UI strings");
  assert.ok(start > -1 && end > start, "could not find the i18n block in src/app.html");
  const block = HTML.slice(start, end);
  return new Function("LANG", block + "\nreturn { ZH: ZH, trZh: trZh, t: t };")("zh");
}
const i18n = loadI18n();

const STRINGS = [
  "That did not save. Try again.",
  "What got in the way?",
  "That did not go through. Try again.",
];

test("every new failure string exists in the 简体中文 dictionary", () => {
  for (const key of STRINGS) {
    assert.ok(Object.prototype.hasOwnProperty.call(i18n.ZH, key), "missing 简体中文 key: " + key);
    assert.match(i18n.ZH[key], /[\u4e00-\u9fff]/, "no 简体中文 text for: " + key);
    assert.equal(i18n.t(key), i18n.ZH[key], "t() must return the dictionary value for: " + key);
  }
});

test("notes.feed.js translates both save-failure strings with t()", () => {
  const wrapped = NOTES.match(/t\("That did not save\. Try again\."\)/g) || [];
  const bare = NOTES.match(/(?<!t\()"That did not save\. Try again\."/g) || [];
  assert.equal(wrapped.length, 2, "the composer and the note-edit errors must both use t()");
  assert.equal(bare.length, 0, "no bare \"That did not save. Try again.\" should be left in notes.feed.js");
});

test("notes.feed.js translates the did-you-go question with t()", () => {
  assert.match(NOTES, /t\("What got in the way\?"\)/, "the did-you-go prompt must go through t()");
  const bare = NOTES.match(/(?<!t\()"What got in the way\?"/g) || [];
  assert.equal(bare.length, 0, "no bare \"What got in the way?\" should be left in notes.feed.js");
});

test("inbox.js translates action failures with t()", () => {
  const wrapped = INBOX.match(/t\("That did not go through\. Try again\."\)/g) || [];
  const bare = INBOX.match(/(?<!t\()"That did not go through\. Try again\."/g) || [];
  assert.equal(wrapped.length, 3, "showActionError's fallback and both act/keepAll catches must use t()");
  assert.equal(bare.length, 0, "no bare \"That did not go through. Try again.\" should be left in inbox.js");
});
