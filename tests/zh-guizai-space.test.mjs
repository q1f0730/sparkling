// FP-81: the zh why line must not ship a hard-coded "归在 " literal in its source.
// The single space before the tags is emitted by the run-time join, so the pinned zh copy
// in tests/zh-bracket-works, tests/plan-zh-log-tags and tests/demo-mainline-stayin stays intact.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dressPicks } from "../src/plan.js";
import { makeEnv } from "./adversarial/harness.mjs";
import { runFn } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const FILES = ["src/plan.js", "src/app/js/plan.result.js"];
const ZH_SENTENCE = "因为你记过 Big Thief 和《Her》；口味目录把它归在 独立。";

const seedUser = (env, U, cards = []) => {
  const db = env.DB._db, now = Date.now();
  db.prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)").run(U, "t" + U, "Greenpoint, Brooklyn", 40, "Saturday afternoon", now);
  cards.forEach(([qlooid, name, type, n], i) => {
    db.prepare("INSERT INTO cards (id,user_id,qloo_id,name,type,heart,created_at) VALUES (?,?,?,?,?,?,?)").run("C" + i + U, U, qlooid, name, type, 1, now);
    for (let f = 0; f < n; f++) {
      db.prepare("INSERT INTO footprints (id,user_id,card_id,note_id,kind,sentiment,quote,created_at) VALUES (?,?,?,?,?,?,?,?)").run(`F${i}-${f}${U}`, U, "C" + i + U, null, "note", "positive", "a line I wrote about " + name, now - (i * 10 + f) * 1000);
    }
  });
  return db.prepare("SELECT * FROM users WHERE id=?").get(U);
};

test("source: neither zh why-line file carries a hard-coded '归在 '", () => {
  for (const f of FILES) {
    const src = fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
    assert.ok(!src.includes("归在 "), `${f} still has a '归在 ' literal`);
  }
});

test("server dressPicks zh keeps the pinned catalogue sentence (one space, no literal)", async () => {
  const env = makeEnv();
  const seeds = [{ qloo_id: "E-BT", name: "Big Thief", type: "music artist" }, { qloo_id: "E-HER", name: "Her", type: "film" }];
  const user = seedUser(env, "UG", [["E-BT", "Big Thief", "music artist", 1], ["E-HER", "Her", "film", 1]]);
  const picks = [{ qloo_id: "P1", name: "Dragon New Warm Mountain", kind: "music", tags: ["indie"], seeds_used: seeds }];
  const out = await dressPicks(env, user, seeds, picks, "zh");
  assert.equal(out[0].why_line, ZH_SENTENCE);
  assert.doesNotMatch(out[0].why_line, / {2,}| [。、，]/, "double or stray spacing crept in");
});

test("client pickWhyLine zh keeps the pinned catalogue sentence (one space, no literal)", () => {
  const tagZh = (x) => (String(x).toLowerCase() === "indie" ? "独立" : x);
  const out = runFn("src/app/js/plan.result.js", "pickWhyLine", { LANG: "zh", tagZh, t: (s) => s }, [{ sources: [{ name: "Big Thief" }, { name: "Her" }], tags: ["Indie"] }]);
  assert.equal(out, "因为你记过《Big Thief》和《Her》；口味目录把它归在 独立。");
  assert.doesNotMatch(out, / {2,}| [。、，]/, "double or stray spacing crept in");
});

test("en stays byte-identical and never uses 归在", async () => {
  const env = makeEnv();
  const seeds = [{ qloo_id: "E-BT", name: "Big Thief", type: "music artist" }, { qloo_id: "E-HER", name: "Her", type: "film" }];
  const user = seedUser(env, "UE", [["E-BT", "Big Thief", "music artist", 1], ["E-HER", "Her", "film", 1]]);
  const picks = [{ qloo_id: "P1", name: "Dragon New Warm Mountain", kind: "music", tags: ["indie"], seeds_used: seeds }];
  const out = await dressPicks(env, user, seeds, picks, "en");
  assert.equal(out[0].why_line, "Because you kept Big Thief and Her; the catalogue files it under indie.");
  assert.ok(!out[0].why_line.includes("归在"));
});
