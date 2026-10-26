// compare-verdict-ui: shot 5 "remove Qloo, what breaks" must read in 30 s.
// Both openPlain branches (stay-in picks, go-out stops) open the compare sheet with a
// .plain-verdict block whose two lines are counted from data already on screen:
//   With Qloo: N of N tied to a card you kept.    (Sparkling items with a kept-card link)
//   Without Qloo: M of K tied to a card you kept. (plain items whose why names a plan seed)
// Both lines go through t(); zh is pattern-driven and keeps the digits and the word 口味目录.
import test from "node:test";
import assert from "node:assert/strict";
import { read, fnSource, loadZh, runFn, esc, stripTags } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const SRC = "src/app/js/plan.result.js";

test("openPlain renders the verdict in both branches", () => {
  const src = read(SRC);
  const body = fnSource(src, "openPlain");
  assert.ok(body, "openPlain exists");
  assert.ok(/plain-verdict/.test(src), "a .plain-verdict block is in the module");
  const calls = body.match(/verdictHTML\s*\(/g) || [];
  assert.ok(calls.length >= 2, "verdictHTML used in the stay-in and the go-out branch (found " + calls.length + ")");
  assert.ok(/mode\s*===\s*["']in["']/.test(body), "openPlain still branches on stay-in");
  assert.ok(/With Qloo: /.test(src) && /Without Qloo: /.test(src) && /tied to a card you kept\./.test(src), "verdict wording present");
});

test("stay-in: both lines count kept-card links from the picks on screen", () => {
  const plan = {
    mode: "in",
    picks: [
      { name: "Chungking Express", kind: "film", why_line: "Because you kept In the Mood for Love." },
      { name: "Dragon New Warm Mountain", kind: "music", sources: [{ name: "Big Thief", card_id: "C2" }] },
      { name: "Aftersun", kind: "film" },
    ],
    receipt: { seeds: [{ name: "In the Mood for Love" }, { name: "Big Thief" }] },
  };
  const plain = {
    seeds: ["In the Mood for Love", "Big Thief"],
    picks: [
      { name: "Lost in Translation", kind: "film", why: "Quiet and close to the mood you keep." },
      { name: "Blue", kind: "music", why: "Slow and warm, like your notes on Big Thief." },
      { name: "Souvlaki", kind: "music", why: "It follows in the mood for love, but louder." },
    ],
  };
  const html = runFn(SRC, "verdictHTML", { t: (s) => s, esc }, [plan, plain, plan.picks, plain.picks]);
  const text = stripTags(html);
  assert.match(html, /class="plain-verdict"/);
  assert.match(text, /With Qloo: 2 of 3 tied to a card you kept\./);
  assert.match(text, /Without Qloo: 2 of 3 tied to a card you kept\./);
});

test("go-out: stops count from_notes/sources and the plain why", () => {
  const plan = {
    mode: "out",
    stops: [
      { name: "Word Bookstore", kind: "bookstore", sources: [{ name: "Big Thief" }] },
      { name: "Cafe", kind: "cafe", from_notes: "You wrote about In the Mood for Love." },
      { name: "Bar", kind: "bar" },
    ],
    receipt: { seeds: [{ name: "In the Mood for Love" }, { name: "Big Thief" }] },
  };
  const plain = {
    seeds: ["In the Mood for Love", "Big Thief"],
    stops: [
      { name: "Some Cafe", kind: "cafe", why: "It sounds nice." },
      { name: "Other Bar", kind: "bar", why: "Because you love In the Mood for Love." },
    ],
  };
  const html = runFn(SRC, "verdictHTML", { t: (s) => s, esc }, [plan, plain, plan.stops, plain.stops]);
  const text = stripTags(html);
  assert.match(html, /class="plain-verdict"/);
  assert.match(text, /With Qloo: 2 of 3 tied to a card you kept\./);
  assert.match(text, /Without Qloo: 1 of 2 tied to a card you kept\./);
});

test("a server-sent plain.verdict wins over the counted numbers", () => {
  const plan = { mode: "out", stops: [{ name: "A", from_notes: "x" }], receipt: { seeds: [{ name: "Seed" }] } };
  const plain = {
    seeds: ["Seed"],
    stops: [{ name: "B", why: "mentions Seed" }],
    verdict: { with_qloo: { tied: 1, total: 4 }, without_qloo: { tied: 0, total: 2 } },
  };
  const text = stripTags(runFn(SRC, "verdictHTML", { t: (s) => s, esc }, [plan, plain, plan.stops, plain.stops]));
  assert.match(text, /With Qloo: 1 of 4 tied to a card you kept\./);
  assert.match(text, /Without Qloo: 0 of 2 tied to a card you kept\./);
});

test("zh patterns keep the digits and the word 口味目录", () => {
  const zh = loadZh();
  assert.equal(zh("With Qloo: 3 of 3 tied to a card you kept."), "用了口味目录：3 个里有 3 个连着你留下的卡片。");
  assert.equal(zh("Without Qloo: 0 of 2 tied to a card you kept."), "不用口味目录：2 个里有 0 个连着你留下的卡片。");
  assert.equal(zh("With Qloo: 1 of 4 tied to a card you kept."), "用了口味目录：4 个里有 1 个连着你留下的卡片。");
  for (const [k, nums] of [
    ["With Qloo: 3 of 3 tied to a card you kept.", ["3"]],
    ["Without Qloo: 0 of 2 tied to a card you kept.", ["0", "2"]],
    ["With Qloo: 1 of 4 tied to a card you kept.", ["1", "4"]],
  ]) {
    const z = zh(k);
    assert.notEqual(z, k, "translated: " + k);
    assert.match(z, /[\u4e00-\u9fff]/, "has Chinese: " + z);
    for (const n of nums) assert.ok(z.includes(n), "keeps " + n + ": " + z);
    assert.match(z, /口味目录/, "keeps 口味目录: " + z);
    assert.ok(!/Qloo/.test(z), "no Qloo: " + z);
  }
});
