import { seedBands } from "../src/plan.js";
import assert from "node:assert";
const g = Array.from({ length: 9 }, (_, i) => ({ id: i, name: "c" + i }));
const b = seedBands(g);
assert.deepEqual(b.seeds.map((s) => s.band), ["near", "near", "mid", "far"]);
assert.equal(b.seeds[3].id, 6);
assert.equal(seedBands(null).seeds.length, 0);
assert.equal(seedBands(g.slice(0, 3)).seeds.length, 3);
console.log("ok");
