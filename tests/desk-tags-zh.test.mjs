// Walk 10-25 17:30 zh 1440: the desktop cards-wall side pane (platforms/web/pf.js)
// printed catalogue tags in English ("Foreground framing", "Forbidden desire",
// "Emotionally engaged") even though src/app/js/core.js ships TAG_ZH for them.
// pf.js now maps each tag through window.tagZh (en passthrough), and src/pwa.js
// (served /pf.js) must be regenerated so the shipped file carries the mapping.
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pf = fs.readFileSync(path.join(ROOT, "platforms", "web", "pf.js"), "utf8");
const pwa = fs.readFileSync(path.join(ROOT, "src", "pwa.js"), "utf8");
const core = fs.readFileSync(path.join(ROOT, "src", "app", "js", "core.js"), "utf8");

// The app's own dictionary, so the pane and the cards page cannot drift apart.
function loadTagZh(lang) {
  const table = core.match(/const TAG_ZH\s*=\s*(\{[\s\S]*?\});/);
  const fn = core.match(/function tagZh\([\s\S]*?\n/);
  assert.ok(table, "TAG_ZH table in src/app/js/core.js");
  assert.ok(fn, "tagZh() in src/app/js/core.js");
  return new Function("LANG", "const TAG_ZH = " + table[1] + ";\n" + fn[0] + "\nreturn tagZh;")(
    lang,
  );
}

const tagZh = loadTagZh("zh");
const tagZhEn = loadTagZh("en");

// The exact span template pf.js uses for every catalogue tag.
function loadTagRenderer(source) {
  const line = source.split("\n").find((l) => l.includes('class="dk-tags"'));
  assert.ok(line, "dk-tags renderer found");
  const from = line.indexOf("tags.map(");
  const to = line.indexOf('.join("")', from);
  assert.ok(from > -1 && to > -1, "tag span builder found");
  const expr = line.slice(from, to + '.join("")'.length);
  return new Function("tags", "tones", "esc", "window", "return " + expr + ";");
}

function renderTags(render, tags, win) {
  return render(tags, ["sage", "clay", "butter"], (s) => String(s), win);
}

const SAMPLE = ["Foreground framing", "Forbidden desire", "Emotionally engaged"];

test("the side pane maps catalogue tags through the app's tagZh", () => {
  const line = pf.split("\n").find((l) => l.includes('class="dk-tags"'));
  assert.match(line, /tagZh/, "dk-tags passes tags through tagZh");

  const render = loadTagRenderer(pf);
  const out = renderTags(render, SAMPLE, { tagZh });
  for (const tag of SAMPLE) {
    assert.ok(out.includes(tagZh(tag)), "zh tag rendered: " + tagZh(tag));
    assert.ok(!out.includes(">" + tag + "<"), "English tag must not survive: " + tag);
  }
  assert.ok(out.includes("前景构图"));
  assert.match(out, /class="dk-tag sage"/);
});

test("English mode and a page without tagZh keep the raw tag text", () => {
  const render = loadTagRenderer(pf);
  const en = renderTags(render, SAMPLE, { tagZh: tagZhEn });
  for (const tag of SAMPLE) assert.ok(en.includes(">" + tag + "<"), "en unchanged: " + tag);

  const bare = renderTags(render, SAMPLE, {});
  for (const tag of SAMPLE) assert.ok(bare.includes(">" + tag + "<"), "no-tagZh fallback: " + tag);
});

test("src/pwa.js was rebuilt with the tagZh mapping", () => {
  // The bundle embeds each served file as a [content-type, body] entry in its `T` table.
  const start = pwa.indexOf("const T = ") + "const T = ".length;
  const end = pwa.indexOf("};\nconst B = {") + 1;
  assert.ok(start > 0 && end > start, "served-files table found in src/pwa.js");
  const served = JSON.parse(pwa.slice(start, end));
  const entry = served["/pf.js"];
  assert.ok(entry, "/pf.js is served from the bundle");
  const pfJs = entry[1]; // [content-type, body]
  assert.match(pfJs, /tagZh/, "served /pf.js maps tags through tagZh");
  const render = loadTagRenderer(pfJs);
  assert.ok(renderTags(render, SAMPLE, { tagZh }).includes("前景构图"));
});
