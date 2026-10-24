import assert from "node:assert";
import { mergeSeeds, balancedPick } from "../src/duo.js";
const m = mergeSeeds([{qloo_id:1},{qloo_id:2}],[{qloo_id:2},{qloo_id:3}]);
assert.deepEqual(m.map(s=>s.qloo_id),[1,2,3]);
const p = balancedPick([{n:"x",scoreA:.9,scoreB:.1},{n:"y",scoreA:.5,scoreB:.5},{n:"z",scoreA:.6,scoreB:.4}],2);
assert.deepEqual(p.map(c=>c.n),["y","z"]);
assert.ok(p[0].label);
console.log("duo ok");
