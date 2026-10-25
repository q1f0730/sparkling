// Shot 2 zh inbox: the red-dot reason must be fully Chinese. reasonZh() is what the inbox renders,
// so the catalogue sentence needs its score to be optional (plain-numbers dropped the "(0.85)").
import { test } from "node:test";
import assert from "node:assert/strict";
import { runFn } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const REL = "src/app/js/i18n.js";
const zh = (s) => runFn(REL, "reasonZh", { LANG: "zh" }, [s]);
const en = (s) => runFn(REL, "reasonZh", { LANG: "en" }, [s]);

const FILMS = "2 films are called Little Women. The catalogue puts Little Women (2019) closest to your taste, mostly through Big Thief and Frances Ha.";
const CROSS = '"Normal People" is a show and a book. The catalogue puts Normal People (2020, show) closest to your taste, mostly through In the Mood for Love and Big Thief.';
const FEW = '"the Wong one" could be a few things. The catalogue puts Chungking Express (1994) closest to your taste, mostly through Frances Ha and Paterson.';

test("the count lead uses a measure word per type", () => {
  assert.equal(zh("2 films are called Little Women."), "有 2 部电影都叫 Little Women。");
  assert.equal(zh("3 shows are called Solaris."), "有 3 部剧都叫 Solaris。");
  assert.equal(zh("2 artists are called Margaret."), "有 2 位艺人都叫 Margaret。");
  assert.equal(zh("2 books are called Solaris."), "有 2 本书都叫 Solaris。");
  assert.equal(zh("2 places are called Vesuvio."), "有 2 个地方都叫 Vesuvio。");
});

test("the catalogue sentence translates without a score, keeping the titles", () => {
  const z = zh(FILMS);
  assert.equal(
    z,
    "有 2 部电影都叫 Little Women。目录认为 Little Women (2019) 最贴近你的口味，主要因为 Big Thief 和 Frances Ha。",
  );
  assert.doesNotMatch(z, /catalogue|closest|mostly|called/i);
  assert.doesNotMatch(z, /\d\.\d\d/);
});

test("the old numbered sentence still translates and drops the number", () => {
  const z = zh("3 films are called Solaris. The catalogue puts Solaris (1972) closest to your taste (0.85), mostly through In the Mood for Love and Big Thief.");
  assert.equal(
    z,
    "有 3 部电影都叫 Solaris。目录认为 Solaris (1972) 最贴近你的口味，主要因为 In the Mood for Love 和 Big Thief。",
  );
  assert.doesNotMatch(z, /0\.85|catalogue|closest|mostly/i);
});

test("a 'show and a book' lead and its (2020, show) label stay readable", () => {
  const z = zh(CROSS);
  assert.match(z, /“Normal People”既是剧集也是书。/);
  assert.match(z, /目录认为 Normal People \(2020, 剧集\) 最贴近你的口味，主要因为 In the Mood for Love 和 Big Thief。/);
  assert.doesNotMatch(z, /is a |catalogue|closest|mostly/i);
  assert.doesNotMatch(z, /\d\.\d\d/);
});

test("'could be a few things' is translated too", () => {
  assert.equal(
    zh(FEW),
    "“the Wong one”可能指好几样东西。目录认为 Chungking Express (1994) 最贴近你的口味，主要因为 Frances Ha 和 Paterson。",
  );
});

test("a catalogue sentence with no via clause still lands", () => {
  assert.equal(zh("The catalogue puts Solaris (1972) closest to your taste."), "目录认为 Solaris (1972) 最贴近你的口味。");
  assert.equal(zh("Qloo puts Solaris (1972) closest to your taste."), "目录认为 Solaris (1972) 最贴近你的口味。");
});

test("the cross-type sentence and the single-name lead are still translated", () => {
  assert.match(zh('"Margaret" is the name of a musician or a film. Pick the one you meant.'), /“Margaret”可能是音乐人、电影。选你指的那个。/);
  assert.match(zh('Not sure "the Wong one" means Chungking Express.'), /不确定“the Wong one”是不是指 Chungking Express。/);
});

test("English output is byte-identical", () => {
  for (const s of [FILMS, CROSS, FEW, "2 films are called Little Women.", 'Not sure "x" means Y.']) {
    assert.equal(en(s), s);
  }
});
