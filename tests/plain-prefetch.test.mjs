// plain-prefetch (shot 5, "nothing waits > 3 s"): the "Same notes, no Qloo" sheet used to start its POST
// /api/plan/:id/plain only on tap. paint()/paintIn() now start it as soon as the plan is on screen through
// prefetchPlain(planId), which keeps one promise per plan id and drops it on failure so a later tap retries.
// openPlain awaits that same promise instead of firing its own api() POST.
import test from "node:test";
import assert from "node:assert/strict";
import { read, fnSource, withHelpers } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const REL = "src/app/js/plan.result.js";

/* the real prefetchPlain source (helpers included), with api stubbed; the function itself is returned so the
   test can call it more than once and watch the per-plan-id cache. */
function loadPrefetch(scope) {
  const body = withHelpers(read(REL), "prefetchPlain");
  assert.ok(body, "prefetchPlain exists");
  return new Function("__scope", "with (__scope) { " + body + "\n return prefetchPlain; }")(scope);
}

test("first call starts one POST and returns its promise", async () => {
  const calls = [];
  const api = (path, init) => {
    calls.push({ path, init });
    return Promise.resolve({ plain: { picks: [] } });
  };
  const p = loadPrefetch({ api, Promise })("P1");
  assert.ok(p && typeof p.then === "function", "prefetchPlain returns a promise");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/api/plan/P1/plain");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.body, "{}");
  const d = await p;
  assert.deepEqual(d, { plain: { picks: [] } });
});

test("a second call for the same plan reuses the promise (one POST)", async () => {
  const calls = [];
  const api = (path) => {
    calls.push(path);
    return Promise.resolve({ plain: { note: "late model" } });
  };
  const f = loadPrefetch({ api, Promise });
  const first = f("P2");
  const second = f("P2");
  assert.equal(first, second, "second call returns the stored promise");
  assert.equal(calls.length, 1, "still exactly one POST: " + calls.join(", "));
  assert.deepEqual(await second, { plain: { note: "late model" } });
  // a third call after it settled is still the cached promise
  assert.equal(f("P2"), first);
  assert.equal(calls.length, 1);
});

test("different plan ids each get their own request", async () => {
  const calls = [];
  const api = (path) => {
    calls.push(path);
    return Promise.resolve({});
  };
  const f = loadPrefetch({ api, Promise });
  const a = f("PA"), b = f("PB");
  assert.notEqual(a, b);
  assert.deepEqual(calls, ["/api/plan/PA/plain", "/api/plan/PB/plain"]);
});

test("a failed prefetch is dropped so a later tap retries", async () => {
  const calls = [];
  let n = 0;
  const api = (path) => {
    calls.push(path);
    n += 1;
    return n === 1 ? Promise.reject(new Error("network")) : Promise.resolve({ plain: { picks: [] } });
  };
  const f = loadPrefetch({ api, Promise });
  const first = f("P3");
  await assert.rejects(first, /network/);
  const second = f("P3");
  assert.notEqual(second, first, "rejected promise is not cached");
  assert.equal(calls.length, 2, "the retry starts a fresh POST");
  assert.deepEqual(await second, { plain: { picks: [] } });
});

test("plan id is URL-encoded and paint/paintIn prefetch only when the plan has an id", () => {
  const calls = [];
  const api = (path) => {
    calls.push(path);
    return Promise.resolve({});
  };
  loadPrefetch({ api, Promise })("a b/c");
  assert.deepEqual(calls, ["/api/plan/a%20b%2Fc/plain"]);

  const src = read(REL);
  for (const fn of ["paint", "paintIn", "openPlain"]) {
    const body = fnSource(src, fn);
    assert.ok(body, fn + " exists");
    assert.match(body, /prefetchPlain\s*\(/, fn + " calls prefetchPlain");
  }
  for (const fn of ["paint", "paintIn"]) {
    assert.match(fnSource(src, fn), /if\s*\(\s*plan\s*&&\s*plan\.id\s*\)\s*prefetchPlain\s*\(\s*plan\.id\s*\)/, fn + " guards on plan.id");
  }
  // openPlain no longer starts its own POST …/plain
  assert.ok(
    !/api\(\s*["']\/api\/plan\/["']\s*\+[^)]*\/plain/.test(fnSource(src, "openPlain")),
    "openPlain awaits the prefetched promise"
  );
  assert.match(fnSource(src, "openPlain"), /await\s+prefetchPlain\s*\(\s*planId\s*\)/, "openPlain awaits prefetchPlain(planId)");
});

test("openPlain keeps its skeleton and swallows a failed prefetch", () => {
  const body = fnSource(read(REL), "openPlain");
  assert.match(body, /plain-skel/, "skeleton sheet while the comparison is pending");
  assert.match(body, /try\s*\{[^}]*await\s+prefetchPlain[^}]*\}\s*catch\s*\([^)]*\)\s*\{\s*\}/, "error is caught and the sheet still renders");
});
