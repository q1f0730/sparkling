// Qloo client failure modes with a mocked fetch: timeouts, 429, 5xx, junk bodies, empty results, dupes, odd shapes.
import { add, ok, eq, runAll } from "./lib.mjs";
import { makeEnv, makeQloo, setQloo } from "./harness.mjs";
import { searchEntity, compareTastes, recommend, searchTags, getEntities, qlooTags, qlooTagInsights, slimEntity } from "../../src/qloo.js";
import { rng } from "./gen.mjs";

let n = 0;
const uniq = () => "u" + (++n) + "x" + Date.now().toString(36);
const FNS = [
  ["searchEntity", (env, u) => searchEntity(env, { query: "Solaris " + u, domain: "movie" }), "array"],
  ["searchEntity_media", (env, u) => searchEntity(env, { query: "Her " + u, mediaFirst: true }), "array"],
  ["recommend_place", (env, u) => recommend(env, { domain: "place", entity_ids: ["E-HER", u], location: "Greenpoint", take: 5 }), "array"],
  ["recommend_movie", (env, u) => recommend(env, { domain: "movie", entity_ids: [u], take: 3 }), "array"],
  ["searchTags", (env, u) => searchTags(env, { query: "book " + u, domain: "place" }), "array"],
  ["getEntities", (env, u) => getEntities(env, ["E-HER", u]), "array"],
  ["qlooTags", (env, u) => qlooTags(env, { entity_ids: [u] }), "array"],
  ["qlooTagInsights", (env, u) => qlooTagInsights(env, [u]), "array"],
  ["compareTastes", (env, u) => compareTastes(env, { a_ids: [u], b_ids: ["E-HER"] }), "compare"],
];
const MODES = ["ok", "empty", "nullres", "429", "500", "503", "401", "html", "truncated", "throw", "timeout", "dupes"];
const RETRY = { "429": 3, "500": 3, "503": 3, "401": 1, ok: 1, empty: 1 };

