// Weekend plan: cards the user returns to -> Qloo place candidates near their area -> two stops.
// Every stop is a Qloo entity returned in this request. The model only writes one sentence per stop.
import { llmJSON } from "./llm.js";
import { uid } from "./recognize.js";

const BASE = "https://hackathon.api.qloo.com";

async function qloo(env, path, params) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length)) qs.set(k, Array.isArray(v) ? v.join(",") : String(v));
  const r = await fetch(`${BASE}${path}?${qs}`, { headers: { "X-Api-Key": env.QLOO_API_KEY, accept: "application/json" }, signal: AbortSignal.timeout(+env.QLOO_TIMEOUT_MS || 10000) });
  const t = await r.text();
  if (!r.ok) throw Object.assign(new Error(`Qloo ${path} ${r.status}`), { status: r.status, body: t.slice(0, 200) });
  return JSON.parse(t);
}

function haversineMi(a, b) {
  if (!a || !b) return null;
  const R = 3958.8, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  const d = 2 * R * Math.asin(Math.sqrt(x));
  return Number.isFinite(d) ? d : null;
}

function slimPlace(e) {
  const p = e.properties || {};
  const loc = e.location || p.geocode || {};
  const lat = loc.lat ?? p.latitude, lon = loc.lon ?? loc.lng ?? p.longitude;
  const kinds = (e.tags || []).filter((t) => /genre:place|category/.test(t.type || t.subtype || "")).map((t) => t.name).slice(0, 4);
  const vibes = (e.tags || []).filter((t) => !/^(education learning|casual|shopping|morning|afternoon|evening|night|late night|early morning|brunch|lunch|dinner|breakfast|weekday|weekend|daytime)$/i.test((t.name || "").trim())).filter((t) => !/genre:place|category|payment|credit_card|cost|rating|inclusivity|offerings|amenity|menu|dining|cuisine|accessib|planning|parking|service|specialty|highlights|nearby|children|kids|price/.test(t.type || t.subtype || "")).map((t) => t.name).slice(0, 6);
  return {
    qloo_id: e.entity_id, name: e.name, address: p.address, neighborhood: p.neighborhood || p.geocode?.city,
    price_level: p.price_level, kinds, vibes, popularity: e.popularity,
    coords: lat != null && lon != null ? { lat: +lat, lon: +lon } : null,
    description: (p.description || p.short_description || "").slice(0, 240),
    affinity: typeof e.query?.affinity === "number" ? +e.query.affinity.toFixed(3) : null,
    expl: Array.isArray(e.query?.explainability?.["signal.interests.entities"]) ? e.query.explainability["signal.interests.entities"].filter((x) => x && x.entity_id && typeof x.score === "number").map((x) => ({ id: x.entity_id, score: +x.score.toFixed(3) })) : null,
    hours: p.hours || null, is_closed: !!p.is_closed, website: Array.isArray(p.websites) ? p.websites[0] : p.website,
  };
}

const MOOD_POP = { familiar: undefined, different: undefined, surprise: 0.1 };

/** Pick seed cards: loved or repeatedly mentioned, never ones whose footprints are mostly negative. */
export async function pickSeeds(env, userId, mood, period) {
  const rows = (await env.DB.prepare(`SELECT c.id,c.qloo_id,c.name,c.type,c.heart,c.tags,
      COUNT(f.id) n, SUM(CASE WHEN f.sentiment='negative' THEN 1 ELSE 0 END) neg, MAX(f.created_at) last
      FROM cards c LEFT JOIN footprints f ON f.card_id=c.id WHERE c.user_id=? AND c.heart>=0 GROUP BY c.id`).bind(userId).all()).results || [];
  let good = rows.filter((r) => r.heart === 1 || (r.n >= 1 && r.neg * 2 < r.n));
  if (period === "now" || period === "then") {
    const c = cohorts(good);
    good = period === "now" ? c.now : c.then;
  }
  good.sort((a, b) => (b.heart - a.heart) || (b.n - a.n) || (b.last - a.last));
  let seeds;
  if (mood === "familiar") seeds = good.slice(0, 4);
  else if (mood === "surprise") seeds = [...good.slice(0, 2), ...good.slice(2).sort(() => Math.random() - 0.5).slice(0, 3)];
  else seeds = [...good.slice(0, 3), ...good.slice(3, 8).filter((_, i) => i % 2 === 0).slice(0, 2)];
  return { seeds: seeds.filter((s) => s.type !== "place" || true), all: rows };
}

