// zh parity: the camera screen hardcoded English in placeholder/aria-label and in
// text set after paint (remove/save button labels, camera-permission fallback).
// Every one of them must go through t() and have a 简体中文 entry (or pattern).
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const HTML = fs.readFileSync(path.join(ROOT, "src", "app.html"), "utf8");
const CAMERA = fs.readFileSync(path.join(ROOT, "src", "app", "js", "camera.js"), "utf8");

function loadI18n() {
  const start = HTML.indexOf("const ZH = {");
  const end = HTML.indexOf("/* DOM pass: translate exact UI strings");
  assert.ok(start > -1 && end > start, "could not find the i18n block in src/app.html");
  const block = HTML.slice(start, end);
  return new Function("LANG", block + "\nreturn { ZH: ZH, trZh: trZh, t: t };")("zh");
}
const i18n = loadI18n();

// Exactly the strings this card is about.
const STRINGS = [
  "Add a few words, or just save",
  "Remove photo",
  "Remove this photo",
  "Save photo",
  "Camera access is off for this site. You can still choose a photo from your library.",
  "If your camera does not open, choose a photo from your library instead.",
];

test("every camera string has a 简体中文 translation", () => {
  for (const key of STRINGS) {
    assert.ok(Object.prototype.hasOwnProperty.call(i18n.ZH, key), "missing 简体中文 key: " + key);
    assert.match(i18n.trZh(key), /[\u4e00-\u9fff]/, "not translated: " + key);
  }
  assert.equal(i18n.t("Save 3 photos"), "保存 3 张照片", "Save N photos needs a zh pattern");
});

test("camera.js sends every string through t()", () => {
  for (const key of STRINGS) {
    assert.ok(CAMERA.includes('t("' + key + '")'), "camera.js does not wrap in t(): " + key);
  }
  // placeholder and aria-label share the one caption string, escaped for the attribute
  const placeholder = CAMERA.match(/placeholder="' \+ attr\(t\("Add a few words, or just save"\)\) \+ '"/);
  assert.ok(placeholder, "caption placeholder must be t()-wrapped");
  const aria = CAMERA.match(/aria-label="' \+ attr\(t\("Add a few words, or just save"\)\) \+ '"/);
  assert.ok(aria, "caption aria-label must be t()-wrapped");
  // save label with a count
  assert.match(CAMERA, /t\("Save " \+ selected\.length \+ " photos"\)/, "Save N photos must be t()-wrapped");
});
