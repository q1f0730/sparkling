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

// Live scoring: one Qloo call per person plus one for the merged seeds; each person's score is their own affinity for the place (0 if Qloo did not return it for them).
export async function duoPlan(env, { area, seedsA, seedsB, take = 3 }) {
  const call = async (seeds) => {
    const qs = new URLSearchParams({ "filter.type": "urn:entity:place", "filter.location.query": area, "signal.interests.entities": seeds.map((s) => s.qloo_id).join(","), take: "50" });
    const r = await fetch(`https://hackathon.api.qloo.com/v2/insights?${qs}`, { headers: { "X-Api-Key": env.QLOO_API_KEY, accept: "application/json" }, signal: AbortSignal.timeout(+env.QLOO_TIMEOUT_MS || 10000) });
    if (!r.ok) throw Object.assign(new Error("Qloo " + r.status), { state: "qloo_down" });
    return (await r.json()).results?.entities || [];
  };
  const merged = mergeSeeds(seedsA, seedsB);
  const [ra, rb, rm] = await Promise.all([call(seedsA), call(seedsB), call(merged)]);
  const aff = (e) => e.query?.affinity ?? e.affinity ?? 0;
  const mapA = new Map(ra.map((e) => [e.entity_id, aff(e)])), mapB = new Map(rb.map((e) => [e.entity_id, aff(e)]));
  const cands = [...new Map([...rm, ...ra, ...rb].map((e) => [e.entity_id, e])).values()].map((e) => ({
    qloo_id: e.entity_id, name: e.name, address: e.properties?.address || null,
    scoreA: mapA.get(e.entity_id) ?? 0, scoreB: mapB.get(e.entity_id) ?? 0,
  }));
  return { area, merged_seeds: merged.map((s) => ({ name: s.name, from: s.from })), picks: balancedPick(cands, take), receipt: { endpoint: "/v2/insights", calls: 3, "filter.location.query": area } };
}
