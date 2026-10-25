// Main-line regression: the five demo shots keep full 简体中文 parity, and the language
// toggle survives a reload because it is stored in the session settings API (/api/prefs).
// Shots follow docs/DEMO.md beats 1-5: notebook, wall (with card detail), inbox, threads, plan.
// Offline: the dictionary comes from the built src/app.html, the API from the D1 harness.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, call } from "./adversarial/harness.mjs";
// dynamic: src/index.js imports src/app.html, so the html hook must be registered first.
const { default: worker } = await import("../src/index.js");

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const appModule = (file) => read("../src/app/js/" + file);

// ---- the 简体中文 dictionary, straight out of the generated app (same slice as tests/zh-kinds.test.mjs)
const HTML = read("../src/app.html");
function loadI18n() {
  const start = HTML.indexOf("const ZH = {");
  const end = HTML.indexOf("/* DOM pass: translate exact UI strings");
  assert.ok(start > -1 && end > start, "could not find the i18n block in src/app.html");
  return new Function("LANG", HTML.slice(start, end) + "\nreturn { ZH: ZH, trZh: trZh, t: t };")("zh");
}
const { ZH, trZh } = loadI18n();
const CJK = /[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]/;

// The copy each shot puts on screen: strings the renderers emit directly (translated by the
// DOM pass) plus the t("…") literals scanned below. Every one must resolve through ZH.
const SHOTS = {
  "notebook": {
    files: ["notes.feed.js", "notes.js", "core.js", "i18n.js"],
    keys: [
      "Notes", "What stayed with you today?", "Something you watched, heard, read or found?",
      "Paste a link or drop a screenshot.", "Search notes", "Today", "Earlier",
      "Sample notebook · made-up data", "plain note", "Recognizing",
    ],
  },
  "wall": {
    files: ["cards.js", "detail.js"],
    keys: [
      "Cards", "Film & TV", "Music", "Books", "Places", "People", "More",
      "No cards yet.", "No cards under this filter yet.", "Show all cards",
      "Cards appear when your notes mention something Sparkling can recognise. Your notes are all still here.",
      "Loved", "Not for me", "Untitled", "Mention it again sometime and it will remember.",
      "The only card under this filter so far.", "First met", "Footprints", "Flip", "Front", "Type",
      "Find the right one",
    ],
  },
  "inbox": {
    files: ["inbox.js"],
    keys: [
      "Inbox", "Something else", "Keep as my own thing",
      "Swipe right to keep · left if it is not a thing", "Guess", "Set aside.",
      "All guesses kept.", "Back in the pile.", "Which one did you mean?",
    ],
  },
  "threads": {
    files: ["threads.js"],
    keys: [
      "Threads", "All of you", "Recent you", "Earlier you", "Why this thread?",
      "Everything you have kept.", "New in recent notes", "Fading from recent notes",
      "Threads show up once a few things keep coming back.", "Threads take a little time.",
      "Letter", "Share taste card",
    ],
  },
  "plan": {
    files: ["plan.js", "plan.result.js"],
    keys: [
      "Plan", "Stay in", "Go out", "Plan an afternoon", "Open when you arrive, per listed hours",
      "May be closed when you arrive", "From the catalogue", "Sparkling's read",
      "Hours not checked", "Schematic route", "not to scale", "Route", "Why this stop?",
      "Why this pick?", "Same notes, no Qloo", "Plain model", "In Qloo", "Not checked",
    ],
  },
};

// Wordmarks stay as they are in both locales, like "Sparkling" and "Qloo" inside sentences.
const BRANDS = new Set(["Sparkling + Qloo"]);

