// zh plan-notice copy: inserted Latin names (area, hoods) carry a space on both sides of CJK text.
// Offline: the client i18n table is loaded in a vm sandbox exactly as the app runs it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadZh } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const trZh = loadZh();

// No ASCII letter may touch a CJK character without a space between them.
function assertSpaced(zh) {
  assert.doesNotMatch(zh, /[A-Za-z][\u4e00-\u9fff]/, "Latin name glued to CJK: " + zh);
  assert.doesNotMatch(zh, /[\u4e00-\u9fff][A-Za-z]/, "CJK glued to Latin name: " + zh);
}

test("widened notice: space around the area name and the hood", () => {
  const zh = trZh("Not much matched right in Greenpoint, so I looked a little further. The stop is in Williamsburg.");
  assert.equal(zh, "Greenpoint 附近匹配的不多，所以我往外多找了一点。这一站在 Williamsburg 。");
  assertSpaced(zh);
});

test("border notice: space around the area name and both hoods", () => {
  const zh = trZh("The best matches near Greenpoint spill over the border. Both stops are in Williamsburg.");
  assert.equal(zh, "Qloo 在 Greenpoint 附近最匹配的地方，有的在边界外。两站都在 Williamsburg 。");
  assertSpaced(zh);
});

test("Qloo's best variant and the one-stop line", () => {
  const zh = trZh("Qloo's best matches near Fort Greene spill over the border. One stop is in Greenpoint.");
  assert.equal(zh, "Qloo 在 Fort Greene 附近最匹配的地方，有的在边界外。有一站在 Greenpoint 。");
  assertSpaced(zh);
});

test("multi-hood lists keep a space around every name", () => {
  const zh = trZh("The best matches near Greenpoint spill over the border. The stops are in Greenpoint and Williamsburg.");
  assert.equal(zh, "Qloo 在 Greenpoint 附近最匹配的地方，有的在边界外。这几站在 Greenpoint 和 Williamsburg 。");
  assertSpaced(zh);
});

test("numbered and all-stops lines stay spaced", () => {
  const all = trZh("Not much matched right in Greenpoint, so I looked a little further. All stops are in Williamsburg.");
  assert.equal(all, "Greenpoint 附近匹配的不多，所以我往外多找了一点。所有站都在 Williamsburg 。");
  assertSpaced(all);

  const many = trZh("Not much matched right in Greenpoint, so I looked a little further. 3 stops are in Williamsburg and Ridgewood.");
  assert.equal(many, "Greenpoint 附近匹配的不多，所以我往外多找了一点。有 3 站在 Williamsburg 和 Ridgewood 。");
  assertSpaced(many);
});