/** Equal-sized cohorts of liked cards by their latest footprint: the latest N vs the N before. */
export function cohorts(cards, n = 6) {
  const byLast = [...cards].sort((a, b) => (b.last || b.last_at || 0) - (a.last || a.last_at || 0));
  const size = Math.min(n, Math.floor(byLast.length / 2));
  return { size, now: byLast.slice(0, size), then: byLast.slice(size, size * 2) };
}

const DEFAULT_KINDS = ["bookstore", "cafe", "record store"];
const KW_SCHEMA = { type: "object", properties: { stops: { type: "array", items: { type: "string" } } }, required: ["stops"] };

async function stopKinds(env, text) {
  if (!text) return DEFAULT_KINDS;
  const VENUES = ["bookstore", "book store", "record store", "cafe", "coffee", "cinema", "movie theater", "museum", "gallery", "bar", "wine bar", "park", "bakery", "library", "tea", "restaurant", "music venue", "jazz club"];
  const rule = () => {
    const low = text.toLowerCase();
    const hits = VENUES.map((v) => [v, low.indexOf(v)]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]).map(([v]) => (v === "coffee" || v === "tea" ? "cafe" : v === "book store" ? "bookstore" : v));
    if (/somewhere (nearby )?to sit/.test(low) && !hits.includes("cafe")) hits.push("cafe");
    return [...new Set(hits)].slice(0, 3);
  };
  try {
    const o = await llmJSON(env, "Turn a request for an afternoon outing into 1-3 short venue category words Qloo would know (e.g. bookstore, cafe, record store, cinema, museum, bar, park, bakery, gallery). Return {\"stops\":[...]} in visiting order.", text, KW_SCHEMA, 120);
    const s = (o?.stops || []).map((x) => String(x).toLowerCase().trim()).filter(Boolean).slice(0, 3);
    return s.length ? s : rule().length ? rule() : DEFAULT_KINDS;
  } catch (_) { const r = rule(); return r.length ? r : DEFAULT_KINDS; }
}

async function placeTag(env, word) {
  const d = await qloo(env, "/v2/tags", { "filter.query": word, "filter.parents.types": "urn:entity:place", take: 5 });
  const tags = d.results?.tags || [];
  const ty = (t) => t.type || t.subtype || "";
  const exact = tags.find((t) => /category:place/.test(ty(t))) || tags.find((t) => /genre:place/.test(ty(t))) || tags[0];
  return exact ? { id: exact.id || exact.tag_id, name: exact.name } : null;
}

const READ_SCHEMA = { type: "object", properties: { reads: { type: "array", items: { type: "string" } } }, required: ["reads"] };

/**
 * Generate a plan. `log(text)` streams plain-language activity lines.
 * Returns {plan} or throws {state,text}.
 */
