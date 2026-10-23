// i18n: the zh dictionary and pattern table pulled out of src/app.html and exercised directly.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { add, ok, eq, runAll } from "./lib.mjs";

const html = readFileSync(new URL("../../src/app.html", import.meta.url), "utf8");
const a = html.indexOf("const ZH = {"), b = html.indexOf("function t(s){");
if (a < 0 || b < 0) throw new Error("could not find ZH / t() in app.html");
const ctx = { LANG: "zh" };
vm.createContext(ctx);
vm.runInContext(html.slice(a, b) + "\nthis.ZH = ZH; this.ZH_PATTERNS = ZH_PATTERNS; this.trZh = trZh; this.DAY_ZH = DAY_ZH;", ctx);
const { ZH, ZH_PATTERNS, trZh, DAY_ZH } = ctx;
const CJK = /[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]/;

// 1) every dictionary entry ("On" maps to "" on purpose: zh drops the preposition)
const INTENTIONAL_EMPTY = new Set(["On"]);
for (const [k, v] of Object.entries(ZH)) {
  const id = k.slice(0, 60);
  add("i18n.dict", id + ":nonempty", () => ok(typeof v === "string" && (v.trim().length > 0 || INTENTIONAL_EMPTY.has(k))));
  add("i18n.dict", id + ":lookup", () => eq(trZh(k), v));
  add("i18n.dict", id + ":keeps_padding", () => eq(trZh("  " + k + "\n"), "  " + v + "\n"));
  add("i18n.dict", id + ":no_english_sentence_left", () => ok(!/[A-Za-z]{3,} [A-Za-z]{3,} [A-Za-z]{3,}/.test(v.replace(/Export Your Data/g, "")), "untranslated: " + v));
}
// 2) every literal t("...") used by the app has a zh rendering (dictionary or pattern)
const used = [...new Set([...html.matchAll(/\bt\("((?:[^"\\]|\\.)*)"\)/g)].map((m) => JSON.parse('"' + m[1] + '"')))];
for (const s of used.filter((x) => /[A-Za-z]{2,}/.test(x))) add("i18n.coverage", s.slice(0, 70), () => ok(trZh(s) !== s, "no zh for: " + s));
// 3) pattern table with generated sentences
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const NUMS = ["Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
for (const d of DAYS) for (const n of NUMS) {
  for (const tpl of [`${d}. ${n} things came back to you this week.`, `${d}. ${n} notes joined your notebook this week.`]) {
    add("i18n.patterns", tpl, () => { const o = trZh(tpl); ok(CJK.test(o) && !new RegExp(d).test(o), o); });
  }
}
for (const d of DAYS) add("i18n.patterns", `${d}. One thing came back to you this week.`, () => { const o = trZh(`${d}. One thing came back to you this week.`); ok(CJK.test(o) && !o.includes(d), o); });
for (const d of Object.keys(DAY_ZH)) add("i18n.days", d, () => ok(CJK.test(DAY_ZH[d])));
// 4) robustness: hostile / long input through trZh
const LONGS = ["Donaudampfschifffahrtsgesellschaftskapitänswitwe".repeat(20), "Notes · Cards · Donaudampfschiff", " · ", "·", "", " ", null, undefined, 0, "<script>alert(1)</script>", "Notes".repeat(1000), "\u202ENotes", "Notes\u0000", "__proto__", "constructor", "toString", "hasOwnProperty"];
LONGS.forEach((s, i) => {
  add("i18n.robust", `in${i}:no_throw`, () => { trZh(s); });
  add("i18n.robust", `in${i}:string_or_passthrough`, () => { const o = trZh(s); ok(s == null ? o == s : typeof o === "string"); });
  add("i18n.robust", `in${i}:no_proto_leak`, () => { const o = trZh(s); ok(typeof o !== "function" && typeof o !== "object" || o == null, "returned " + typeof o); });
});
for (const w of ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf", "isPrototypeOf", "propertyIsEnumerable", "toLocaleString"]) add("i18n.robust", "unknown_word_unchanged:" + w, () => eq(trZh(w), w));
// 5) segment joining: "A · B" translates per segment
const keys = Object.keys(ZH).filter((k) => !k.includes(" · ") && k.length < 30).slice(0, 40);
for (let i = 0; i + 1 < keys.length; i += 2) add("i18n.segments", `${keys[i]}|${keys[i + 1]}`, () => eq(trZh(`${keys[i]} · ${keys[i + 1]}`), `${ZH[keys[i]]} · ${ZH[keys[i + 1]]}`));

await runAll("i18n");
process.exit(0);