function tLiterals(src) {
  return [...new Set([...src.matchAll(/\bt\("((?:[^"\\]|\\.)*)"\)/g)].map((m) => JSON.parse('"' + m[1] + '"')))];
}

for (const [shot, spec] of Object.entries(SHOTS)) {
  test(`${shot}: every English key the demo shot renders has a 简体中文 entry`, () => {
    const sources = spec.files.map(appModule);
    const all = sources.join("\n");
    for (const en of spec.keys) {
      assert.ok(all.includes(en), `${shot}: no renderer emits ${JSON.stringify(en)} any more (${spec.files.join(", ")})`);
      assert.ok(Object.prototype.hasOwnProperty.call(ZH, en), `${shot}: no 简体中文 entry for ${JSON.stringify(en)}`);
      const zh = trZh(en);
      assert.notEqual(zh, en, `${shot}: trZh leaves ${JSON.stringify(en)} in English`);
      assert.ok(CJK.test(zh), `${shot}: ${JSON.stringify(en)} -> ${JSON.stringify(zh)} has no Chinese`);
    }
    // Every t("…") literal the shot's own code calls must translate too.
    for (const en of tLiterals(all)) {
      if (BRANDS.has(en)) continue;
      assert.ok(Object.prototype.hasOwnProperty.call(ZH, en), `${shot}: t() key missing from ZH: ${JSON.stringify(en)}`);
      const zh = trZh(en);
      assert.notEqual(zh, en, `${shot}: t() key stays English: ${JSON.stringify(en)}`);
      assert.ok(CJK.test(zh), `${shot}: t() key -> ${JSON.stringify(zh)} has no Chinese`);
    }
  });
}

// ---- locale toggle: client prefs merge + session settings API --------------------------------

// Pull the prefs helpers out of the i18n module (no DOM needed).
function loadPrefs() {
  const src = appModule("i18n.zh.js");
  const start = src.indexOf("const PREFS_KEY =");
  const endMarker = "let LANG = prefs.lang;";
  const end = src.indexOf(endMarker);
  assert.ok(start > -1 && end > start, "could not find the prefs block in src/app/js/i18n.zh.js");
  return new Function(
    "localStorage",
    src.slice(start, end + endMarker.length) + "\nreturn { PREF_DEFAULTS: PREF_DEFAULTS, mergePrefs: mergePrefs, prefs: prefs, LANG: LANG };"
  )({ getItem: () => null });
}

test("a fresh visitor starts in English and only en/zh survive the prefs merge", () => {
  const { PREF_DEFAULTS, mergePrefs, LANG } = loadPrefs();
  assert.equal(PREF_DEFAULTS.lang, "en");
  assert.equal(LANG, "en", "no stored prefs -> English");
  assert.equal(mergePrefs(null).lang, "en");
  assert.equal(mergePrefs({}).lang, "en");
  assert.equal(mergePrefs({ lang: "zh" }).lang, "zh");
  assert.equal(mergePrefs({ lang: "en" }).lang, "en");
  assert.equal(mergePrefs({ lang: "fr" }).lang, "en", "an unknown locale falls back, never sticks");
  // Switching language must not reset the rest of the settings.
  const m = mergePrefs({ lang: "zh", appearance: "paper", textSize: 2, notif: { quiet: true } });
  assert.equal(m.appearance, "paper");
  assert.equal(m.textSize, 2);
  assert.equal(m.notif.quiet, true);
  assert.equal(m.notif.planTime, PREF_DEFAULTS.notif.planTime, "untouched notification defaults are kept");
});

test("the settings language rows call setLang, and setLang saves prefs through /api/prefs", () => {
  const settings = appModule("settings.js");
  const i18n = appModule("i18n.js");
  assert.ok(settings.includes('data-st-pick="lang" data-value="en"'), "the language page offers English");
  assert.ok(settings.includes('data-st-pick="lang" data-value="zh"'), "the language page offers 简体中文");
  assert.ok(settings.includes('if (kind === "lang") { setLang(value); return; }'), "the toggle picks setLang");
  assert.ok(i18n.includes("prefs.lang = LANG;"), "setLang records the chosen locale");
  assert.ok(i18n.includes('api("/api/prefs", { method: "PUT", body: { prefs: prefs } })'), "savePrefs writes the session settings API");
  assert.ok(i18n.includes("if (langChanged) setLang(prefs.lang, true);"), "a reload re-applies the stored locale");
});

function session(env, U) {
  env.DB._db
    .prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)")
    .run(U, "t" + U, "Greenpoint, Brooklyn", 40, "Saturday afternoon", Date.now());
  return "t" + U;
}

test("the locale toggle persists in the session settings API and is scoped to the session", async () => {
  const env = makeEnv();
  const cookie = session(env, "UZH1");
  const other = session(env, "UZH2");

  // No session, no settings.
  const anon = await call(worker, env, "PUT", "/api/prefs", { body: { prefs: { lang: "zh" } } });
  assert.equal(anon.status, 401);
  assert.deepEqual(anon.json, { error: "no session" });

  // What setLang("zh") -> savePrefs() sends: the whole prefs object.
  const put = await call(worker, env, "PUT", "/api/prefs", {
    cookie,
    body: { prefs: { lang: "zh", appearance: "paper", textSize: 1 } },
  });
  assert.equal(put.status, 200);
  assert.deepEqual(put.json, { ok: true });

  // What syncPrefsFromServer() reads on the next load.
  const got = await call(worker, env, "GET", "/api/prefs", { cookie });
  assert.equal(got.status, 200);
  assert.equal(got.json.prefs.lang, "zh");
  assert.equal(got.json.prefs.appearance, "paper");

  // Another session still starts with no stored locale.
  const fresh = await call(worker, env, "GET", "/api/prefs", { cookie: other });
  assert.equal(fresh.status, 200);
  assert.deepEqual(fresh.json, { prefs: null });

  // Toggling back to English overwrites the same row (last choice wins).
  const back = await call(worker, env, "PUT", "/api/prefs", {
    cookie,
    body: { prefs: { lang: "en", appearance: "paper", textSize: 1 } },
  });
  assert.equal(back.status, 200);
  const after = await call(worker, env, "GET", "/api/prefs", { cookie });
  assert.equal(after.json.prefs.lang, "en");
});
