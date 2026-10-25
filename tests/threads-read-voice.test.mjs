// Product voice (shot 3): Threads' "Sparkling's read" names the catalogue / 口味目录, never Qloo.
// Offline: the real Worker under tests/adversarial/harness.mjs plus the client i18n loaded like the app.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { register } from "node:module";
register("./adversarial/html-loader.mjs", import.meta.url);
import { makeEnv, makeQloo, setQloo, call } from "./adversarial/harness.mjs";
import { loadZh, read } from "../tools/orchestra/checks/swarm/lib_front.mjs";
const { default: worker } = await import("../src/index.js");

// Four noted cards across three types: enough for the threads route (>= 4 cards, >= 2 types).
const SEED = [
  ["E-ITML", "In the Mood for Love", "film"],
  ["E-HER", "Her", "film"],
  ["E-BIGTHIEF", "Big Thief", "music"],
  ["E-KLARA", "Klara and the Sun", "book"],
];

function newUser(env, tag) {
  const U = "U" + tag;
  env.DB._db
    .prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)")
    .run(U, "t" + U, "Greenpoint, Brooklyn", 40, "Saturday afternoon", Date.now());
  return { U, cookie: "t" + U };
}

function seedCards(env, U) {
  const db = env.DB._db, now = Date.now();
  SEED.forEach(([qloo_id, name, type], i) => {
    const id = "C" + i + U;
    db.prepare("INSERT INTO cards (id,user_id,qloo_id,name,type,heart,created_at) VALUES (?,?,?,?,?,?,?)")
      .run(id, U, qloo_id, name, type, 1, now);
    db.prepare("INSERT INTO footprints (id,user_id,card_id,note_id,kind,sentiment,quote,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run("F" + i + U, U, id, null, "note", "positive", "a line I wrote about " + name, now - i * 1000);
  });
}

// Same sandbox as loadZh, plus a global tagZh so the pattern's optional tag translation runs.
function loadZhWithTagZh(tagFn) {
  const src = ["i18n.zh.js", "i18n.extra.js", "i18n.js"].map((f) => read("src/app/js/" + f)).join("\n;\n") + "\n;globalThis.__trZh = trZh;";
  const noop = () => {};
  const el = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => "" : el), apply: () => el });
  const ctx = {
    console, document: el, window: {}, localStorage: { getItem: () => "zh", setItem: noop },
    navigator: { language: "zh-CN" }, location: { hash: "" }, setTimeout,
    MutationObserver: function () { return { observe: noop }; }, tagZh: tagFn,
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.__trZh;
}

test("en read says the catalogue, never Qloo (source)", () => {
  const idx = read("src/index.js");
  assert.ok(!/is how Qloo reads/.test(idx), "src/index.js still says \"is how Qloo reads\"");
  assert.ok(/is how the catalogue reads the pull of/.test(idx), "en wording must be \"… is how the catalogue reads the pull of …\"");
});

test("GET /api/threads: the non-carried read names the catalogue", async () => {
  const env = makeEnv();
  setQloo(makeQloo(), env);
  const { U, cookie } = newUser(env, "VOICE");
  seedCards(env, U);
  const r = await call(worker, env, "GET", "/api/threads", { cookie });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json.threads) && r.json.threads.length >= 1, "no threads came back");
  const reads = r.json.threads.map((t) => String(t.read || ""));
  assert.ok(reads.some((x) => x.includes("is how the catalogue reads the pull of")), JSON.stringify(reads));
  for (const x of reads) assert.ok(!/Qloo/.test(x), "thread read still says Qloo: " + x);
});

test("zh: catalogue wording, 「」 tags, the quote kept, no Qloo", () => {
  const trZh = loadZh();
  const en = "“Sensitive” is how the catalogue reads the pull of Her and Paterson — you wrote “soft light, low rooms”.";
  const zh = trZh(en);
  assert.notEqual(zh, en);
  assert.match(zh, /[\u4e00-\u9fff]/);
  assert.match(zh, /^Her 和 Paterson 在口味目录里都带着「Sensitive」这个标签——你写过“soft light, low rooms”。$/);
  assert.ok(!/Qloo/.test(zh), "zh still says Qloo: " + zh);
});

test("zh: the legacy Qloo sentence is accepted too (both inputs)", () => {
  const trZh = loadZh();
  const zh = trZh("“Steady” and “Moody” is how Qloo reads the pull of your recent cards.");
  assert.match(zh, /^你最近的卡片在口味目录里都带着「Steady」「Moody」这个标签。$/);
  assert.ok(!/Qloo/.test(zh), "zh still says Qloo: " + zh);
});

test("zh: tags go through the global tagZh when one exists", () => {
  const trZh = loadZhWithTagZh((n) => "译:" + String(n));
  const zh = trZh("“Sensitive” is how the catalogue reads the pull of Her — you wrote “soft light”.");
  assert.match(zh, /^Her 在口味目录里都带着「译:Sensitive」这个标签——你写过“soft light”。$/);
});
