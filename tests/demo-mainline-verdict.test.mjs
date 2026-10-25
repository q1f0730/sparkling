// Demo mainline (shot 5): "remove Qloo, what breaks" needs a verdict, not just a second list.
// POST /api/plan/:id/plain must answer plain.verdict = { mine_total, mine_linked, plain_total,
// plain_linked, plain_pass }, computed at response time so an old cached plain block gets it too.
// mine_*  = Sparkling's own picks/stops; linked = kept-card link (why_line / from_notes / sources).
// plain_* = the plain model's picks/stops; linked = its why names one of plan.receipt.seeds.
// plain_pass = go-out: plain stops whose Qloo check passed; stay-in: null.
// Offline: tests/adversarial/harness.mjs mocks D1, Workers AI and Qloo (no real network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, call } from "./adversarial/harness.mjs";
const { default: worker } = await import("../src/index.js");

const SEEDS = [
  { name: "In the Mood for Love", qloo_id: "E-ITML" },
  { name: "Big Thief", qloo_id: "E-BT" },
];

function setup(U, mode, extra = {}) {
  const env = makeEnv(), db = env.DB._db, now = Date.now();
  db.prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)")
    .run(U, "t" + U, "Greenpoint, Brooklyn", 40, "Saturday afternoon", now);
  const plan = mode === "in"
    ? {
      id: "P" + U, mode: "in", kinds: ["film", "music"],
      picks: [
        { name: "Chungking Express", kind: "film", qloo_id: "X1", why_line: "Because you kept In the Mood for Love." },
        { name: "Dragon New Warm Mountain", kind: "music", qloo_id: "X2", why_line: "因为你记过 Big Thief。" },
        { name: "Paterson", kind: "film", qloo_id: "X3", why_line: "", from_notes: "" },
      ],
      receipt: { seeds: SEEDS },
    }
    : {
      id: "P" + U, mode: "out",
      stops: [
        { name: "Word Bookstore", kind: "bookstore", coords: { lat: 40.73, lon: -73.95 }, from_notes: "You came back to In the Mood for Love 3 times." },
        { name: "Cafe Grumpy", kind: "cafe", coords: { lat: 40.729, lon: -73.954 }, from_notes: "" },
        { name: "Van Leeuwen", kind: "cafe", coords: { lat: 40.731, lon: -73.953 }, sources: [{ name: "Big Thief", qloo_id: "E-BT" }] },
        { name: "McNally Jackson", kind: "bookstore", coords: { lat: 40.728, lon: -73.955 } },
      ],
      receipt: { seeds: SEEDS },
    };
  db.prepare("INSERT INTO plans (id,user_id,request,plan,pool,saved,created_at) VALUES (?,?,?,?,?,0,?)")
    .run("P" + U, U, JSON.stringify({ area: "Greenpoint, Brooklyn", mode }), JSON.stringify(plan), "[]", now);
  env.AI.raw = () => (mode === "in"
    ? { picks: [
      { name: "Lost in Translation", kind: "film", why: "Quiet, like In the Mood for Love." },
      { name: "Blue", kind: "music", why: "Slow and warm." },
      { name: "Normal People", kind: "book", why: "Close to your notes." },
    ] }
    : { stops: [
      { name: "Some Cafe", kind: "cafe", why: "It sounds nice." },
      { name: "Invented Books", kind: "bookstore", why: "Because you like Big Thief." },
    ] });
  if (extra.plain) {
    const p = JSON.parse(JSON.stringify(plan));
    p.plain = extra.plain;
    db.prepare("UPDATE plans SET plan=? WHERE id=?").run(JSON.stringify(p), "P" + U);
  }
  return { env, cookie: "t" + U, id: "P" + U };
}

test("stay-in: verdict counts kept-card picks and seed-named plain picks, both calls", async () => {
  const { env, cookie, id } = setup("UVIN", "in");
  let first = null;
  for (const pass of [1, 2]) {
    const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
    assert.equal(r.status, 200, r.text);
    const v = r.json.plain && r.json.plain.verdict;
    assert.ok(v, "plain.verdict missing (call " + pass + ")");
    assert.deepEqual({ ...v }, {
      mine_total: 3,
      mine_linked: 2,
      plain_total: r.json.plain.picks.length,
      plain_linked: 1,
      plain_pass: null,
    }, "call " + pass);
    assert.equal(r.json.plain.plain_total, undefined, "the list itself must not grow totals");
    if (first) assert.deepEqual(r.json.plain.picks, first.picks, "cached picks unchanged");
    first = r.json.plain;
  }
});

test("go-out: verdict counts linked stops and checked plain stops, both calls", async () => {
  const { env, cookie, id } = setup("UVOUT", "out");
  let first = null;
  for (const pass of [1, 2]) {
    const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
    assert.equal(r.status, 200, r.text);
    const v = r.json.plain && r.json.plain.verdict;
    assert.ok(v, "plain.verdict missing (call " + pass + ")");
    assert.equal(v.mine_total, 4);
    assert.equal(v.mine_linked, 2, "from_notes string + sources array count, empty strings do not");
    assert.equal(v.plain_total, r.json.plain.stops.length);
    assert.equal(v.plain_linked, 1, "only the 'Big Thief' why links back to a seed");
    assert.equal(typeof v.plain_pass, "number");
    assert.ok(v.plain_pass >= 0 && v.plain_pass <= v.plain_total);
    if (first) assert.deepEqual(r.json.plain.stops, first.stops, "cached stops unchanged");
    first = r.json.plain;
  }
});

test("go-out: an old cached plain block gets the verdict without another model call", async () => {
  const cached = {
    model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", seeds: ["In the Mood for Love", "Big Thief"],
    area: "Greenpoint, Brooklyn", verified: false, checked: false, note: null,
    stops: [{ name: "Some Cafe", kind: "cafe", why: "Slow and warm, like Big Thief." }],
  };
  const { env, cookie, id } = setup("UVOLD", "out", { plain: cached });
  const r = await call(worker, env, "POST", "/api/plan/" + id + "/plain", { cookie, body: {} });
  assert.equal(r.status, 200, r.text);
  assert.equal(env.AI.calls, 0, "a cached plain block is checked, never re-asked");
  const plain = r.json.plain;
  assert.equal(plain.stops.length, 1);
  assert.equal(plain.stops[0].name, "Some Cafe");
  assert.deepEqual(plain.verdict, {
    mine_total: 4,
    mine_linked: 2,
    plain_total: 1,
    plain_linked: 1,
    plain_pass: 0,
  });
});