export async function makePlan(env, user, req, log) {
  const area = (req.area || user.area || "").trim();
  if (!area) throw { state: "no_area", text: "Where would you like to spend an afternoon?" };
  const { seeds, all } = await pickSeeds(env, user.id, req.mood, req.period);
  if (req.period === "now" || req.period === "then") log(`Planning from ${req.period === "now" ? "your recent notes" : "your earlier notes"} only.`);
  if (seeds.length < 2) throw { state: "too_few", text: "I need a few more things you love to plan from. Mark a couple of cards with a heart, or start from one card." };
  log(`Using ${seeds.length} cards as seeds: ${seeds.map((s) => s.name).join(", ")}.`);
  const kinds = await stopKinds(env, req.text);
  log(`Looking for: ${kinds.join(", then ")}, around ${area}.`);
  const known = new Set(all.map((c) => c.qloo_id));
  const num = (v) => { const n = typeof v === "number" || (typeof v === "string" && v.trim()) ? Number(v) : NaN; return Number.isFinite(n) && n > 0 ? Math.min(n, 100000) : null; };
  const budget = num(req.budget) ?? num(user.budget) ?? 40;
  const maxPrice = budget <= 20 ? 1 : budget <= 40 ? 2 : budget <= 80 ? 3 : 4;
  const pools = [];
  const ask = async (k, tag, loc) => {
    try {
      const d = await qloo(env, "/v2/insights", {
        "filter.type": "urn:entity:place",
        ...loc,
        "filter.tags": tag?.id,
        "signal.interests.entities": seeds.map((s) => s.qloo_id),
        "filter.popularity.min": MOOD_POP[req.mood],
        "feature.explainability": "true",
        take: 15,
      });
      return (d.results?.entities || []).map(slimPlace);
    } catch (e) {
      throw { state: "qloo_down", text: "Plans need Qloo right now and it isn't answering. Your notes and cards are fine." };
    }
  };
  const clean = (raw, kindName) => {
    const dropped = { known: 0, price: 0 };
    const want = (kindName || "").toLowerCase().replace(/ /g, "");
    const ok = raw.filter((p) => {
      // category guard: if Qloo lists categories, one must match what was asked for
      if (want && p.kinds.length && !p.kinds.some((k) => { const x = k.toLowerCase().replace(/ /g, ""); return x.includes(want) || want.includes(x) || (want === "cafe" && /coffee|tea|bakery/.test(x)) || (want === "bookstore" && /book/.test(x)); })) { dropped.off = (dropped.off || 0) + 1; return false; }
      if (known.has(p.qloo_id)) { dropped.known++; return false; }
      if (p.is_closed) { dropped.closed = (dropped.closed || 0) + 1; return false; }
      if (p.price_level && p.price_level > maxPrice) { dropped.price++; return false; }
      return true;
    });
    return { ok, dropped };
  };
  for (const k of kinds) {
    let tag = null;
    try { tag = await placeTag(env, k); } catch (_) {}
    const raw = await ask(k, tag, { "filter.location.query": area });
    const { ok, dropped } = clean(raw, tag?.name || k);
    log(`Asked Qloo for ${(tag?.name || k).toLowerCase()} near ${area}: ${raw.length} came back` + (dropped.known ? `, left out ${dropped.known} you already know` : "") + (dropped.price ? `, ${dropped.price} over budget` : "") + ".");
    pools.push({ kind: tag?.name || k, tag, items: ok });
  }
  let widened = null;
  // Centre of the area, from whatever Qloo returned there.
  const pts = pools.flatMap((p) => p.items.map((i) => i.coords).filter(Boolean));
  const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const centre = pts.length ? { lat: med(pts.map((p) => p.lat)), lon: med(pts.map((p) => p.lon)) } : null;
  for (const pool of pools) {
    if (pool.items.length >= 3) continue;
    let more = [], where = "";
    if (centre) {
      more = clean(await ask(pool.kind, pool.tag, { "filter.location": `POINT(${centre.lon} ${centre.lat})`, "filter.location.radius": 3200 }), pool.kind).ok;
      where = `within two miles of ${area}`;
    }
    if (more.length < 2 && area.includes(",")) {
      const wide = area.split(",").pop().trim();
      more = clean(await ask(pool.kind, pool.tag, { "filter.location.query": wide }), pool.kind).ok;
      where = wide;
      if (centre) more.sort((a, b) => (haversineMi(centre, a.coords) ?? 99) - (haversineMi(centre, b.coords) ?? 99));
    }
    const seen = new Set(pool.items.map((i) => i.qloo_id));
    const add = more.filter((i) => !seen.has(i.qloo_id));
    if (add.length) { pool.items.push(...add); widened = where; log(`Few ${pool.kind.toLowerCase()} results right in ${area}, so I widened to ${where} and found ${add.length}.`); }
  }
  const usable = pools.filter((p) => p.items.length);
  if (!usable.length) throw { state: "weak", text: `Not much near ${area} matched well this time. Try a wider area or a nearby neighbourhood.` };
  // first stop: top of the first pool; next stops: nearest top-5 candidate from each next pool
  const stops = [];
  for (const pool of usable) {
    const taken = new Set(stops.map((s) => s.qloo_id));
    const cands = pool.items.filter((p) => !taken.has(p.qloo_id));
    if (!cands.length) continue;
    let pick = cands[0];
    const prev = stops[stops.length - 1];
    if (prev?.coords) {
      const near = cands.slice(0, 6).map((c) => ({ c, d: haversineMi(prev.coords, c.coords) ?? 99 })).sort((a, b) => a.d - b.d)[0];
      pick = near.c;
    }
    stops.push({ ...pick, kind: pool.kind });
    if (stops.length >= 3) break;
  }
  if (stops.length > 1 && stops.length >= 2) log(`Kept stops close together: ${stops.map((s) => s.name).join(" then ")}.`);
  const plan = await dressPlan(env, user, seeds, stops, { area, budget, mood: req.mood, period: req.period || "all", when: req.when || user.whenx || "Saturday afternoon" });
  plan.widened = !!widened;
  plan.notice = planNotice(plan.stops, area, !!widened);
  plan.pool = pools.map((p) => ({ kind: p.kind, items: p.items.slice(0, 8) }));
  plan.receipt = {
    seeds: seeds.map((s) => ({ name: s.name, qloo_id: s.qloo_id })),
    queries: pools.map((p) => ({ endpoint: "/v2/insights", "filter.type": "urn:entity:place", "filter.tags": p.tag?.id || null, "filter.location.query": area, "signal.interests.entities": `${seeds.length} card IDs`, returned: p.items.length })),
    sent_to_qloo: "Card IDs and your area. No note text.",
  };
  return plan;
}