for (const [fname, fn, shape] of FNS) for (const mode of MODES) {
  let memo;
  const get = () => memo ||= (async () => {
    const env = makeEnv(); const q = makeQloo(); q.mode = mode; setQloo(q, env);
    const t0 = Date.now(); let val, err;
    try { val = await fn(env, uniq()); } catch (e) { err = e; }
    return { val, err, calls: q.calls.length, ms: Date.now() - t0 };
  })();
  add("qloo.failure", `${fname}:${mode}:settles`, async () => { await get(); });
  add("qloo.failure", `${fname}:${mode}:shape_or_error`, async () => {
    const { val, err } = await get();
    if (err) ok(err instanceof Error, "non-Error rejection: " + typeof err);
    else if (shape === "array") ok(Array.isArray(val), "not array");
    else ok(val && Array.isArray(val.shared) && Array.isArray(val.only_a) && Array.isArray(val.only_b), "compare shape");
  });
  add("qloo.failure", `${fname}:${mode}:error_policy`, async () => {
    const { err } = await get();
    if (["429", "500", "503", "401", "html", "truncated", "throw", "timeout"].includes(mode)) ok(err, "expected a rejection for " + mode);
    else ok(!err, "unexpected rejection: " + err?.message);
  });
  if (RETRY[mode]) add("qloo.failure", `${fname}:${mode}:retry_count`, async () => eq((await get()).calls, RETRY[mode], "fetch attempts"));
  add("qloo.failure", `${fname}:${mode}:items_wellformed`, async () => {
    const { val } = await get(); const arr = Array.isArray(val) ? val : val ? [...val.shared, ...val.only_a, ...val.only_b] : [];
    for (const x of arr) ok(x && typeof x === "object" && "name" in x, "bad item");
  });
}
// memo: identical successful call is served from cache; failures are not cached
for (const [fname, fn] of FNS) {
  add("qloo.memo", fname + ":ok_cached", async () => { const env = makeEnv(); const q = makeQloo(); setQloo(q, env); const u = uniq(); await fn(env, u); const c = q.calls.length; await fn(env, u); eq(q.calls.length, c); });
  add("qloo.memo", fname + ":error_not_cached", async () => { const env = makeEnv(); const q = makeQloo(); q.mode = "401"; setQloo(q, env); const u = uniq(); await fn(env, u).catch(() => {}); q.mode = "ok"; await fn(env, u); ok(q.calls.length === 2, "error was cached"); });
}
// concurrency gate: never more than 6 in flight
add("qloo.gate", "max_6_in_flight", async () => {
  const env = makeEnv(); const q = makeQloo(); let live = 0, peak = 0;
  q.override = () => { live++; peak = Math.max(peak, live); return new Promise((r) => setTimeout(() => { live--; r(new Response('{"results":[]}')); }, 20)); };
  setQloo(q, env); await Promise.all(Array.from({ length: 20 }, () => getEntities(env, [uniq()]))); ok(peak <= 6, "peak " + peak);
});
add("qloo.gate", "recovers_after_errors", async () => {
  const env = makeEnv(); const q = makeQloo(); q.mode = "throw"; setQloo(q, env);
  await Promise.all(Array.from({ length: 10 }, () => getEntities(env, [uniq()]).catch(() => {})));
  q.mode = "ok"; const r = await getEntities(env, ["E-HER", uniq()]); ok(Array.isArray(r), "gate stuck after errors");
});
add("qloo.recommend", "unsupported_domain_throws", async () => { let e; try { await recommend(makeEnv(), { domain: "spaceship" }); } catch (x) { e = x; } ok(e instanceof Error); });
add("qloo.recommend", "excludes_input_ids", async () => { const env = makeEnv(); const q = makeQloo(); setQloo(q, env); const r = await recommend(env, { domain: "place", entity_ids: ["P-BOOK-1"], exclude_ids: ["P-CAFE-1"], take: 30 }); ok(!r.some((x) => x.id === "P-BOOK-1" || x.id === "P-CAFE-1")); });
for (const take of [-5, 0, 1, 30, 31, 1000, NaN]) add("qloo.recommend", "take_clamped:" + take, async () => { const env = makeEnv(); const q = makeQloo(); setQloo(q, env); await recommend(env, { domain: "movie", entity_ids: [uniq()], take }); const t = +new URL("https://x" + q.calls[0]).searchParams.get("take"); ok(t >= 1 && t <= 30, "take " + t); });
add("qloo.compare", "dedupes_case_insensitive", async () => {
  const q = makeQloo(); q.override = () => new Response(JSON.stringify({ results: { tags: [{ name: "Neon" }, { name: "neon" }, { name: "NEON" }], a: [], b: [] } })); const env = makeEnv(); setQloo(q, env);
  eq((await compareTastes(env, { a_ids: [uniq()], b_ids: ["x"] })).shared.length, 1);
});
add("qloo.compare", "tag_without_name", async () => {
  const q = makeQloo(); q.override = () => new Response(JSON.stringify({ results: { tags: [{ id: "x" }, { name: "A" }], a: null, b: [{}] } })); const env = makeEnv(); setQloo(q, env);
  const r = await compareTastes(env, { a_ids: [uniq()], b_ids: ["x"] }); ok(Array.isArray(r.shared));
});

// slimEntity on fuzzed / hostile shapes
const R = rng(99);
const pick = (a) => a[Math.floor(R() * a.length)];
const SHAPES = [];
for (let i = 0; i < 120; i++) SHAPES.push(["fuzz" + i, {
  entity_id: pick(["E1", "", null, 5, undefined]), name: pick(["Her", "", null, "<script>x</script>", "千と千尋", 7]),
  subtype: pick(["urn:entity:movie", "urn:entity:place", "urn:entity:artist", "", null, undefined, 5]),
  types: pick([["urn:entity:book"], [], null, undefined, ["weird"]]),
  properties: pick([{}, null, undefined, { release_year: 2000, authors: ["A", "B", "C"] }, { collaborators: "notarray" }, { image: { url: "https://x/y.jpg" } }, { description: "d".repeat(1000) }, { websites: "https://x" }]),
  tags: pick([[], null, undefined, [{ name: "Neon", type: "urn:tag:style:qloo" }], Array.from({ length: 20 }, (_, k) => ({ name: "T" + k, subtype: "urn:tag:genre:x" })), [{ name: "Place", type: "genre" }], [null, { type: "genre" }]]),
  query: pick([undefined, null, { affinity: 0.123456 }, { affinity: "x" }]),
}]);
for (const [id, e] of SHAPES) {
  let memo, err; const get = () => { if (!memo && !err) { try { memo = slimEntity(e); } catch (x) { err = x; } } if (err) throw err; return memo; };
  add("qloo.slim", id + ":no_throw", () => { get(); });
  add("qloo.slim", id + ":tags_le6_strings", () => { const t = get().tags; ok(Array.isArray(t) && t.length <= 6 && t.every((x) => typeof x === "string"), "tags"); });
  add("qloo.slim", id + ":desc_le220", () => { ok(get().description.length <= 220); });
}

await runAll("qloo", { timeout: 4000, concurrency: 24 });
process.exit(0);
