import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/app/js/threads.js", import.meta.url), "utf8");

/* Slice one function out of the module source by brace matching from its signature. */
function fnSource(text, signature) {
  const start = text.indexOf(signature);
  if (start < 0) return null;
  let depth = 0;
  for (let i = text.indexOf("{", start); i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (!depth) return text.slice(start, i + 1);
    }
  }
  throw new Error("unbalanced braces for " + signature);
}

function parts() {
  const render = fnSource(src, "function renderThreads(");
  assert.ok(render, "renderThreads must exist");
  const load = fnSource(render, "async function load(");
  assert.ok(load, "renderThreads must keep its load() function");
  return { skeleton: fnSource(src, "function threadsSkeletonHTML("), render, load };
}

test("a three-row skeleton helper exists and uses the existing skeleton classes", () => {
  const { skeleton } = parts();
  assert.ok(skeleton, "threads.js needs a threadsSkeletonHTML() helper");
  const rows = skeleton.match(/class="skeleton sk-card/g) || [];
  assert.equal(rows.length, 3, "skeleton helper must return three placeholder rows");
  assert.match(skeleton, /sk-card tall/, "the first row keeps the tall variant");
});

test("the threads view paints its skeleton immediately, before any request", () => {
  const { skeleton, render, load } = parts();
  assert.ok(skeleton, "threads.js needs a threadsSkeletonHTML() helper");

  const threadsMount = render.indexOf("data-threads");
  assert.ok(threadsMount > 0, "threads view still mounts a [data-threads] container");
  const skelInMarkup = render.indexOf("threadsSkeletonHTML()", threadsMount);
  const loadStart = render.indexOf("async function load(");
  assert.ok(skelInMarkup > threadsMount, "initial view.innerHTML must mount the skeleton");
  assert.ok(skelInMarkup < loadStart, "skeleton is part of the first paint, not the loader");

  const skelInLoad = load.indexOf("threadsSkeletonHTML()");
  const apiInLoad = load.indexOf("await api(");
  assert.ok(skelInLoad >= 0, "load() renders the skeleton when nothing is cached");
  assert.ok(skelInLoad < apiInLoad, "the skeleton renders before awaiting /api/threads");
});

test("the last threads response is cached in memory at module scope", () => {
  const { render } = parts();
  const decl = src.search(/(?:^|\n)const THREADS_CACHE\s*=\s*/);
  assert.ok(decl >= 0, "THREADS_CACHE must be declared");
  assert.ok(decl < src.indexOf("function renderThreads("), "cache must outlive one render (module scope)");
  assert.equal((render.match(/THREADS_CACHE\s*=\s*/g) || []).length, 0, "renderThreads must not reset the cache");
});

test("a revisit paints from the cache synchronously, before the network call", () => {
  const { load } = parts();
  const apiIdx = load.indexOf("await api(");
  assert.ok(apiIdx > 0);

  const readIdx = load.indexOf("THREADS_CACHE[period]");
  assert.ok(readIdx >= 0 && readIdx < apiIdx, "load() reads the per-period cache before fetching");

  const paintIdx = load.indexOf("paint(cached)");
  assert.ok(paintIdx >= 0 && paintIdx < apiIdx, "cached threads are painted without waiting for the API");
  assert.ok(paintIdx < load.indexOf("threadsSkeletonHTML()"), "the cache branch must win over the skeleton");

  const writeIdx = load.search(/THREADS_CACHE\[period\]\s*=\s*data/);
  assert.ok(writeIdx > apiIdx, "a fresh response replaces the cached one");
  assert.ok(load.indexOf("paint(data)") > apiIdx, "the fresh response still repaints");
});