export function planNotice(stops, area, widened) {
  if (!widened) return null;
  const areaWord = String(area || "").split(",")[0].trim();
  const hoods = stops.map((x) => x.neighborhood).filter(Boolean);
  const outside = hoods.filter((h) => h.toLowerCase() !== areaWord.toLowerCase());
  if (!outside.length) return null;
  const uniq = [...new Set(outside)];
  if (outside.length === stops.length) return `Not much matched right in ${areaWord}, so I looked a little further. ${stops.length === 1 ? `The stop is in ${uniq[0]}.` : uniq.length === 1 ? `${stops.length === 2 ? "Both stops are" : "All stops are"} in ${uniq[0]}.` : `The stops are in ${uniq.join(" and ")}.`}`;
  return `Not much matched right in ${areaWord} for every stop, so one is in ${uniq.join(" and ")}.`;
}

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
function hoursLine(hours, when) {
  const day = DAYS.find((d) => (when || "").toLowerCase().includes(d)) || "saturday";
  const h = hours && hours[day];
  const cap = day[0].toUpperCase() + day.slice(1);
  if (!Array.isArray(h) || !h.length || !h[0]) return "Hours not listed";
  if (h[0].closed) return `Qloo lists it closed on ${cap}s · not live-checked`;
  const t = (x) => (x || "").replace(/^T/, "").slice(0, 5);
  return `Qloo lists ${cap} ${h.filter(Boolean).map((x) => `${t(x.opens)}–${t(x.closes)}`).join(", ")} · not live-checked`;
}

