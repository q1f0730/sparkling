// Backlog: in 简体中文 mode the onboarding import block, the shared error/retry copy and the
// threads "all" note stayed English because those renderers wrote the literals directly.
// The fix wraps each string in t() and keeps a 简体中文 entry in the dictionary
// (i18n.extra.js), which i18n.js loads after i18n.zh.js.
// Offline: the dictionary is evaluated from the module files themselves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const mod = (file) => read("../src/app/js/" + file);
const CJK = /[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]/;

// ---- trZh exactly as the app runs it (i18n.zh.js + i18n.extra.js + i18n.js) ----
const noop = () => {};
const el = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => "" : el), apply: () => el });
function loadZh() {
  const src = ["i18n.zh.js", "i18n.extra.js", "i18n.js"].map(mod).join("\n;\n") + "\n;globalThis.__trZh = trZh;";
  const ctx = {
    console,
    document: el,
    window: {},
    localStorage: { getItem: () => "zh", setItem: noop },
    navigator: { language: "zh-CN" },
    location: { hash: "" },
    setTimeout,
    MutationObserver: function () { return { observe: noop }; },
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.__trZh;
}
const trZh = loadZh();

// ---- 1. each literal is wrapped in t(), never emitted raw ----
const STRINGS = {
  "onboarding.js": [
    "No file chosen",
    "Reading your file. You can leave this screen while it works.",
    "Trying again",
  ],
  "core.js": [
    "That did not work. Try again.",
    "Search your notes",
  ],
  "threads.js": [
    "Everything you have kept.",
  ],
};

const stripT = (src) => src.replace(/\bt\(\s*(["'])(?:\\.|(?!\1).)*\1\s*\)/g, "T()");

for (const [file, keys] of Object.entries(STRINGS)) {
  test(`${file}: onboarding/core/threads copy goes through t()`, () => {
    const src = mod(file);
    const stripped = stripT(src);
    for (const en of keys) {
      assert.ok(!stripped.includes('"' + en + '"') && !stripped.includes("'" + en + "'"),
        `${file}: ${JSON.stringify(en)} is still hardcoded (wrap it in t())`);
    }
  });

  test(`${file}: every wrapped string has a 简体中文 entry that translates`, () => {
    for (const en of keys) {
      const zh = trZh(en);
      assert.notEqual(zh, en, `${file}: trZh leaves ${JSON.stringify(en)} in English`);
      assert.ok(CJK.test(zh), `${file}: ${JSON.stringify(en)} -> ${JSON.stringify(zh)} has no Chinese`);
    }
  });
}

test("the 简体中文 entries live in the dictionary (i18n.extra.js), not just the renderer", () => {
  const extra = mod("i18n.extra.js");
  for (const en of Object.values(STRINGS).flat()) {
    assert.ok(extra.includes(JSON.stringify(en)) || extra.includes("'" + en + "'") || extra.includes('"' + en + '"'),
      "i18n.extra.js is missing the key " + JSON.stringify(en));
  }
});

// ---- 3. the rendered search field carries the translated placeholder/aria ----
function fnSource(text, name) {
  const start = text.indexOf("function " + name + "(");
  assert.ok(start > -1, "function " + name + " not found");
  const end = text.indexOf("\n}", start);
  assert.ok(end > start, "could not slice " + name);
  return text.slice(start, end + 2);
}

function runFn(src, name, stubs) {
  const names = Object.keys(stubs);
  const fn = new Function(...names, src + "\n;return " + name + ";");
  return fn(...names.map((n) => stubs[n]));
}

test("search field renders the 简体中文 placeholder and aria-label", () => {
  const searchFieldHTML = runFn(fnSource(mod("core.js"), "searchFieldHTML"), "searchFieldHTML", {
    icons: { search: "" },
    attr: (s) => String(s == null ? "" : s),
    t: trZh,
  });
  const html = searchFieldHTML("notes-search", "");
  assert.match(html, /placeholder="搜索你的笔记"/);
  assert.match(html, /aria-label="搜索你的笔记"/);
});

test("import block renders the 简体中文 empty file name", () => {
  const importBlockHTML = runFn(fnSource(mod("onboarding.js"), "importBlockHTML"), "importBlockHTML", {
    esc: (s) => String(s == null ? "" : s),
    importDetailsHTML: () => "",
    t: trZh,
  });
  assert.match(importBlockHTML(""), /未选择文件/);
});

test("threads note translates in 简体中文", () => {
  // setNote is nested in renderThreads; probe the wrapped literal directly.
  const src = mod("threads.js");
  const line = src.split("\n").find((l) => l.includes("Everything you have kept."));
  assert.ok(line, "the threads note is no longer emitted");
  assert.match(line, /t\("Everything you have kept\."\)/);
  assert.equal(trZh("Everything you have kept."), "你留下的一切。");
});
