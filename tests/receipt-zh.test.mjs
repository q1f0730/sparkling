import test from "node:test";
import assert from "node:assert/strict";
import { runFn, esc, stripTags } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const REL = "src/app/js/plan.result.js";
const html = (r, lang, t = (s) => s) => runFn(REL, "receiptHTML", { esc, t, LANG: lang }, [r]);
const SENT_EN = "Card IDs only. No note text, no location.";
const SENT_ZH = "只发卡片 ID，不发笔记原文，也不发位置。";

const receipt = (over = {}) => ({
  seeds: [{ name: "Her", qloo_id: "4F8EBD51XXXX" }],
  queries: [{ endpoint: "/v2/insights", "filter.type": "urn:tag", returned: 5 }],
  sent_to_qloo: SENT_EN,
  provenance: { live: 0, cached: 1, label: "cached" },
  ...over,
});

test("en receipt is byte-identical", () => {
  const want =
    '<div class="receipt"><p class="receipt-title">Receipt</p>' +
    '<p class="receipt-line"><span>Seeds sent to Qloo</span> Her <code>4F8EBD51</code></p>' +
    '<p class="receipt-line"><code>GET /v2/insights</code> tag · 5 back</p>' +
    '<p class="receipt-line muted">Card IDs only. No note text, no location. · cached (0 live, 1 cached)</p></div>';
  assert.equal(html(receipt(), "en"), want);
});

test("zh receipt maps the known sentence and the cached label", () => {
  const txt = stripTags(html(receipt(), "zh"));
  assert.ok(txt.includes(SENT_ZH), "sentence translated: " + txt);
  assert.ok(txt.includes(" · 缓存（实时 0 次，缓存 1 次）"), "counts translated: " + txt);
  assert.ok(!/Card IDs only|No note text|live,|cached\)/.test(txt), "no English leftovers: " + txt);
});

test("zh labels: live and live + cached", () => {
  let txt = stripTags(html(receipt({ provenance: { live: 2, cached: 0, label: "live" } }), "zh"));
  assert.ok(txt.includes(" · 实时（实时 2 次，缓存 0 次）"), txt);
  txt = stripTags(html(receipt({ provenance: { live: 3, cached: 4, label: "live + cached" } }), "zh"));
  assert.ok(txt.includes(" · 实时 + 缓存（实时 3 次，缓存 4 次）"), txt);
  const en = stripTags(html(receipt({ provenance: { live: 3, cached: 4, label: "live + cached" } }), "en"));
  assert.ok(en.includes(" · live + cached (3 live, 4 cached)"), en);
});

test("zh go-out sentence is mapped too", () => {
  const r = receipt({ sent_to_qloo: "Card IDs and your area. No note text." });
  const txt = stripTags(html(r, "zh"));
  assert.ok(txt.includes("只发卡片 ID 和你的区域，不发笔记原文。"), txt);
});

test("zh unknown sentences pass through t()", () => {
  const calls = [];
  const t = (s) => { calls.push(s); return "〔" + s + "〕"; };
  const txt = stripTags(html(receipt({ sent_to_qloo: "Something new." }), "zh", t));
  assert.ok(txt.includes("〔Something new.〕"), txt);
  assert.deepEqual(calls, ["Something new."]);
  // unknown provenance label also passes through t()
  const more = [];
  const txt2 = stripTags(html(receipt({ provenance: { live: 1, cached: 0, label: "mixed" } }), "zh", (s) => { more.push(s); return "〔" + s + "〕"; }));
  assert.ok(txt2.includes("〔mixed〕"), txt2);
  assert.deepEqual(more, ["mixed"]);
});

test("no provenance leaves the line without a separator", () => {
  const r = receipt({ provenance: null });
  assert.equal(stripTags(html(r, "en")), "ReceiptSeeds sent to Qloo Her 4F8EBD51GET /v2/insights tag · 5 back" + SENT_EN);
  assert.ok(stripTags(html(r, "zh")).endsWith(SENT_ZH));
  assert.equal(html(null, "zh"), "");
});