/** Labelled reasons for each stop. */
export async function dressPlan(env, user, seeds, stops, meta) {
  const seedNames = seeds.map((s) => s.name);
  const fps = (await env.DB.prepare(`SELECT c.id card_id, c.qloo_id, c.image, c.name, c.type, COUNT(f.id) n, (SELECT f2.quote FROM footprints f2 WHERE f2.card_id=c.id AND f2.quote IS NOT NULL AND LENGTH(f2.quote)>8 ORDER BY f2.created_at DESC LIMIT 1) quote, (SELECT f2.created_at FROM footprints f2 WHERE f2.card_id=c.id AND f2.quote IS NOT NULL AND LENGTH(f2.quote)>8 ORDER BY f2.created_at DESC LIMIT 1) quote_at FROM cards c JOIN footprints f ON f.card_id=c.id WHERE c.user_id=? AND c.qloo_id IN (${seeds.map(() => "?").join(",")}) GROUP BY c.id ORDER BY n DESC`).bind(user.id, ...seeds.map((s) => s.qloo_id)).all()).results || [];
  const notesLine = fps.length
    ? "You " + fps.slice(0, 2).map((r) => (r.n > 1 ? `came back to ${r.name} ${r.n} times` : `wrote about ${r.name}`)).join(" and ") + "."
    : `You kept ${seedNames.slice(0, 2).join(" and ")}.`;
  let reads = [];
  try {
    const o = await llmJSON(env,
      "For each venue write ONE plain sentence addressed to the reader as \"you\" (12-20 words) on why it suits this person's afternoon, connecting a concrete fact about the venue (its kind, vibes or description) to the feel of what they keep returning to (given as seeds). Do not name the seeds as if the venue is about them; no hype, no exclamation marks, no claims about hours, prices or being open. Return {\"reads\":[...]} in order.",
      JSON.stringify({ seeds: seedNames, venues: stops.map((s) => ({ name: s.name, kind: s.kind, vibes: s.vibes, description: s.description })) }), READ_SCHEMA, 400);
    reads = o?.reads || [];
  } catch (_) {}
  const fit = (s, i = 0) => {
    const k = (s.kind || "").toLowerCase();
    const want = /book|library/.test(k) ? ["book"] : /record|music|venue|bar/.test(k) ? ["music"] : /cinema|theater|theatre|movie/.test(k) ? ["film", "tv"] : null;
    const rel = want ? fps.filter((r) => want.includes(r.type)) : [];
    const use = rel.length ? rel : fps;
    if (!use.length) return notesLine;
    return "You " + [...use.slice(i % use.length), ...use.slice(0, i % use.length)].slice(0, 2).map((r) => (r.n > 1 ? `came back to ${r.name} ${r.n} times` : `wrote about ${r.name}`)).join(" and ") + ".";
  };
  const usedSrc = new Set();
  const byQ = new Map(fps.map((r) => [String(r.qloo_id).toLowerCase(), r]));
  const seedByQ = new Map(seeds.map((x) => [String(x.qloo_id).toLowerCase(), x]));
  /** Real Qloo per-seed contributions for a stop, joined to the user's cards and note quotes. */
  const contribFor = (s) => {
    if (!Array.isArray(s.expl) || !s.expl.length) return null;
    const rows = s.expl.map((x) => {
      const k = String(x.id).toLowerCase(), r = byQ.get(k), sd = seedByQ.get(k);
      if (!r && !sd) return null;
      return { card_id: r?.card_id || sd?.id || null, qloo_id: r?.qloo_id || sd?.qloo_id, name: r?.name || sd?.name, type: r?.type || sd?.type, image: r?.image || null, n: r?.n || 0, quote: r?.quote ? String(r.quote).slice(0, 140) : null, at: r?.quote_at || null, score: x.score };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
    return rows.length ? rows : null;
  };
  const sourcesFor = (s, i = 0) => {
    const cf = contribFor(s);
    if (cf) {
      const fr = cf.filter((r) => !usedSrc.has(r.card_id)), rest = cf.filter((r) => usedSrc.has(r.card_id));
      const ord = [...fr, ...rest].slice(0, 2);
      ord.forEach((r) => r.card_id && usedSrc.add(r.card_id));
      return ord.map((r) => ({ card_id: r.card_id, qloo_id: r.qloo_id, name: r.name, type: r.type, image: r.image, n: r.n, quote: r.quote, at: r.at, score: r.score }));
    }
    if (false) return cf.slice(0, 2).map((r) => ({ card_id: r.card_id, qloo_id: r.qloo_id, name: r.name, type: r.type, image: r.image, n: r.n, quote: r.quote, at: r.at, score: r.score }));
    const k = (s.kind || "").toLowerCase();
    const want = /book|library/.test(k) ? ["book"] : /record|music|venue|bar/.test(k) ? ["music"] : /cinema|theater|theatre|movie/.test(k) ? ["film", "tv"] : null;
    const rel = want ? fps.filter((r) => want.includes(r.type)) : [];
    const use = rel.length ? rel : fps;
    if (!use.length) return [];
    const rot = [...use.slice(i % use.length), ...use.slice(0, i % use.length)];
    const fresh = rot.filter((r) => !usedSrc.has(r.card_id));
    const pick = [...fresh, ...rot.filter((r) => usedSrc.has(r.card_id))].slice(0, fresh.length >= 2 ? 2 : Math.min(2, Math.max(1, rot.length)));
    pick.forEach((r) => usedSrc.add(r.card_id));
    return pick
      .map((r) => ({ card_id: r.card_id, qloo_id: r.qloo_id, name: r.name, type: r.type, image: r.image, n: r.n, quote: r.quote ? String(r.quote).slice(0, 140) : null, at: r.quote_at || null }));
  };
  const startMin = /morning/i.test(meta.when || "") ? 10 * 60 : /evening|night|dinner/i.test(meta.when || "") ? 18 * 60 : /(^|[^a-z])noon|lunch/i.test(meta.when || "") ? 12 * 60 : 14 * 60;
  const stay = (k) => (/book|library|record/i.test(k || "") ? 40 : /cafe|coffee|tea|bakery/i.test(k || "") ? 45 : 60);
  const fmtT = (m) => { const h = Math.floor(m / 60) % 24, mm = m % 60; return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
  let clock = startMin;
  const out = stops.map((s, i) => {
    const prev = stops[i - 1];
    if (prev) { const dd = haversineMi(prev.coords, s.coords) ?? 0.5; clock += dd < 1.3 ? Math.max(1, Math.round(dd * 20)) : Math.max(2, Math.round(dd * 6)); }
    const arrive = clock, leave = clock + stay(s.kind); clock = leave;
    const d = prev ? haversineMi(prev.coords, s.coords) : null;
    return {
      qloo_id: s.qloo_id, name: s.name, kind: s.kind, neighborhood: s.neighborhood, address: s.address,
      distance: d != null ? (d < 1.3 ? `${Math.max(1, Math.round(d * 20))} min walk from stop ${i}` : `${Math.max(2, Math.round(d * 6))} min by bike from stop ${i} (${d.toFixed(1)} mi)`) : null,
      arrive: fmtT(arrive), leave: fmtT(leave), stay_min: leave - arrive, sources: sourcesFor(s, i),
      from_notes: fit(s, i),
      why: (() => {
        const cf = contribFor(s);
        return { attribution: !!cf, contributions: cf, affinity: s.affinity ?? null, qloo_id: s.qloo_id, popularity: s.popularity ?? null, vibes: (s.vibes || []).slice(0, 6), kinds: s.kinds || [], price_level: s.price_level ?? null, area: meta.area, seeds_sent: seedNames.length };
      })(),
      from_qloo: (() => { const cf = contribFor(s); if (cf) { const top = cf.slice(0, 2); return `Qloo matched this ${String(s.kind || "place").toLowerCase()} mostly through ${top.map((r) => `${r.name} (${Math.round(r.score * 100)}% of the match)`).join(" and ")}` + (s.affinity != null ? `; affinity ${Number(s.affinity).toFixed(2)}` : "") + "."; } const n = seedNames.length || 1, a = [seedNames[(i * 2) % n], seedNames[(i * 2 + 1) % n]].filter((x, j, arr) => x && arr.indexOf(x) === j); return `Qloo ranked this ${String(s.kind || "place").toLowerCase()} near ${a.join(" and ")} in taste` + (s.popularity != null ? ` (popularity ${Number(s.popularity).toFixed(2)})` : "") + "."; })(),
      read: reads[i] || (s.description ? s.description.replace(/\s+/g, " ").split(/(?<=[.!?])\s/)[0].slice(0, 160) : ""),
      ops: hoursLine(s.hours, meta.when),
      map_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([s.name, s.address].filter(Boolean).join(", "))}`,
      coords: s.coords, vibes: s.vibes, description: s.description, hours: s.hours, price_level: s.price_level,
    };
  });
  const moodWord = { familiar: "familiar", different: "a little different", surprise: "surprise me" }[meta.mood] || "a little different";
  return { id: uid(), period: meta.period, header: `${meta.when} · ${meta.area} · under $${meta.budget} · ${moodWord}`, stops: out, seeds: seeds.map((s) => ({ qloo_id: s.qloo_id, name: s.name })), meta };
}
