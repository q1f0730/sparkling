// Two notebooks, one outing. Our own fairness rule (not Qloo's): maximise the lower of the two scores, break ties by the sum.
export function mergeSeeds(a, b, max = 6) {
  const out = [], seen = new Set();
  for (let i = 0; out.length < max && (i < a.length || i < b.length); i++)
    for (const s of [a[i], b[i]]) if (s && !seen.has(s.qloo_id) && out.length < max) { seen.add(s.qloo_id); out.push({ ...s, from: s === a[i] ? "A" : "B" }); }
  return out;
}
export function balancedPick(cands, n = 3) {
  const scored = cands.map((c) => ({ ...c, min: Math.min(c.scoreA ?? 0, c.scoreB ?? 0), sum: (c.scoreA ?? 0) + (c.scoreB ?? 0) }));
  scored.sort((x, y) => y.min - x.min || y.sum - x.sum);
  return scored.slice(0, n).map((c) => ({ ...c, label: "Chosen by Sparkling's fairness rule: best for whoever likes it least" }));
}
