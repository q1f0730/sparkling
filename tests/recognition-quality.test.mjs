// Recognition quality: inbox questions must be meaningful, guesses must resemble what was written,
// and ambiguous guesses are ordered by the user's taste through Qloo (filter.results.entities + explainability).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resembles, properish, cleanSurface, inboxReason, tasteRank } from "../src/recognize.js";
import { makeEnv, setQloo, makeQloo } from "./adversarial/harness.mjs";

test("guesses must resemble the words, not just share letters", () => {
  assert.equal(resembles("How To Train Your Dog With Love + Science", "G train"), false);
  assert.equal(resembles("Solaris", "Solaris"), true);
  assert.equal(resembles("Chungking Express", "Chungking"), true);
  assert.equal(resembles("The War on Normal People: The Truth About America's Disappearing Jobs and Why Universal Basic Income Is Our Future", "Normal People"), false);
});
test("common phrases never become inbox questions", () => {
  for (const s of ["on the radio", "laundromat", "G train", "the counter place"]) assert.equal(properish(s), false, s);
  for (const s of ["Solaris", "Normal People", "花样年华", "\"Sunday\""]) assert.equal(properish(s), true, s);
});
test("surfaces are trimmed to the name", () => {
  assert.equal(cleanSurface({ surface: "watched Solaris", title: "Solaris" }, "finally watched Solaris. the drive"), "Solaris");
  assert.equal(cleanSurface({ surface: "Big Thief live recording of Not at full volume while cleaning", title: "Not" }, "Big Thief live recording of Not at full volume while cleaning. best"), "Not");
  assert.equal(cleanSurface({ surface: "a b c d e f g h i j", title: "zz" }, "a b c d e f g h i j"), null);
});
test("inbox reason says why it asks, with Qloo's taste ranking", () => {
  const r = inboxReason("Solaris", [
    { name: "Solaris", type: "film", year: "1972", taste: { affinity: 0.83, via: [{ name: "In the Mood for Love", score: 0.29 }, { name: "Fallen Angels", score: 0.28 }] } },
    { name: "Solaris", type: "film", year: "2002", taste: { affinity: 0.74, via: [] } },
  ]);
  assert.match(r, /2 films are called Solaris\. Qloo puts Solaris \(1972\) closest to your taste \(0\.83\), mostly through In the Mood for Love and Fallen Angels\./);
  assert.match(inboxReason("Normal People", [{ name: "Normal People", type: "book", year: "2018" }, { name: "Normal People", type: "tv", year: "2020" }]), /is a book and a show/);
});
test("tasteRank orders guesses by Qloo affinity against the user's cards", async () => {
  const env = makeEnv(); const q = makeQloo(); const seen = [];
  q.override = (u) => {
    if (u.pathname !== "/v2/insights") return null;
    seen.push(Object.fromEntries(u.searchParams));
    const ids = (u.searchParams.get("filter.results.entities") || "").split(",");
    const aff = { "S-02": 0.74, "S-72": 0.83 };
    return new Response(JSON.stringify({ results: { entities: ids.map((id) => ({ entity_id: id, query: { affinity: aff[id], explainability: { "signal.interests.entities": [{ entity_id: "E-ITML", score: 0.6 }, { entity_id: "E-HER", score: 0.4 }] } } })) } }), { status: 200 });
  };
  setQloo(q, env);
  const db = env.DB._db, U = "UT", now = Date.now();
  db.prepare("INSERT INTO users (id,token,created_at) VALUES (?,?,?)").run(U, "tUT", now);
  [["E-ITML", "In the Mood for Love"], ["E-HER", "Her"]].forEach(([qid, name], i) => {
    db.prepare("INSERT INTO cards (id,user_id,qloo_id,name,type,heart,created_at) VALUES (?,?,?,?,?,?,?)").run("C" + i, U, qid, name, "film", 0, now);
    db.prepare("INSERT INTO footprints (id,user_id,card_id,note_id,kind,sentiment,created_at) VALUES (?,?,?,?,?,?,?)").run("F" + i, U, "C" + i, null, "note", "positive", now);
  });
  const out = await tasteRank(env, U, [{ qloo_id: "S-02", name: "Solaris", type: "film", year: "2002" }, { qloo_id: "S-72", name: "Solaris", type: "film", year: "1972" }]);
  assert.deepEqual(out.map((g) => g.year), ["1972", "2002"]);
  assert.equal(out[0].taste.via[0].name, "In the Mood for Love");
  assert.equal(seen[0]["feature.explainability"], "true");
  assert.equal(seen[0]["filter.type"], "urn:entity:movie");
  assert.match(seen[0]["signal.interests.entities"], /E-ITML/);
});
