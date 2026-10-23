// Tiny table-driven runner. Every case = one distinct input x assertion. Ids must be unique per suite.
import { writeFileSync, mkdirSync } from "node:fs";
const cases = [], ids = new Set();
export function add(cat, id, fn) {
  const key = cat + "::" + id;
  if (ids.has(key)) throw new Error("duplicate case id " + key);
  ids.add(key); cases.push({ cat, id, fn });
}
export function ok(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }
export function eq(a, b, msg) { if (a !== b) throw new Error((msg || "not equal") + `: got ${JSON.stringify(a)?.slice(0, 200)} want ${JSON.stringify(b)?.slice(0, 200)}`); }
export async function runAll(suite, { timeout = 15000, concurrency = 1 } = {}) {
  if (process.env.ONLY) { const re = new RegExp(process.env.ONLY); cases.splice(0, cases.length, ...cases.filter((c) => re.test(c.cat + '::' + c.id))); }
  const res = [];
  const t0 = Date.now();
  let i = 0;
  async function worker() {
    while (i < cases.length) {
      const c = cases[i++];
      if (process.env.PROGRESS && i % 50 === 0) process.stderr.write(`[${i}/${cases.length} ${c.cat} ${c.id}]\n`);
      let timer;
      try {
        await Promise.race([Promise.resolve().then(c.fn), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("case timeout")), timeout); })]);
        res.push({ cat: c.cat, id: c.id, pass: true });
      } catch (e) { res.push({ cat: c.cat, id: c.id, pass: false, err: String(e && e.message || e).slice(0, 400) }); }
      finally { clearTimeout(timer); }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  const by = {};
  for (const r of res) { const b = (by[r.cat] ||= { pass: 0, fail: 0 }); r.pass ? b.pass++ : b.fail++; }
  const out = { suite, ran_at: new Date().toISOString(), ms: Date.now() - t0, total: res.length, pass: res.filter((r) => r.pass).length, by_category: by, failures: res.filter((r) => !r.pass) };
  mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
  writeFileSync(new URL(`./results/${suite}.json`, import.meta.url), JSON.stringify(out, null, 1));
  console.log(`${suite}: ${out.pass}/${out.total} pass (${out.ms} ms)`, JSON.stringify(by));
  for (const f of out.failures.slice(0, 25)) console.log("  FAIL", f.cat, f.id, "->", f.err);
  return out;
}
