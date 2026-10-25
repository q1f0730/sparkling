// Weekend plan: cards the user returns to -> Qloo place candidates near their area -> two stops.
// Every stop is a Qloo entity returned in this request. The model only writes one sentence per stop.
import { llmJSON } from "./llm.js";
import { uid } from "./recognize.js";

const BASE = "https://hackathon.api.qloo.com";

export const AUDIENCES = { photography: ["7DCA3589-E6FF-4582-BE24-5A2D09D71336", "Photography"], arts_crafts: ["604A723B-3E2C-4795-89AA-DF5BA0C3B3C5", "Arts & crafts"], musician: ["15D9D8DF-28AF-425A-AF2E-835DFB53E778", "Musicians"], hiking: ["73B662F7-7DB7-4D0C-A36B-2E8E75ACDF49", "Hikers"], meditation: ["1C3735D4-FE2D-4CDE-811A-9B2BFE767DAD", "Meditation"], travel: ["7CB916B9-1D27-4D76-8D97-2CC5950385CA", "Travellers"] };
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

// ---- Place facts and validation (every stop must pass these; see tests/plan-quality.test.mjs)
// NYC ZIP -> neighbourhoods that ZIP plausibly belongs to (first = default). Border ZIPs list both sides.
const ZIP_HOODS = {
  "11201": ["Brooklyn Heights", "DUMBO", "Downtown Brooklyn", "Cobble Hill"], "11205": ["Fort Greene", "Clinton Hill"], "11206": ["Williamsburg", "East Williamsburg", "Bushwick", "Bedford-Stuyvesant"],
  "11207": ["East New York", "Bushwick"], "11208": ["East New York", "Cypress Hills"], "11209": ["Bay Ridge"], "11210": ["Flatbush", "Midwood"], "11211": ["Williamsburg", "East Williamsburg", "Greenpoint"],
  "11212": ["Brownsville"], "11213": ["Crown Heights"], "11214": ["Bensonhurst", "Bath Beach"], "11215": ["Park Slope", "Windsor Terrace", "Gowanus"], "11216": ["Bedford-Stuyvesant", "Crown Heights"],
  "11217": ["Boerum Hill", "Park Slope", "Prospect Heights", "Fort Greene", "Gowanus"], "11218": ["Kensington", "Windsor Terrace", "Ditmas Park"], "11219": ["Borough Park"], "11220": ["Sunset Park"],
  "11221": ["Bushwick", "Bedford-Stuyvesant"], "11222": ["Greenpoint", "Williamsburg"], "11223": ["Gravesend"], "11224": ["Coney Island"], "11225": ["Prospect Lefferts Gardens", "Crown Heights", "Flatbush"],
  "11226": ["Flatbush", "Ditmas Park"], "11228": ["Dyker Heights"], "11229": ["Sheepshead Bay"], "11230": ["Midwood"], "11231": ["Carroll Gardens", "Red Hook", "Cobble Hill", "Gowanus"], "11232": ["Sunset Park", "Greenwood Heights"],
  "11233": ["Bedford-Stuyvesant", "Ocean Hill"], "11234": ["Marine Park"], "11235": ["Brighton Beach"], "11236": ["Canarsie"], "11237": ["Bushwick", "Ridgewood"], "11238": ["Prospect Heights", "Crown Heights", "Clinton Hill"], "11249": ["Williamsburg"],
  "10001": ["Chelsea", "Hudson Yards"], "10002": ["Lower East Side", "Chinatown"], "10003": ["East Village", "Greenwich Village", "Union Square", "Gramercy"], "10004": ["Financial District"], "10005": ["Financial District"],
  "10006": ["Financial District"], "10007": ["Tribeca"], "10009": ["East Village", "Alphabet City"], "10010": ["Gramercy", "Flatiron"], "10011": ["Chelsea", "West Village"], "10012": ["SoHo", "Greenwich Village", "NoHo", "Nolita"],
  "10013": ["SoHo", "Tribeca", "Chinatown", "Little Italy"], "10014": ["West Village", "Greenwich Village"], "10016": ["Murray Hill", "Kips Bay"], "10017": ["Midtown East"], "10018": ["Midtown", "Garment District"],
  "10019": ["Midtown West", "Hell's Kitchen"], "10021": ["Upper East Side"], "10022": ["Midtown East"], "10023": ["Upper West Side"], "10024": ["Upper West Side"], "10025": ["Upper West Side", "Morningside Heights"],
  "10026": ["Harlem"], "10027": ["Harlem", "Morningside Heights"], "10028": ["Upper East Side"], "10029": ["East Harlem"], "10030": ["Harlem"], "10031": ["Hamilton Heights"], "10032": ["Washington Heights"],
  "10033": ["Washington Heights"], "10034": ["Inwood"], "10035": ["East Harlem"], "10036": ["Midtown", "Hell's Kitchen", "Times Square"], "10037": ["Harlem"], "10038": ["Financial District", "Seaport"], "10039": ["Harlem"],
  "10040": ["Washington Heights"], "10044": ["Roosevelt Island"], "10065": ["Upper East Side"], "10069": ["Upper West Side"], "10075": ["Upper East Side"], "10128": ["Upper East Side"], "10280": ["Battery Park City"], "10282": ["Battery Park City"],
  "11101": ["Long Island City"], "11102": ["Astoria"], "11103": ["Astoria"], "11104": ["Sunnyside"], "11105": ["Astoria"], "11106": ["Astoria"], "11109": ["Long Island City"], "11354": ["Flushing"], "11355": ["Flushing"],
  "11372": ["Jackson Heights"], "11373": ["Elmhurst"], "11375": ["Forest Hills"], "11377": ["Woodside"], "11385": ["Ridgewood"],
};
const lc = (s) => String(s || "").toLowerCase().trim();
const title = (s) => String(s || "").toLowerCase().replace(/(^|[\s-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
export const zipOf = (address) => (String(address || "").match(/\b(1[01]\d{3})(?:-\d{4})?\s*$/) || String(address || "").match(/,\s*NY\s+(1[01]\d{3})\b/) || [])[1] || null;

/** One neighbourhood per place, consistent with its street address (Qloo's own label can disagree with the ZIP). */
export function resolveNeighborhood(p, address) {
  const zip = zipOf(address);
  const set = zip ? ZIP_HOODS[zip] : null;
  const locs = Array.isArray(p?.localities) ? p.localities : [];
  const fromLocs = locs.find((l) => l && l.place === "neighbourhood")?.name;
  const qloo = p?.neighborhood || p?.geocode?.name || null;
  const inSet = (h) => h && set && set.some((x) => lc(x) === lc(h));
  let hood, source;
  if (set) {
    if (inSet(fromLocs)) { hood = fromLocs; source = "qloo+zip"; }
    else if (inSet(qloo)) { hood = qloo; source = "qloo+zip"; }
    else { hood = set[0]; source = "zip"; }
  } else { hood = fromLocs || qloo || null; source = hood ? "qloo" : null; }
  const borough = locs.find((l) => l && l.place === "borough")?.name || null;
  return { neighborhood: hood ? (hood === hood.toUpperCase() ? title(hood) : hood) : null, zip, borough, hood_source: source, qloo_neighborhood: qloo };
}

// Requested kind -> which Qloo primary genres count as that kind. A place is shown with its own primary genre.
const KIND_RULES = [
  { re: /book|librar/, ok: /^(book store|used book store|bookstore|comic book store|library|rare book store)$/i, tag: "urn:tag:genre:place:book_store" },
  { re: /record|vinyl|music store/, ok: /^(record store|music store|vinyl record store)$/i, tag: "urn:tag:genre:place:record_store" },
  { re: /cafe|coffee|tea|espresso/, ok: /^(cafe|coffee shop|coffee roasters|espresso bar|tea house|tea room|bakery|patisserie|pastry shop|internet cafe|bubble tea store|dessert shop|pie shop)$/i, tag: "urn:tag:category:place:coffee_shop" },
  { re: /bakery/, ok: /^(bakery|patisserie|pastry shop|cafe|coffee shop|pie shop)$/i, tag: "urn:tag:genre:place:restaurant:bakery" },
  { re: /cinema|movie|film/, ok: /^(movie theater|cinema|art house cinema|independent movie theater|drive-in movie theater|film archive)$/i, tag: "urn:tag:genre:place:movie_theater" },
  { re: /museum/, ok: /^(museum|art museum|history museum|science museum|art gallery)$/i, tag: "urn:tag:genre:place:museum" },
  { re: /galler/, ok: /^(art gallery|museum|art museum|art center)$/i, tag: "urn:tag:genre:place:art_gallery" },
  { re: /wine/, ok: /^(wine bar|bar|cocktail bar|wine store)$/i, tag: "urn:tag:genre:place:restaurant:wine_bar" },
  { re: /jazz|music venue|live music/, ok: /^(jazz club|live music venue|music venue|concert hall|night club|bar)$/i, tag: "urn:tag:genre:place:live_music_venue" },
  { re: /^bar$|pub|cocktail/, ok: /^(bar|cocktail bar|wine bar|pub|lounge|speakeasy|beer bar|brewery)$/i, tag: "urn:tag:genre:place:restaurant:bar" },
  { re: /park|garden/, ok: /^(park|garden|botanical garden|state park|city park|playground)$/i, tag: "urn:tag:genre:place:park" },
  { re: /restaurant|dinner|lunch/, ok: /restaurant|bistro|eatery|diner/i, tag: null },
];
export const kindRule = (k) => KIND_RULES.find((r) => r.re.test(lc(k))) || null;
// Never a taste-plan stop, whatever Qloo files it under (barbers tagged as cafes, chains, services).
const NEVER = /\b(barber|hair|salon|nail|beauty|spa|tattoo|laundromat|bank|atm|pharmacy|clinic|dental|dentist|doctor|hospital|church|school|daycare|grocery|supermarket|gas station|car wash|storage|fast food|hamburger|wastewater|treatment plant)\b/i;
const CHAINS = /^(starbucks|dunkin|mcdonald'?s|burger king|pret a manger|le pain quotidien|tim hortons|7-eleven|barnes & noble|chipotle|subway|panera)\b/i;
const NYC_BOX = { s: 40.49, n: 40.92, w: -74.27, e: -73.68 };
const inNYC = (c) => !!c && c.lat >= NYC_BOX.s && c.lat <= NYC_BOX.n && c.lon >= NYC_BOX.w && c.lon <= NYC_BOX.e;
export const boroughOfZip = (zip) => { const z = String(zip || ""); return /^112/.test(z) ? "Brooklyn" : /^10[0-2]/.test(z) ? "Manhattan" : /^103/.test(z) ? "Staten Island" : /^104/.test(z) ? "Bronx" : /^11[0-6]/.test(z) ? "Queens" : null; };
/** Borough the user asked about: named in the text, or the borough of the named neighbourhood's ZIPs. */
export function areaBorough(area) {
  const m = String(area || "").match(/brooklyn|manhattan|queens|bronx|staten island/i);
  if (m) return m[0].replace(/\b\w/g, (c) => c.toUpperCase()).replace("Staten island", "Staten Island");
  const hood = lc(String(area || "").split(",")[0]);
  const zips = Object.entries(ZIP_HOODS).filter(([, hs]) => lc(hs[0]) === hood).map(([z]) => boroughOfZip(z));
  return zips.length && zips.every((b) => b === zips[0]) ? zips[0] : null;
}
export const isNYCArea = (area) => /brooklyn|manhattan|queens|bronx|staten island|new york|\bnyc\b|\bny\b/i.test(area || "") || Object.values(ZIP_HOODS).some((hs) => hs.some((h) => lc(h) === lc(String(area || "").split(",")[0])));

/** Primary genre first, then the place's category tags; generic words dropped. */
function placeCats(e) {
  const p = e.properties || {};
  const prim = p.primary_genre?.name ? [p.primary_genre.name] : [];
  const cats = (e.tags || []).filter((t) => /category:place|genre:place/.test(t.type || t.subtype || "")).map((t) => t.name);
  return [...new Set([...prim, ...cats])].filter((n) => n && !/^(place|shopping|store|point of interest|establishment)$/i.test(n));
}

/**
 * Is this Qloo place a real, open, correctly-labelled stop for `kind`? Returns {ok, fit, label, reasons}.
 * fit 2 = its primary genre is the kind, 1 = the kind is a secondary category and the primary is compatible-ish.
 */
export function checkPlace(p, kind, ctx = {}) {
  if (!p || typeof p !== "object") return { ok: false, fit: 0, label: kind || "", reasons: ["no_id"] };
  const reasons = [];
  const rule = kindRule(kind);
  const cats = p.cats || [];
  const primary = p.primary || cats[0] || null;
  if (!p.name || !p.qloo_id) reasons.push("no_id");
  if (!p.address && !p.coords) reasons.push("no_location");
  if (p.is_closed) reasons.push("closed");
  if (NEVER.test(p.name || "") || NEVER.test(primary || "")) reasons.push("not_a_stop");
  if (CHAINS.test(p.name || "")) reasons.push("chain");
  if (ctx.nyc && p.coords && !inNYC(p.coords)) reasons.push("outside_nyc");
  // An afternoon on foot: never hop the river (Greenpoint -> East Village) unless the user asked for that borough.
  const pb = p.borough || boroughOfZip(p.zip);
  if (ctx.borough && pb && pb !== ctx.borough) reasons.push("other_borough");
  let fit = 0, label = primary;
  if (rule) {
    if (primary && rule.ok.test(primary)) fit = 2;
    else if (cats.slice(0, 3).some((c) => rule.ok.test(c)) && !(primary && /restaurant|bar|brewery|boutique|jewel|clothing|market|grocery|hotel/i.test(primary) && !rule.ok.test(primary))) { fit = 1; label = cats.find((c) => rule.ok.test(c)); }
  } else {
    const want = lc(kind).replace(/s$/, "");
    if (primary && lc(primary).includes(want)) fit = 2; else if (cats.some((c) => lc(c).includes(want))) { fit = 1; label = cats.find((c) => lc(c).includes(want)); }
  }
  if (!fit) reasons.push("wrong_category");
  if (ctx.day && ctx.window) {
    const o = openWindow(p.hours, ctx.day, ctx.window[0], ctx.window[1]);
    if (o === false) reasons.push("closed_then");
  }
  return { ok: !reasons.length, fit, label: label || kind, reasons };
}

const hm = (x) => { const m = String(x || "").match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
/** Qloo hours for a day -> [[open,close],...] in minutes (closing after midnight rolls past 1440). null = not listed. */
export function dayRanges(hours, day) {
  const h = hours && hours[day];
  if (!Array.isArray(h) || !h.length || !h[0]) return null;
  if (h.every((x) => x && x.closed)) return [];
  return h.filter((x) => x && !x.closed).map((x) => { const o = hm(x.opens), c = hm(x.closes); if (o == null || c == null) return null; return [o, c <= o ? c + 1440 : c]; }).filter(Boolean);
}
/** Minutes of [from,to] the place is open on `day`: false when it is not open for at least `need` minutes, null when unknown. */
export function openWindow(hours, day, from, to, need = 30) {
  const r = dayRanges(hours, day);
  if (r == null) return null;
  const overlap = r.reduce((s, [o, c]) => s + Math.max(0, Math.min(c, to) - Math.max(o, from)), 0);
  return overlap >= Math.min(need, to - from) ? overlap : false;
}
/** Open from arrival until at least arrival+stay (or 30 min, whichever is less)? true/false/null(unknown). */
export function openAt(hours, day, arrive, stay) {
  const r = dayRanges(hours, day);
  if (r == null) return null;
  return r.some(([o, c]) => arrive >= o && Math.min(c, arrive + stay) - arrive >= Math.min(30, stay));
}

const TIME_TAG = /^(morning|afternoon|evening|night|late night|early morning|brunch|lunch|dinner|breakfast|weekday|weekend|daytime|happy hour)$/i;
// Generic service/use tags Qloo puts on many places: they describe what you can do anywhere, not this place.
const GENERIC_VIBE = /^(education learning|event catering|catering|food service|casual|shopping|convenient|restroom|clean|wi ?fi|takeout|delivery|dine in|quick bite|credit cards|debit cards|reservations?|walkable|good for (?:groups?|kids?|families)|groups?|family friendly|kid friendly|kids friendly|socializing|socialising|dining(?:\s*(?:and|&|,|\+|\/)\s*|\s+)drinking|dining out|dogs? allowed(?: inside| outside| indoors| outdoors)?|dogs? (?:friendly|welcome)|pets? (?:allowed|friendly|welcome)|wheelchair accessible|wheelchair access)$/i;
// Facility taxonomies: amenities, accessibility, offerings. Never character, whatever the tag name says.
const FACILITY_TAG = /amenit|accessib|offerings/;
function isVibeTag(t) {
  const name = (t?.name || "").trim(), ty = t?.type || t?.subtype || "";
  return !!name && !TIME_TAG.test(name) && !/time_of_day/.test(ty) && !GENERIC_VIBE.test(name) && !FACILITY_TAG.test(ty);
}
function slimPlace(e) {
  if (!e || typeof e !== "object") return null;
  const p = e.properties || {};
  const loc = e.location || p.geocode || {};
  const lat = loc.lat ?? p.latitude, lon = loc.lon ?? loc.lng ?? p.longitude;
  const cats = placeCats(e);
  const kinds = cats.slice(0, 4);
  const vibes = (e.tags || []).filter(isVibeTag).filter((t) => !/genre:place|category|payment|credit_card|cost|rating|inclusivity|menu|dining|cuisine|planning|parking|service|specialty|highlights|nearby|children|kids|price|age_range|customer|dietary|crowd|restroom/.test(t.type || t.subtype || "")).map((t) => t.name).slice(0, 6);
  const hood = resolveNeighborhood(p, p.address);
  return {
    qloo_id: e.entity_id, name: e.name, address: p.address, ...hood,
    primary: p.primary_genre?.name || cats[0] || null, cats,
    price_level: p.price_level, kinds, vibes, popularity: e.popularity,
    coords: lat != null && lon != null ? { lat: +lat, lon: +lon } : null,
    description: (p.description || p.short_description || "").slice(0, 240),
    affinity: typeof e.query?.affinity === "number" ? +e.query.affinity.toFixed(3) : null,
    expl: Array.isArray(e.query?.explainability?.["signal.interests.entities"]) ? e.query.explainability["signal.interests.entities"].filter((x) => x && x.entity_id && typeof x.score === "number").map((x) => ({ id: x.entity_id, score: +x.score.toFixed(3) })) : null,
    hours: p.hours || null, is_closed: !!p.is_closed, website: Array.isArray(p.websites) ? p.websites[0] : p.website,
  };
}
export { slimPlace };

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
  else seeds = seedBands(good).seeds;
  return { seeds, all: rows, good };
}

/** Near / mid / far bands over liked cards sorted by closeness to the core of the taste (hearts, repeats).
 *  near = the core, mid = the middle, far = the thinly-touched edge. Seeds = 2 near + 1 mid + 1 far, so a plan
 *  leans familiar but reaches one step out, each seed carrying its band for the "why it fits" line. */
export function seedBands(good) {
  const g = Array.isArray(good) ? good : [];
  const k = Math.ceil(g.length / 3);
  const near = g.slice(0, k), mid = g.slice(k, 2 * k), far = g.slice(2 * k);
  const seeds = [...near.slice(0, 2).map((c) => ({ ...c, band: "near" })), ...mid.slice(0, 1).map((c) => ({ ...c, band: "mid" })), ...far.slice(0, 1).map((c) => ({ ...c, band: "far" }))];
  // Thin edges (4-5 cards leave "far" empty): fill to four from the next closest cards so evidence can stay distinct.
  if (g.length >= 4 && seeds.length < 4) for (const c of [...mid, ...far]) { if (seeds.length >= 4) break; if (!seeds.some((x) => x === c || (x.id === c.id && x.qloo_id === c.qloo_id))) seeds.push({ ...c, band: far.includes(c) ? "far" : "mid" }); }
  return { near, mid, far, seeds: g.length < 4 ? g.map((c) => ({ ...c, band: "near" })) : seeds };
}

/** Equal-sized cohorts of liked cards by their latest footprint: the latest N vs the N before. */
export function cohorts(cards, n = 6) {
  if (!Array.isArray(cards)) cards = [];
  const byLast = [...cards].sort((a, b) => (b.last || b.last_at || 0) - (a.last || a.last_at || 0));
  const size = Math.min(n, Math.floor(byLast.length / 2));
  return { size, now: byLast.slice(0, size), then: byLast.slice(size, size * 2) };
}

const DEFAULT_KINDS = ["bookstore", "cafe", "record store"];
const VENUES = ["bookstore", "book store", "bookshop", "record store", "cafe", "coffee", "cinema", "movie theater", "museum", "gallery", "wine bar", "bar", "park", "bakery", "pie shop", "library", "tea", "restaurant", "music venue", "jazz club"];
/** Kinds the request text explicitly names, in the order written. Empty when it names none. */
export function kindsFromText(text) {
  const low = lc(text);
  if (!low) return [];
  const hits = VENUES.map((v) => [v, low.indexOf(v)]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]).map(([v]) => (v === "coffee" || v === "tea" ? "cafe" : v === "book store" || v === "bookshop" ? "bookstore" : v));
  if (/somewhere (nearby )?to sit/.test(low) && !hits.includes("cafe")) hits.push("cafe");
  return [...new Set(hits)].filter((h, i, arr) => !(h === "bar" && arr.includes("wine bar"))).slice(0, 3);
}
/** Kinds to ask Qloo for: exactly what the text names, else the defaults. Time/budget text never picks kinds. */
export function planKinds(text) {
  const k = kindsFromText(text);
  return k.length ? k : DEFAULT_KINDS;
}
// zh copy for the go-out activity log: place kinds, weekdays, and work titles in 《》 (names stay as they are).
const KIND_ZH = { bookstore: "书店", "book store": "书店", bookshop: "书店", "record store": "唱片店", cafe: "咖啡馆", coffee: "咖啡馆", tea: "茶室", cinema: "影院", "movie theater": "影院", museum: "博物馆", gallery: "画廊", "wine bar": "葡萄酒酒吧", bar: "酒吧", park: "公园", bakery: "面包店", "pie shop": "派店", library: "图书馆", restaurant: "餐厅", "music venue": "音乐场地", "jazz club": "爵士俱乐部" };
const KIND_ZH_OF = (k) => KIND_ZH[k] || k;
const DAY_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const WORK_TYPES = new Set(["film", "tv", "music", "book", "podcast"]);
/** 《》 only for works; artists, people and places stay bare, and rows with no type keep the old title treatment. */
const zhTitle = (x) => {
  if (!x) return "";
  const type = String(x.type || "").toLowerCase();
  const work = !type || (!/artist|person|place/.test(type) && (WORK_TYPES.has(type) || /^(film|tv|music|book|podcast)\b/.test(type)));
  return work ? `《${x.name ?? ""}》` : String(x.name ?? "");
};
/** The single space between the verb and its tags in the zh catalogue clause (kept out of the phrase literal). */
const ZH_CATALOGUE_GAP = " ";
/** zh copy spacing: no stray space before CJK punctuation, exactly one space between a Latin run and a CJK character. */
export function zhSpace(s) {
  return String(s == null ? "" : s)
    .replace(/([A-Za-z0-9])\s*([\u4e00-\u9fff])/g, "$1 $2")
    .replace(/([\u4e00-\u9fff])\s*([A-Za-z0-9])/g, "$1 $2")
    .replace(/[ \t]+([，。、；：！？）」』》])/g, "$1");
}

// ---- small caches in D1 (llm_cache table): Qloo place pools for 6 h, model sentences for 7 days.
async function sha(s) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), (b) => b.toString(16).padStart(2, "0")).join(""); }
export async function cacheGet(env, key, maxAgeMs) {
  try { const r = await env.DB.prepare("SELECT value, created_at FROM llm_cache WHERE key=?").bind(key).first(); if (r && Date.now() - r.created_at < maxAgeMs) return JSON.parse(r.value); } catch (_) {}
  return undefined;
}
export async function cachePut(env, key, value) {
  try { await env.DB.prepare("INSERT OR REPLACE INTO llm_cache (key,value,created_at) VALUES (?,?,?)").bind(key, JSON.stringify(value), Date.now()).run(); } catch (_) {}
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

async function placeTag(env, word) {
  const rule = kindRule(word);
  if (rule?.tag) return { id: rule.tag, name: word.replace(/^\w/, (c) => c.toUpperCase()) }; // known kinds: no /v2/tags round trip
  const d = await qloo(env, "/v2/tags", { "filter.query": word, "filter.parents.types": "urn:entity:place", take: 5 });
  const tags = d.results?.tags || [];
  const ty = (t) => t.type || t.subtype || "";
  const exact = tags.find((t) => /category:place/.test(ty(t))) || tags.find((t) => /genre:place/.test(ty(t))) || tags[0];
  return exact ? { id: exact.id || exact.tag_id, name: exact.name } : null;
}

// Keep the model's sentence only if every descriptive word traces to Qloo's facts; else a plain template.
const READ_OK = new Set("you your youll the a an and of to in for on at it its is be this that with as by from or place spot shop store find enjoy will can good fit fits suits suit feel feels mood kind like same near close nearby afternoon day visit stop here there small space time worth take keep keeps returning back vibe vibes".split(" "));
export function groundedRead(txt, s, note) {
  const st = s && typeof s === "object" ? s : {};
  const noteStr = typeof note === "string" && note ? note : "";
  const facts = [st.kind, st.name, st.description, ...(st.vibes || [])].join(" ").toLowerCase();
  const GEN = /dining|drinking|socializ|dogs?|allowed|inside|outdoor seating|wheelchair|parking|wifi|credit|reservations?|delivery|takeout|good for|accepts/i;
  const vibes = (st.vibes || []).map((v) => String(v).toLowerCase()).filter((v) => !GEN.test(v)).slice(0, 2);
  const tpl = `${vibes.length ? "A " + String(st.kind || "place").toLowerCase() + " with a " + vibes.join(", ") + " feel" : "A " + String(st.kind || "place").toLowerCase() + " close to your taste"}.`;
  const noteTpl = noteStr ? `${String(st.kind || "Place")}${vibes.length ? ", tagged " + vibes.join(" and ") : ""}, a fit for your note on ${noteStr}.` : tpl;
  if (!txt) return noteTpl;
  const words = String(txt).toLowerCase().replace(/[^a-z\s']/g, " ").split(/\s+/).filter((w) => w.length > 3);
  const bad = words.filter((w) => !READ_OK.has(w) && !facts.includes(w.replace(/s$/, "")));
  return bad.length > 1 ? noteTpl : txt;
}
/** Simplified-Chinese version of each stop's one-line read (read_zh). Cached; if the model is unavailable the client keeps the English line. */
export async function zhReads(env, stops, ms) {
  const src = stops.map((s) => String(s.read || ""));
  if (!src.some(Boolean)) return;
  const key = "reads:zh:" + (await sha(JSON.stringify(src)));
  let out = await cacheGet(env, key, 7 * 86400000);
  if (!out) {
    try {
      const o = await withTimeout(llmJSON(env,
        "Translate each English sentence into natural Simplified Chinese (一句话，口语化，不加感叹号). Keep place, shop, film, book and artist names in their original English spelling. Do not add facts. Return {\"reads\":[...]} with exactly the same number of items in the same order.",
        JSON.stringify({ sentences: src }), READ_SCHEMA, 700), ms || +env.READ_TIMEOUT_MS || 3500);
      out = o?.reads || [];
      if (out.length === src.length) await cachePut(env, key, out);
    } catch (_) { out = []; }
  }
  if (out.length === src.length) stops.forEach((s, i) => { if (out[i] && /[\u4e00-\u9fff]/.test(out[i])) s.read_zh = zhSpace(String(out[i]).slice(0, 200)); });
}
const READ_SCHEMA = { type: "object", properties: { reads: { type: "array", items: { type: "string" } } }, required: ["reads"] };
/** Simplified-Chinese version of each pick's catalogue synopsis (overview_zh). Cached; the English overview stays as fallback. */
export async function zhOverviews(env, picks, ms) {
  const src = picks.map((p) => String(p.overview || ""));
  if (!src.some(Boolean)) return;
  const key = "ov:zh:" + (await sha(JSON.stringify(src)));
  let out = await cacheGet(env, key, 7 * 86400000);
  if (!out) {
    try {
      const o = await withTimeout(llmJSON(env,
        "Translate each English synopsis into natural Simplified Chinese (一到两句话，口语化，不加感叹号). Keep film, TV, book, album and artist names in their original English spelling. Do not add facts. Return {\"overviews\":[...]} with exactly the same number of items in the same order.",
        JSON.stringify({ synopses: src }), OVERVIEW_SCHEMA, 700), ms || +env.READ_TIMEOUT_MS || 3500);
      out = o?.overviews || [];
      if (out.length === src.length) await cachePut(env, key, out);
    } catch (_) { out = []; }
  }
  if (out.length === src.length) picks.forEach((p, i) => { if (out[i] && /[\u4e00-\u9fff]/.test(out[i])) p.overview_zh = zhSpace(String(out[i]).slice(0, 240)); });
}
const OVERVIEW_SCHEMA = { type: "object", properties: { overviews: { type: "array", items: { type: "string" } } }, required: ["overviews"] };
const READ_BASE = "For each venue write ONE plain sentence addressed to the reader as \"you\" (12-20 words) on why it suits this person's afternoon, connecting a concrete fact about the venue (its kind, vibes or description) to the feel of what they keep returning to (given as seeds). Do not name the seeds as if the venue is about them; no hype, no exclamation marks, use ONLY facts present in the given kind, vibes or description (never invent atmosphere, decor, lighting or style words not listed), no claims about hours, prices or being open. Return {\"reads\":[...]} in order.";
/** English unless the request is zh; then ask for the same grounded sentence in Simplified Chinese. */
export const readPrompt = (lang) => READ_BASE + (lang === "zh" ? " Write each sentence in Simplified Chinese (15-30 characters), keep venue names unchanged." : "");
/** D1 cache key for those sentences: zh and en must never share one. */
export async function readCacheKey(lang, seedNames, venues) {
  return "reads:v2:" + (lang === "zh" ? "zh" : "en") + ":" + (await sha(JSON.stringify({ seedNames, venues })));
}

// ---- timing model shared by selection and the timeline
export const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const ZH_DAY = [/周日|周天|星期日|星期天|礼拜天/, /周一|星期一/, /周二|星期二/, /周三|星期三/, /周四|星期四/, /周五|星期五/, /周六|星期六/];
export const planDay = (when) => DAYS.find((d) => lc(when).includes(d)) || DAYS[ZH_DAY.findIndex((re) => re.test(String(when || "")))] || (/today|tonight|今天|今晚|今夜/.test(lc(when)) ? DAYS[new Date().getUTCDay()] : "saturday");
export const planStart = (when) => (/morning|上午|早上|早晨/i.test(when || "") ? 10 * 60 : /evening|night|dinner|晚上|今晚|夜/i.test(when || "") ? 18 * 60 : /(^|[^a-z])noon|lunch|中午/i.test(when || "") ? 12 * 60 : 14 * 60);
export const stayFor = (k) => (/book|library|record/i.test(k || "") ? 40 : /cafe|coffee|tea|bakery|patisserie|pastry/i.test(k || "") ? 45 : 60);
export const travelMin = (d) => (d == null ? 10 : d < 1.3 ? Math.max(1, Math.round(d * 20)) : Math.max(2, Math.round(d * 6)));

const MAX_HOP_MI = 3;
const tier = (d) => (d <= 1.5 ? 0 : d <= 3 ? 1 : 2);
const DOMAIN_FOR = (k) => (/book|librar/.test(lc(k)) ? ["book"] : /record|music|jazz|venue|vinyl/.test(lc(k)) ? ["music"] : /cinema|movie|film|theat/.test(lc(k)) ? ["film", "tv"] : null);

/**
 * Generate a plan. `log(text)` streams plain-language activity lines.
 * Returns {plan} or throws {state,text}.
 */
export async function makePlan(env, user, req, log) {
  const T0 = Date.now(), timing = {};
  const lang = req.lang === "zh" ? "zh" : "en";
  const area = (req.area || user.area || "").trim();
  if (!area) throw { state: "no_area", text: "Where would you like to spend an afternoon?" };
  const { seeds, all, good } = await pickSeeds(env, user.id, req.mood, req.period);
  if (req.period === "now" || req.period === "then") log(lang === "zh"
    ? (req.period === "now" ? "只依据你最近的记录。" : "只依据你更早的记录。")
    : `Planning from ${req.period === "now" ? "your recent notes" : "your earlier notes"} only.`);
  if (seeds.length < 2) throw { state: "too_few", text: "I need a few more things you love to plan from. Mark a couple of cards with a heart, or start from one card." };
  log(lang === "zh"
    ? zhSpace(`用 ${seeds.length} 张卡片做种子：${seeds.map(zhTitle).join("、")}。`)
    : `Using ${seeds.length} cards as seeds: ${seeds.map((s) => s.name).join(", ")}.`);
  const kinds = planKinds(req.text);
  timing.kinds_ms = Date.now() - T0;
  log(lang === "zh"
    ? zhSpace(`要找：${kinds.map(KIND_ZH_OF).join("、")}，范围在 ${area}。`)
    : `Looking for: ${kinds.join(", then ")}, around ${area}.`);
  const known = new Set(all.map((c) => c.qloo_id));
  const num = (v) => { const n = typeof v === "number" || (typeof v === "string" && v.trim()) ? Number(v) : NaN; return Number.isFinite(n) && n > 0 ? Math.min(n, 100000) : null; };
  const budget = num(req.budget) ?? num(user.budget) ?? 40;
  const maxPrice = budget <= 20 ? 1 : budget <= 40 ? 2 : budget <= 80 ? 3 : 4;
  const when = req.when || user.whenx || "Saturday afternoon";
  const day = planDay(when), start = planStart(when);
  const ctx = { nyc: isNYCArea(area), borough: areaBorough(area), day, window: [start, start + 210] };
  // Each stop asks Qloo with the cards that matter for it: books for a bookstore, music for a record store, plus the top seeds.
  const seedsFor = (k) => {
    const dom = DOMAIN_FOR(k);
    const rel = dom ? good.filter((c) => dom.includes(c.type)).slice(0, 3) : [];
    const out = [...rel, ...seeds].filter((s, i, arr) => arr.findIndex((x) => x.qloo_id === s.qloo_id) === i).slice(0, 5);
    return out.length >= 2 ? out : seeds;
  };
  let qlooCalls = 0, cacheHits = 0;
  const ask = async (k, tag, loc, sd) => {
    const params = {
      "filter.type": "urn:entity:place", ...loc, "filter.tags": tag?.id,
      "signal.interests.entities": sd.map((s) => s.qloo_id), "filter.popularity.min": MOOD_POP[req.mood],
      "feature.explainability": "true", take: 20,
    };
    if (req.audience && AUDIENCES[req.audience]) params["signal.demographics.audiences"] = AUDIENCES[req.audience][0];
    const key = "qp2:" + (await sha(JSON.stringify(params)));
    const hit = await cacheGet(env, key, 6 * 3600000);
    if (hit) { cacheHits++; return hit; }
    try {
      qlooCalls++;
      const d = await qloo(env, "/v2/insights", params);
      const out = (d.results?.entities || []).map(slimPlace).filter(Boolean);
      await cachePut(env, key, out);
      return out;
    } catch (e) {
      throw { state: "qloo_down", text: "Plans need the taste catalogue right now and it isn't answering. Your notes and cards are fine." };
    }
  };
  const rejected = {};
  const clean = (raw, kindName) => {
    const dropped = { known: 0, price: 0, check: 0 };
    const ok = [];
    for (const p of raw) {
      const c = checkPlace(p, kindName, ctx);
      if (!c.ok) { dropped.check++; for (const r of c.reasons) rejected[r] = (rejected[r] || 0) + 1; continue; }
      if (known.has(p.qloo_id)) { dropped.known++; continue; }
      if (p.price_level && p.price_level > maxPrice) { dropped.price++; continue; }
      ok.push({ ...p, fit: c.fit, label: c.label });
    }
    // Stable: best category fit first, Qloo's taste order within a fit.
    ok.sort((x, y) => y.fit - x.fit);
    return { ok, dropped };
  };
  const tags = await Promise.all(kinds.map((k) => placeTag(env, k).catch(() => null)));
  const T1 = Date.now();
  const first = await Promise.all(kinds.map((k, i) => { const sd = seedsFor(k); return ask(k, tags[i], { "filter.location.query": area }, sd).then((raw) => ({ k, tag: tags[i], sd, raw })); }));
  const pools = first.map(({ k, tag, sd, raw }) => {
    const { ok, dropped } = clean(raw, k);
    log(lang === "zh"
      ? zhSpace(`拿${sd.map(zhTitle).slice(0, 3).join("、")}${sd.length > 3 ? "等" : ""}去问口味目录要${KIND_ZH_OF(k)}，范围在 ${area}：回来 ${raw.length} 个，${ok.length} 个通过检查` + (dropped.check ? `（${dropped.check} 个品类不对、已关门或不是能停留的地方）` : "") + (dropped.known ? `，${dropped.known} 个你已经记过` : "") + (dropped.price ? `，${dropped.price} 个超出预算` : "") + "。")
      : `Asked the catalogue for ${k} near ${area} with ${sd.map((s) => s.name).slice(0, 3).join(", ")}${sd.length > 3 ? "…" : ""}: ${raw.length} came back, ${ok.length} passed the checks` + (dropped.check ? ` (${dropped.check} wrong kind, closed or not a stop)` : "") + (dropped.known ? `, ${dropped.known} you already know` : "") + (dropped.price ? `, ${dropped.price} over budget` : "") + ".");
    return { kind: k, tag, seeds: sd, items: ok };
  });
  timing.qloo_first_ms = Date.now() - T1;
  // Centre of the area, from whatever Qloo returned there.
  const pts = first.flatMap((f) => f.raw.map((i) => i.coords).filter(Boolean));
  const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const centre = pts.length ? { lat: med(pts.map((p) => p.lat)), lon: med(pts.map((p) => p.lon)) } : null;
  let widened = null;
  const T2 = Date.now();
  await Promise.all(pools.map(async (pool) => {
    if (pool.items.length >= 3) return;
    let more = [], where = "", whereZh = "";
    // Ask the two-mile ring and the borough at once; the borough answer is only used if the ring is thin.
    const wide = area.includes(",") ? area.split(",").pop().trim() : null;
    const [ring, boro] = await Promise.all([
      centre ? ask(pool.kind, pool.tag, { "filter.location": `POINT(${centre.lon} ${centre.lat})`, "filter.location.radius": 3200 }, pool.seeds) : [],
      wide ? ask(pool.kind, pool.tag, { "filter.location.query": wide }, pool.seeds) : [],
    ]);
    if (centre) { more = clean(ring, pool.kind).ok; where = `within two miles of ${area}`; whereZh = `离 ${area} 两英里内`; }
    if (more.length < 2 && wide) { more = more.concat(clean(boro, pool.kind).ok); where = wide; whereZh = wide; }
    if (centre) { const dc = (x) => haversineMi(centre, x.coords) ?? 99; more = more.filter((x) => dc(x) <= MAX_HOP_MI).sort((a, b) => (tier(dc(a)) - tier(dc(b))) || (b.fit - a.fit) || (dc(a) - dc(b))); }
    const seen = new Set(pool.items.map((i) => i.qloo_id));
    const add = more.filter((i) => !seen.has(i.qloo_id) && (seen.add(i.qloo_id), true));
    if (add.length) { pool.items.push(...add); widened = where; log(lang === "zh" ? zhSpace(`在 ${area} 附近${KIND_ZH_OF(pool.kind)}的选择不多，我把范围放宽到 ${whereZh}，又找到 ${add.length} 个。`) : `Few ${pool.kind} results right in ${area}, so I widened to ${where} and found ${add.length}.`); }
  }));
  timing.qloo_widen_ms = Date.now() - T2;
  const usable = pools.filter((p) => p.items.length);
  if (!usable.length) throw { state: "weak", text: `Not much near ${area} matched well this time. Try a wider area or a nearby neighbourhood.` };
  // Walk the afternoon: each stop must be open when you would arrive and stay open for the visit.
  const stops = [];
  let clock = start, unknownHours = 0, skippedHours = 0;
  for (const pool of usable) {
    const taken = new Set(stops.map((s) => s.qloo_id));
    const prev = stops[stops.length - 1];
    // Walkable first (tier 0 <= 1.5 mi, tier 1 <= 3 mi from the previous stop or the area centre), then category fit, then distance.
    const from = prev?.coords || centre;
    let cands = pool.items.filter((p) => !taken.has(p.qloo_id)).slice(0, 12)
      .map((c, i) => ({ c, i, d: from ? haversineMi(from, c.coords) ?? 1.4 : 0 }))
      .filter((x) => x.d <= MAX_HOP_MI)
      .sort((a, b) => (tier(a.d) - tier(b.d)) || (b.c.fit - a.c.fit) || (a.d - b.d) || (a.i - b.i)).map((x) => x.c);
    const stay = (c) => stayFor(c.label || pool.kind);
    const arriveAt = (c) => clock + (prev ? travelMin(haversineMi(prev.coords, c.coords)) : 0);
    let pick = cands.find((c) => openAt(c.hours, day, arriveAt(c), stay(c)) === true);
    skippedHours += pick ? cands.indexOf(pick) : 0;
    if (!pick) { pick = cands.find((c) => openAt(c.hours, day, arriveAt(c), stay(c)) === null); if (pick) unknownHours++; }
    if (!pick) { log(lang === "zh"
      ? zhSpace(`我找到的${KIND_ZH_OF(pool.kind)}在${DAY_ZH[DAYS.indexOf(day)]} ${fmtTZh(clock)} 前后都没开门，所以这一站先跳过。`)
      : `Nothing ${pool.kind} I found is open around ${fmtT(clock)} on ${day[0].toUpperCase() + day.slice(1)}, so I left that stop out.`); continue; }
    clock = arriveAt(pick) + stay(pick);
    stops.push({ ...pick, kind: pick.label || pool.kind, asked: pool.kind, seeds_used: pool.seeds.map((s) => s.qloo_id) });
    if (stops.length >= 3) break;
  }
  if (!stops.length) throw { state: "weak", text: `Nothing near ${area} is open then for what you asked. Try another time or area.` };
  if (skippedHours) log(lang === "zh" ? zhSpace(`跳过了 ${skippedHours} 个到你到的时候会关门的。`) : `Skipped ${skippedHours} that would be closed when you got there.`);
  const rj = Object.entries(rejected).filter(([, n]) => n);
  if (rj.length) log(lang === "zh"
    ? `检查排除了 ${rj.map(([r, n]) => `${n} 个${{ wrong_category: "品类不对", not_a_stop: "不是能停留的地方（理发店、杂货店……）", chain: "连锁店", closed: "已永久停业", closed_then: "那天下午会关门", outside_nyc: "不在纽约市内", other_borough: "在河对岸", no_location: "没有地址", no_id: "没有编号" }[r] || r}`).join("，")}。`
    : `Checks left out ${rj.map(([r, n]) => `${n} ${{ wrong_category: "of the wrong kind", not_a_stop: "that are not places to linger (barbers, grocers…)", chain: "chains", closed: "closed for good", closed_then: "closed that afternoon", outside_nyc: "outside the city", other_borough: "across the river", no_location: "without an address", no_id: "without an id" }[r] || r}`).join(", ")}.`);
  if (stops.length >= 2) log(lang === "zh" ? zhSpace(`让各站靠得近一些：${stops.map((s) => s.name).join("、")}。`) : `Kept stops close together: ${stops.map((s) => s.name).join(" then ")}.`);
  const allSeeds = [...seeds, ...pools.flatMap((p) => p.seeds)].filter((s, i, arr) => arr.findIndex((x) => x.qloo_id === s.qloo_id) === i);
  const T3 = Date.now();
  const plan = await dressPlan(env, user, allSeeds, stops, { area, budget, mood: req.mood, audience: AUDIENCES[req.audience] ? req.audience : null, period: req.period || "all", when, lang: req.lang === "zh" ? "zh" : "en" });
  timing.dress_ms = Date.now() - T3;
  if (req.lang === "zh") await zhReads(env, plan.stops);
  log(lang === "zh" ? zhSpace(`查过${DAY_ZH[DAYS.indexOf(day)]}的营业时间，并为每一站写了一句。`) : `Checked hours for ${day[0].toUpperCase() + day.slice(1)} and wrote one line per stop.`);
  plan.widened = !!widened;
  plan.notice = planNotice(plan.stops, area, !!widened, lang);
  if (unknownHours) plan.notice = [plan.notice, `No listed hours for ${unknownHours === 1 ? "one stop" : unknownHours + " stops"}; check before you go.`].filter(Boolean).join(" ");
  plan.pool = pools.map((p) => ({ kind: p.kind, items: p.items.slice(0, 8) }));
  plan.receipt = {
    seeds: allSeeds.map((s) => ({ name: s.name, qloo_id: s.qloo_id })),
    queries: pools.map((p) => ({ endpoint: "/v2/insights", "filter.type": "urn:entity:place", "filter.tags": p.tag?.id || null, "filter.location.query": area, "signal.interests.entities": p.seeds.map((s) => s.name), "feature.explainability": true, returned: p.items.length })),
    checks: { category: "Qloo primary genre must match the stop kind", hours: `open on arrival (${day})`, never: "barbers, salons, grocers, chains, fast food", neighborhood: "from street ZIP + Qloo locality", rejected },
    sent_to_qloo: "Card IDs and your area. No note text.",
    provenance: { live: qlooCalls, cached: cacheHits, label: cacheHits && !qlooCalls ? "cached" : cacheHits ? "live + cached" : "live", note: "Places, hours and reasons come from Qloo; the one-line reads are ours." },
  };
  timing.total_ms = Date.now() - T0; timing.qloo_calls = qlooCalls; timing.cache_hits = cacheHits;
  plan.timing = timing;
  return plan;
}

const fmtT = (m) => { const h = Math.floor(m / 60) % 24, mm = m % 60; return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
const fmtTZh = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Honest note whenever a stop sits outside the neighbourhood asked for (not only after widening). */
export function planNotice(stops, area, widened, lang) {
  const areaWord = String(area || "").split(",")[0].trim();
  const hoods = (stops || []).map((x) => x.neighborhood).filter(Boolean);
  const outside = hoods.filter((h) => h.toLowerCase() !== areaWord.toLowerCase());
  if (!outside.length) return null;
  if (!widened && !ZIP_HOOD_NAMES.has(lc(areaWord))) return null; // free-text area we cannot compare against
  const uniq = [...new Set(outside)];
  if (lang === "zh") {
    const leadZh = widened ? `${areaWord} 附近匹配的不多，所以我往外多找了一点。` : `Qloo 在 ${areaWord} 附近最匹配的地方，有的在边界外。`;
    const tied = uniq.join(" 和 ");
    if (outside.length === stops.length) {
      const tail = stops.length === 1 ? `这一站在 ${uniq[0]}。` : uniq.length === 1 ? (stops.length === 2 ? `两站都在 ${uniq[0]}。` : `所有站都在 ${uniq[0]}。`) : `这几站在 ${tied}。`;
      return zhSpace(leadZh + tail);
    }
    return zhSpace(leadZh + (outside.length === 1 ? `有一站在 ${tied}。` : `有 ${outside.length} 站在 ${tied}。`));
  }
  const lead = widened ? `Not much matched right in ${areaWord}, so I looked a little further.` : `The best matches near ${areaWord} spill over the border.`;
  if (outside.length === stops.length) return `${lead} ${stops.length === 1 ? `The stop is in ${uniq[0]}.` : uniq.length === 1 ? `${stops.length === 2 ? "Both stops are" : "All stops are"} in ${uniq[0]}.` : `The stops are in ${uniq.join(" and ")}.`}`;
  return `${lead} ${outside.length === 1 ? "One stop is" : outside.length + " stops are"} in ${uniq.join(" and ")}.`;
}
const ZIP_HOOD_NAMES = new Set(Object.values(ZIP_HOODS).flat().map(lc));

export function hoursLine(hours, when) {
  const day = planDay(when);
  const h = hours && hours[day];
  const cap = day[0].toUpperCase() + day.slice(1);
  if (!Array.isArray(h) || !h.length || !h[0]) return "Hours not listed";
  if (h[0].closed) return `Listed as closed on ${cap}s · not live-checked`;
  const t = (x) => (x || "").replace(/^T/, "").slice(0, 5);
  return `Listed ${cap} ${h.filter(Boolean).map((x) => `${t(x.opens)}–${t(x.closes)}`).join(", ")} · not live-checked`;
}

/** One "from your notes" line for a go-out stop. rows: [{name, n}], at most 2 used; empty -> null. */
export function notesLineFor(rows, lang) {
  const use = (Array.isArray(rows) ? rows : []).filter((r) => r && r.name != null).slice(0, 2);
  if (!use.length) return null;
  if (lang === "zh") {
    const part = (r) => {
      const title = zhTitle(r);
      return r.n > 1 ? `回看过${title}${/》$/.test(title) ? "" : " "}${r.n} 次` : `写过${title}`;
    };
    return zhSpace(`你${use.map(part).join("，也")}。`);
  }
  return "You " + use.map((r) => (r.n > 1 ? `came back to ${r.name} ${r.n} times` : `wrote about ${r.name}`)).join(" and ") + ".";
}

/** Labelled reasons for each stop. */
export async function dressPlan(env, user, seeds, stops, meta) {
  const seedNames = seeds.map((s) => s.name);
  const fps = (await env.DB.prepare(`SELECT c.id card_id, c.qloo_id, c.image, c.name, c.type, COUNT(f.id) n, (SELECT f2.quote FROM footprints f2 WHERE f2.card_id=c.id AND f2.quote IS NOT NULL AND LENGTH(f2.quote)>8 ORDER BY f2.created_at DESC LIMIT 1) quote, (SELECT f2.created_at FROM footprints f2 WHERE f2.card_id=c.id AND f2.quote IS NOT NULL AND LENGTH(f2.quote)>8 ORDER BY f2.created_at DESC LIMIT 1) quote_at FROM cards c JOIN footprints f ON f.card_id=c.id WHERE c.user_id=? AND c.qloo_id IN (${seeds.map(() => "?").join(",")}) GROUP BY c.id ORDER BY n DESC`).bind(user.id, ...seeds.map((s) => s.qloo_id)).all()).results || [];
  const lang = meta.lang === "zh" ? "zh" : "en";
  const notesLine = notesLineFor(fps, lang) ?? (lang === "zh"
    ? zhSpace(`你记过${seeds.slice(0, 2).map(zhTitle).join("和")}。`)
    : `You kept ${seedNames.slice(0, 2).join(" and ")}.`);
  let reads = [];
  const venues = stops.map((s) => ({ name: s.name, kind: s.kind, vibes: s.vibes, description: s.description }));
  const rkey = await readCacheKey(lang, seedNames, venues);
  const cached = await cacheGet(env, rkey, 7 * 86400000);
  if (cached) reads = cached;
  else {
    try {
      // The plan never waits more than 3.5 s for prose; a grounded template stands in.
      const o = await withTimeout(llmJSON(env,
        readPrompt(lang),
        JSON.stringify({ seeds: seedNames, venues }), READ_SCHEMA, 400), +env.READ_TIMEOUT_MS || 3500);
      reads = o?.reads || [];
      if (reads.length === stops.length) await cachePut(env, rkey, reads);
    } catch (_) {}
  }
  const fitRows = (s, i = 0) => {
    const k = (s.kind || "").toLowerCase();
    const want = /book|library/.test(k) ? ["book"] : /record|music|venue|bar/.test(k) ? ["music"] : /cinema|theater|theatre|movie/.test(k) ? ["film", "tv"] : null;
    const rel = want ? fps.filter((r) => want.includes(r.type)) : [];
    const use = rel.length ? rel : fps;
    return use.length ? [...use.slice(i % use.length), ...use.slice(0, i % use.length)] : [];
  };
  // The kept card behind a stop's read: the first row fit() would show, rotated by stop index.
  const fitCard = (s, i = 0) => fitRows(s, i)[0] || null;
  const fit = (s, i = 0) => {
    const rot = fitRows(s, i);
    return rot.length ? notesLineFor(rot.slice(0, 2), lang) : notesLine;
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
      return { card_id: r?.card_id || sd?.id || null, qloo_id: r?.qloo_id || sd?.qloo_id, name: r?.name || sd?.name, type: r?.type || sd?.type, image: r?.image || null, n: r?.n || 0, quote: r?.quote ? String(r.quote).slice(0, 140) : null, at: r?.quote_at || null, score: x.score, band: sd?.band || null };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
    return rows.length ? rows : null;
  };
  const sourcesFor = (s, i = 0) => {
    const cf = contribFor(s);
    if (cf) {
      const fr = cf.filter((r) => !usedSrc.has(r.card_id)), used = cf.filter((r) => usedSrc.has(r.card_id));
      let ord = [...fr, ...used];
      if (fr.length < 2) {
        // A card no earlier stop used (this stop's kind domain first) beats repeating evidence; reuse only when nothing else is left.
        const inCf = new Set(cf.map((r) => r.card_id));
        const kk = (s.kind || "").toLowerCase();
        const want = /book|library/.test(kk) ? ["book"] : /record|music|venue|bar|cafe|coffee|tea/.test(kk) ? ["music"] : /cinema|theater|theatre|movie|film/.test(kk) ? ["film", "tv"] : null;
        const back = fps.filter((r) => r.card_id && !usedSrc.has(r.card_id) && !inCf.has(r.card_id));
        const dom = back.filter((r) => want && want.includes(r.type));
        ord = [...fr, ...dom, ...back.filter((r) => !dom.includes(r)), ...used];
      }
      ord = ord.slice(0, 2);
      ord.forEach((r) => r.card_id && usedSrc.add(r.card_id));
      return ord.map((r) => ({ card_id: r.card_id, qloo_id: r.qloo_id, name: r.name, type: r.type, image: r.image ?? null, n: r.n || 0, quote: r.quote ? String(r.quote).slice(0, 140) : null, at: r.at || r.quote_at || null, score: r.score ?? null }));
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
  const day = planDay(meta.when);
  let clock = planStart(meta.when);
  const out = stops.map((s, i) => {
    const prev = stops[i - 1];
    if (prev) clock += travelMin(haversineMi(prev.coords, s.coords));
    const arrive = clock, leave = clock + stayFor(s.kind); clock = leave;
    const open = openAt(s.hours, day, arrive, leave - arrive);
    const d = prev ? haversineMi(prev.coords, s.coords) : null;
    const fn_ = fit(s, i);
    const fc = fitCard(s, i);
    return {
      qloo_id: s.qloo_id, name: s.name, kind: s.kind, asked: s.asked || null, neighborhood: s.neighborhood, borough: s.borough || null, address: s.address,
      distance: d != null ? (d < 1.3 ? `${Math.max(1, Math.round(d * 20))} min walk from stop ${i}` : `${Math.max(2, Math.round(d * 6))} min by bike from stop ${i} (${d.toFixed(1)} mi)`) : null,
      arrive: fmtT(arrive), leave: fmtT(leave), stay_min: leave - arrive, sources: sourcesFor(s, i),
      from_notes: fn_,
      why: (() => {
        const cf = contribFor(s);
        return { attribution: !!cf, contributions: cf, affinity: s.affinity ?? null, qloo_id: s.qloo_id, popularity: s.popularity ?? null, vibes: (s.vibes || []).slice(0, 6), kinds: s.kinds || [], price_level: s.price_level ?? null, area: meta.area, seeds_sent: seedNames.length };
      })(),
      from_qloo: (() => { const cf = contribFor(s); if (cf) { const top = cf.slice(0, 2); return `Matched this ${String(s.kind || "place").toLowerCase()} mostly through ${top.map((r) => r.name).join(" and ")}.`; } const n = seedNames.length || 1, a = [seedNames[(i * 2) % n], seedNames[(i * 2 + 1) % n]].filter((x, j, arr) => x && arr.indexOf(x) === j); return `Ranked this ${String(s.kind || "place").toLowerCase()} near ${a.join(" and ")} in taste` + (s.popularity != null ? ` (popularity ${Number(s.popularity).toFixed(2)})` : "") + "."; })(),
      read: groundedRead(reads[i], s, (contribFor(s)?.[0]?.name || fc?.name) || null),
      read_src: reads[i] && groundedRead(reads[i], s, (contribFor(s)?.[0]?.name || fc?.name) || null) === reads[i] ? "model" : "template",
      ops: hoursLine(s.hours, meta.when) + (open === false ? " · may be closed when you arrive" : ""),
      open_on_arrival: open,
      checks: { category: s.primary || s.kind, fit: s.fit ?? null, neighborhood_source: s.hood_source || null, zip: s.zip || null, open_on_arrival: open, hours_listed: open !== null },
      map_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([s.name, s.address].filter(Boolean).join(", "))}`,
      coords: s.coords, vibes: s.vibes, description: s.description, hours: s.hours, price_level: s.price_level,
    };
  });
  const moodWords = { familiar: "familiar", different: "a little different", surprise: "surprise me" };
  const moodWord = typeof meta.mood === "string" && meta.mood ? moodWords[meta.mood] || meta.mood : "familiar";
  const left_out = ((await env.DB.prepare("SELECT name FROM cards WHERE user_id=? AND heart=-1 ORDER BY name LIMIT 5").bind(user.id).all().catch(() => null))?.results || []).map((r) => r.name);
  return { id: uid(), left_out, period: meta.period, header: `${meta.when} · ${meta.area} · under $${meta.budget} · ${moodWord}`, stops: out, seeds: seeds.map((s) => ({ qloo_id: s.qloo_id, name: s.name })), meta };
}

// Plain-LLM comparison: look each model-named place up in Qloo /search and report what Qloo knows.
const nm = (x) => String(x || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
export async function checkPlainPlaces(env, names, centre, area) {
  const CITY = /\b(nyc|new york|brooklyn|manhattan|queens|greenpoint|williamsburg|ny)\b/g;
  const look = async (q) => ((await qloo(env, "/search", { query: q, types: "urn:entity:place", take: 8 })).results || []).map((r) => ({ r, d: haversineMi(centre, r.location || r.properties?.geocode) }));
  return Promise.all(names.map(async (name) => {
    try {
      const want = nm(name), core = want.replace(CITY, " ").replace(/\s+/g, " ").trim() || want;
      const match = (r) => { const n = nm(r.name).replace(CITY, " ").replace(/\s+/g, " ").trim(); const multi = core.includes(" "); return n === core || n === want || (multi && (n.startsWith(core + " ") || core.startsWith(n + " "))); };
      let res = (await look(name)).filter(({ r }) => match(r));
      if (!res.some((x) => x.d != null && x.d <= 5) && core !== want) res = res.concat((await look(core)).filter(({ r }) => match(r)));
      const near = (x) => (x.d != null && x.d <= 5 ? 0 : 1), exact = (x) => (nm(x.r.name) === want ? 0 : 1);
      const hit = res.sort((a, b) => near(a) - near(b) || exact(a) - exact(b) || (a.d ?? 1e9) - (b.d ?? 1e9))[0];
      if (!hit) return { status: "not_found" };
      const p = hit.r.properties || {};
      const mi = hit.d != null ? Math.round(hit.d * 10) / 10 : null;
      if (mi != null && mi > 50) return { status: "elsewhere", qloo_name: hit.r.name, address: p.address || null };
      return { status: p.is_closed ? "closed" : mi != null && mi > 1.5 ? "far" : "found", qloo_id: hit.r.entity_id, qloo_name: hit.r.name, address: p.address || null, mi, hood: p.neighborhood || null };
    } catch (_) { return { status: "unchecked" }; }
  }));
}

// What changed between two plans after one card was marked "not for me" (or put back). Pure; names compared case-blind.
export function planDiff(before, after, cardName, restore = false, fromId = null) {
  const lcn = (x) => String(x || "").trim().toLowerCase();
  const oldS = Array.isArray(before?.stops) ? before.stops : [], newS = Array.isArray(after?.stops) ? after.stops : [];
  const oldN = new Set(oldS.map((s) => lcn(s.name))), newN = new Set(newS.map((s) => lcn(s.name)));
  const credited = (s) => (Array.isArray(s.sources) ? s.sources : []).some((x) => lcn(x.name) === lcn(cardName));
  const changes = [];
  for (let i = 0; i < Math.max(oldS.length, newS.length); i++) {
    const a = oldS[i], b = newS[i];
    if (a && b && lcn(a.name) === lcn(b.name)) continue;
    if (a && !newN.has(lcn(a.name))) changes.push({ stop: i + 1, was: a.name, now: b && !oldN.has(lcn(b.name)) ? b.name : null, credited: credited(a) });
    else if (b && !oldN.has(lcn(b.name))) changes.push({ stop: i + 1, was: null, now: b.name, credited: false });
  }
  const kept = newS.filter((s) => oldN.has(lcn(s.name))).map((s) => s.name);
  // stops that stayed but were credited to this card before: show who they are credited to now
  const srcNames = (s) => (Array.isArray(s.sources) ? s.sources : []).map((x) => x.name).filter(Boolean);
  const recredit = [];
  newS.forEach((b, i) => {
    const a = oldS.find((x) => lcn(x.name) === lcn(b.name));
    if (!a || !credited(a) && !restore) return;
    const was = srcNames(a), now = srcNames(b);
    if (was.join("|") !== now.join("|")) recredit.push({ stop: i + 1, name: b.name, was, now });
  });
  return { card: String(cardName || ""), restore: !!restore, from: fromId, changes, recredit, kept, same: changes.length === 0 && recredit.length === 0 && oldS.length === newS.length };
}


// ---- Stay-in plans: "a film tonight, from my notes" needs no neighbourhood, no budget, no hours.
// Intent comes from the free-text ask (EN + zh). The same function is mirrored in app.html (stayIntent) so the
// Go out / Stay in toggle can follow the ask live; tests/stayin.test.mjs checks the two agree.
export const STAY_KINDS = ["film", "tv", "music", "book", "podcast"];
export function stayIntent(text) {
  const s = String(text == null ? "" : text).toLowerCase();
  if (!s.trim()) return { mode: null, kinds: [] };
  const home = /\b(stay(ing)? in|at home|night in|home tonight|on the couch|on the sofa|cosy night|cozy night)\b|在家|宅家|宅着|不出门|不想出门|窝在|躺平/.test(s);
  const out = /cinema|movie theat|theatre|theater|bookstore|book store|bookshop|record (shop|store)|vinyl shop|caf[eé]|coffee|\bbar\b|pub|museum|galler|park|restaurant|bakery|jazz club|live music|concert|gig\b|go out|going out|walk around|stroll|neighbo(u)?rhood|电影院|影院|影城|书店|唱片店|咖啡|酒吧|博物馆|美术馆|画廊|公园|餐厅|饭店|livehouse|演唱会|音乐节|出门|外出|逛|散步|街区|去外面/.test(s);
  const k = [];
  const hit = (kind, re) => { const m = s.search(re); if (m >= 0) k.push([kind, m]); };
  hit("film", /\b(movies?|films?)\b|watch something|something to watch|电影|影片|片子|看部片|看个片/);
  hit("tv", /\b(series|tv show|tv|show to binge|binge|episodes?)\b|电视剧|美剧|日剧|韩剧|英剧|追剧|剧集|看剧|番剧|动画/);
  hit("music", /\b(listen|album|albums|playlist|songs?|music|record to put on)\b|听歌|听音乐|听专辑|听点|音乐|专辑|歌单|唱片/);
  hit("book", /\b(read|reading|books?|novel|novels)\b|看书|读书|读点|读本|小说|一本书|书单/);
  hit("podcast", /\bpodcasts?\b|播客|电台/);
  const kinds = [...new Set(k.sort((a, b) => a[1] - b[1]).map(([x]) => x))];
  const cook = /\b(cook|cooking|bake|baking)\b|做饭|下厨|煮饭|烤蛋糕/.test(s);
  if (home) return { mode: "in", kinds };
  if (out) return { mode: "out", kinds: [] };
  if (kinds.length || cook) return { mode: "in", kinds };
  return { mode: null, kinds: [] };
}

const MEDIA_URN = { film: "urn:entity:movie", tv: "urn:entity:tv_show", music: "urn:entity:artist", book: "urn:entity:book", podcast: "urn:entity:podcast" };
const CARD_DOMAIN = { film: ["film", "tv"], tv: ["tv", "film"], music: ["music"], book: ["book"], podcast: ["other", "music"] };
const TAG_OK = /genre:media|theme|plot|style|character|mood|subgenre/;
// The client's zh tag table (src/app/js/core.js TAG_ZH), mirrored so the server-side why line can speak zh
// without a model call. Unknown tags keep their catalogue name.
const ZH_TAGS = {"creative writing":"创意写作","artistic":"艺术感","fine baking":"精致烘焙","patio":"露台","bakery shopping":"逛面包店","bread":"面包","pastry":"点心","community events":"社区活动","live music":"现场音乐","vegan":"纯素","quiet":"安静","cozy atmosphere":"温馨","craft":"手作","rare books":"珍本","used books":"二手书","zines":"独立刊物","art":"艺术","books":"书","music":"音乐","film":"电影","tea":"茶","wine":"葡萄酒","cocktails":"鸡尾酒","brunch":"早午餐","dessert":"甜点","foreground framing":"前景构图","framing":"构图","melancholy":"忧郁","nostalgic":"怀旧","nostalgia":"怀旧","romance":"浪漫","romantic":"浪漫","cozy":"温馨","dreamy":"梦幻","atmospheric":"氛围感","minimalist":"极简","minimalism":"极简","urban":"都市","independent":"独立","indie":"独立","jazz":"爵士","classic":"经典","vintage":"复古","retro":"复古","drama":"剧情","documentary":"纪录片","coming of age":"成长","slow cinema":"慢电影","neon":"霓虹","night":"夜晚","city":"城市","loneliness":"孤独","love":"爱情","art house":"文艺片","arthouse":"文艺片","literary":"文学","poetry":"诗","folk":"民谣","ambient":"氛围乐","electronic":"电子","pop":"流行","rock":"摇滚","hip hop":"嘻哈","soul":"灵魂乐","coffee":"咖啡","bookstore":"书店","book store":"书店","vinyl":"黑胶","record store":"唱片店","cinema":"影院","museum":"博物馆","gallery":"画廊","cafe":"咖啡馆","bar":"酒吧","park":"公园"};
// Catalogue tags seen in the sample notebook but not in the client table; kept short so a zh why line reads naturally.
Object.assign(ZH_TAGS, {
  "adult": "成人向", "aesthetic minded": "讲究美感", "ambition": "野心", "art versus mundanity": "艺术与日常",
  "asia": "亚洲", "audiobook": "有声书", "biography": "传记", "biography memoir": "传记回忆录",
  "chillout": "弛放", "cinematic": "电影感", "classics": "经典", "composed": "从容",
  "confessional": "自白", "contemplative": "沉思", "contemporary": "当代", "crime": "犯罪",
  "dedicated": "专注", "devoted": "深情", "drama loving": "爱看剧情", "dream pop": "梦幻流行",
  "elegantly": "优雅", "emotionally engaged": "情感投入", "essays": "随笔", "event venue": "活动场地",
  "everyday minimalism": "日常极简", "fantasy": "奇幻", "fiction": "小说", "folk - rock": "民谣摇滚",
  "food": "美食", "forbidden desire": "禁忌之欲", "fragmentary": "碎片化", "friendship": "友情",
  "german literature": "德国文学", "germany": "德国", "grief": "悲伤", "hip - hop": "嘻哈",
  "hipster chic": "雅痞", "identity": "身份", "improvised feel": "即兴感", "indie - folk": "独立民谣",
  "indie pop": "独立流行", "indie rock": "独立摇滚", "intimate": "亲密", "introspective": "内省",
  "japanese": "日本", "japanese literature": "日本文学", "jazz hop": "爵士嘻哈", "literature": "文学",
  "live music venue": "现场音乐场地", "lounge": "酒廊", "lounge bar": "酒廊酒吧", "lyrical": "诗意",
  "mature": "成熟", "memoir": "回忆录", "memory": "记忆", "memory drama": "记忆剧情",
  "moody": "情绪化", "movie theater": "电影院", "muted": "低饱和", "naturalistic": "自然主义",
  "near future": "近未来", "novels": "小说", "observational": "观察式", "obsession": "执念",
  "passionate": "热烈", "photographic framing": "摄影构图", "quiet lyricism": "静谧诗意",
  "repetitive musical motifs": "重复乐句", "sci fi romance": "科幻爱情", "second chances": "第二次机会",
  "sensitive": "细腻", "singer & songwriter": "唱作人", "soft focus": "柔焦", "speculative fiction": "推想小说",
  "stylized": "风格化", "sunrise motifs": "日出意象", "temporal collage": "时间拼贴", "thoughtful": "深思",
  "tourist attraction": "景点", "traditional": "传统", "travel": "旅行", "trip - hop": "神游舞曲",
  "urban alienation": "都市疏离", "vulnerability": "脆弱",
});
export const zhTag = (t) => ZH_TAGS[lc(t)] || String(t || "");
export function slimMedia(e, kind) {
  if (!e || typeof e !== "object" || !e.entity_id || !e.name) return null;
  const p = e.properties || {};
  const sd = Array.isArray(p.short_descriptions) ? (p.short_descriptions.find((x) => x && Array.isArray(x.languages) && x.languages.includes("en")) || {}).value : null;
  const tags = [...new Set((Array.isArray(e.tags) ? e.tags : []).filter((t) => t && typeof t.name === "string" && TAG_OK.test(t.type || t.subtype || "")).map((t) => t.name))].slice(0, 4);
  const by = kind === "music" ? null : (Array.isArray(p.collaborators) && kind === "film" ? p.collaborators[0] : null) || (Array.isArray(p.authors) ? p.authors[0] : p.author) || null;
  const img = p.image?.url || e.image?.url || null;
  return {
    qloo_id: e.entity_id, name: String(e.name).slice(0, 160), kind, year: p.release_year || p.publication_year || p.year || null,
    by: by ? String(by).slice(0, 80) : null, image: typeof img === "string" && /^https:\/\//.test(img) ? img : null,
    description: String(sd || p.short_description || p.description || "").slice(0, 240), tags, popularity: typeof e.popularity === "number" ? +e.popularity.toFixed(3) : null,
    affinity: typeof e.query?.affinity === "number" ? +e.query.affinity.toFixed(3) : null,
    expl: Array.isArray(e.query?.explainability?.["signal.interests.entities"]) ? e.query.explainability["signal.interests.entities"].filter((x) => x && x.entity_id && typeof x.score === "number").map((x) => ({ id: x.entity_id, score: +x.score.toFixed(3) })) : null,
  };
}

/** Which kinds to recommend: what the ask names, else a mixed evening (film, music, book). Always 3 picks. */
export function stayKinds(kinds) {
  const k = (Array.isArray(kinds) ? kinds : []).filter((x) => STAY_KINDS.includes(x));
  const use = k.length ? k : ["film", "music", "book"];
  const out = [];
  for (let i = 0; out.length < 3; i++) out.push(use[i % use.length]);
  return out;
}

/** A stay-in plan: 3 picks of the asked kind from the taste catalogue, each tied to the cards behind it. */
export async function makeStayIn(env, user, req, log) {
  const T0 = Date.now();
  const lang = req.lang === "zh" ? "zh" : "en";
  const intent = stayIntent(req.text);
  const slots = stayKinds(intent.kinds);
  const { seeds, all, good } = await pickSeeds(env, user.id, req.mood, req.period);
  if (req.period === "now" || req.period === "then") log(lang === "zh"
    ? (req.period === "now" ? "只依据你最近的记录。" : "只依据你更早的记录。")
    : `Planning from ${req.period === "now" ? "your recent notes" : "your earlier notes"} only.`);
  if (seeds.length < 2) throw { state: "too_few", text: "I need a few more things you love to plan from. Mark a couple of cards with a heart, or start from one card." };
  const kinds = [...new Set(slots)];
  const kindNoun = { film: "a film", tv: "a series", music: "music", book: "a book", podcast: "a podcast" };
  const kindNounZh = { film: "一部电影", tv: "一部剧集", music: "一些音乐", book: "一本书", podcast: "一档播客" };
  log(lang === "zh"
    ? zhSpace(`在家：找${kinds.map((k) => kindNounZh[k]).join("、")}，不需要选街区。`)
    : `Staying in: looking for ${kinds.map((k) => kindNoun[k]).join(", ")}. No neighbourhood needed.`);
  const known = new Set(all.map((c) => String(c.qloo_id)));
  const seedsFor = (k) => {
    const dom = CARD_DOMAIN[k] || [];
    const rel = good.filter((c) => dom.includes(c.type)).slice(0, 3);
    const out = [...rel.map((c) => ({ ...c, band: (seeds.find((s) => s.qloo_id === c.qloo_id) || {}).band || "near" })), ...seeds].filter((s, i, arr) => arr.findIndex((x) => x.qloo_id === s.qloo_id) === i).slice(0, 5);
    return out.length >= 2 ? out : seeds;
  };
  let live = 0, cached = 0;
  const pools = await Promise.all(kinds.map(async (k) => {
    const sd = seedsFor(k);
    const params = { "filter.type": MEDIA_URN[k], "signal.interests.entities": sd.map((s) => s.qloo_id), "filter.popularity.min": MOOD_POP[req.mood], "feature.explainability": "true", take: 20 };
    if (req.audience && AUDIENCES[req.audience]) params["signal.demographics.audiences"] = AUDIENCES[req.audience][0];
    const key = "qm1:" + (await sha(JSON.stringify(params)));
    let items = await cacheGet(env, key, 6 * 3600000);
    if (items) cached++;
    else {
      try { live++; const d = await qloo(env, "/v2/insights", params); items = (d.results?.entities || []).map((e) => slimMedia(e, k)).filter(Boolean); await cachePut(env, key, items); }
      catch (e) { throw { state: "qloo_down", text: "Plans need the taste catalogue right now and it isn't answering. Your notes and cards are fine." }; }
    }
    const fresh = items.filter((x) => !known.has(String(x.qloo_id)) && !sd.some((s) => s.qloo_id === x.qloo_id));
    const seedNames = sd.slice(0, 3).map((s) => s.name);
    if (lang === "zh") log(zhSpace(`拿${seedNames.map((n) => "《" + n + "》").join("")}${sd.length > 3 ? "等" : ""}去问口味目录要${{ film: "电影", tv: "剧集", music: "音乐", book: "书", podcast: "播客" }[k]}：回来 ${items.length} 个，其中 ${items.length - fresh.length} 个你已经记过。`));
    else log(`Asked the catalogue for ${k} with ${seedNames.join(", ")}${sd.length > 3 ? "…" : ""}: ${items.length} came back, ${items.length - fresh.length} you already have cards for.`);
    return { kind: k, seeds: sd, items: fresh, returned: items.length };
  }));
  // familiar = Qloo's top matches; a little different = skip the very top; surprise = shuffle the first dozen.
  const order = (arr) => req.mood === "different" ? [...arr.slice(2), ...arr.slice(0, 2)] : req.mood === "surprise" ? arr.slice(0, 12).map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]).concat(arr.slice(12)) : arr;
  const byKind = Object.fromEntries(pools.map((p) => [p.kind, order(p.items)]));
  const picks = [], taken = new Set();
  for (const k of slots) {
    const next = (byKind[k] || []).find((x) => !taken.has(x.qloo_id) && !taken.has(lc(x.name)));
    if (!next) continue;
    taken.add(next.qloo_id); taken.add(lc(next.name));
    picks.push({ ...next, seeds_used: (pools.find((p) => p.kind === k) || {}).seeds || [] });
  }
  if (!picks.length) throw { state: "weak", text: "Nothing new came back for that this time. Try a different mood, or ask for another kind of thing." };
  const allSeeds = [...seeds, ...pools.flatMap((p) => p.seeds)].filter((s, i, arr) => arr.findIndex((x) => x.qloo_id === s.qloo_id) === i);
  const dressed = await dressPicks(env, user, allSeeds, picks, lang);
  if (lang === "zh") await zhReads(env, dressed, 2500); // cap the wait so a cold translator can't stall the plan; the English read stays as fallback
  if (lang === "zh") await zhOverviews(env, dressed, 2500);
  log(lang === "zh" ? zhSpace(`选了 ${dressed.length} 个：${dressed.map((p) => "《" + p.name + "》").join("")}。`) : `Picked ${dressed.length}: ${dressed.map((p) => p.name).join(", ")}.`);
  const when = req.when || user.whenx || "Saturday afternoon";
  const moodWord = { familiar: "familiar", different: "a little different", surprise: "surprise me" }[req.mood] || "familiar";
  const left_out = ((await env.DB.prepare("SELECT name FROM cards WHERE user_id=? AND heart=-1 ORDER BY name LIMIT 5").bind(user.id).all().catch(() => null))?.results || []).map((r) => r.name);
  return {
    id: uid(), mode: "in", kinds, left_out, period: req.period || "all",
    header: `${when} · Stay in · ${moodWord}`, stops: [], picks: dressed,
    seeds: allSeeds.map((s) => ({ qloo_id: s.qloo_id, name: s.name })),
    meta: { when, mode: "in", mood: req.mood || "familiar", period: req.period || "all", lang, audience: AUDIENCES[req.audience] ? req.audience : null },
    pool: pools.map((p) => ({ kind: p.kind, items: p.items.slice(0, 8) })),
    receipt: {
      seeds: allSeeds.map((s) => ({ name: s.name, qloo_id: s.qloo_id })),
      queries: pools.map((p) => ({ endpoint: "/v2/insights", "filter.type": MEDIA_URN[p.kind], "signal.interests.entities": p.seeds.map((s) => s.name), "feature.explainability": true, returned: p.returned })),
      checks: { exclude: "anything you already have a card for", where_to_watch: "not shown: not in the catalogue" },
      sent_to_qloo: "Card IDs only. No note text, no location.",
      provenance: { live, cached, label: cached && !live ? "cached" : cached ? "live + cached" : "live", note: "Titles, years, posters and reasons come from Qloo; the why-line is assembled from your cards." },
    },
    timing: { total_ms: Date.now() - T0, qloo_calls: live, cache_hits: cached },
  };
}

/** Evidence for each pick: Qloo's per-card contribution joined to the user's cards and quotes; no repeats when avoidable. */
export async function dressPicks(env, user, seeds, picks, lang) {
  const ids = seeds.map((s) => s.qloo_id);
  const fps = ids.length ? (await env.DB.prepare(`SELECT c.id card_id, c.qloo_id, c.image, c.name, c.type, COUNT(f.id) n, (SELECT f2.quote FROM footprints f2 WHERE f2.card_id=c.id AND f2.quote IS NOT NULL AND LENGTH(f2.quote)>8 ORDER BY f2.created_at DESC LIMIT 1) quote, (SELECT f2.created_at FROM footprints f2 WHERE f2.card_id=c.id AND f2.quote IS NOT NULL AND LENGTH(f2.quote)>8 ORDER BY f2.created_at DESC LIMIT 1) quote_at FROM cards c LEFT JOIN footprints f ON f.card_id=c.id WHERE c.user_id=? AND c.qloo_id IN (${ids.map(() => "?").join(",")}) GROUP BY c.id ORDER BY n DESC`).bind(user.id, ...ids).all()).results || [] : [];
  const byQ = new Map(fps.map((r) => [String(r.qloo_id).toLowerCase(), r]));
  const seedByQ = new Map(seeds.map((x) => [String(x.qloo_id).toLowerCase(), x]));
  const row = (r, sd, score) => ({ card_id: r?.card_id || null, qloo_id: r?.qloo_id || sd?.qloo_id, name: r?.name || sd?.name, type: r?.type || sd?.type || null, image: r?.image || null, n: r?.n || 0, quote: r?.quote ? String(r.quote).slice(0, 140) : null, at: r?.quote_at || null, score: score ?? null, band: sd?.band || "near" });
  const used = new Set();
  return picks.map((p) => {
    let cf = Array.isArray(p.expl) ? p.expl.map((x) => { const k = String(x.id).toLowerCase(); const r = byQ.get(k), sd = seedByQ.get(k); return r || sd ? row(r, sd, x.score) : null; }).filter(Boolean).sort((a, b) => b.score - a.score) : [];
    const attribution = cf.length > 0;
    if (!cf.length) {
      const dom = CARD_DOMAIN[p.kind] || [];
      const sd = (p.seeds_used || []).map((s) => row(byQ.get(String(s.qloo_id).toLowerCase()), s, null));
      cf = [...sd.filter((r) => dom.includes(r.type)), ...sd.filter((r) => !dom.includes(r.type))];
    }
    const reordered = [...cf.filter((r) => !used.has(r.card_id || r.qloo_id)), ...cf.filter((r) => used.has(r.card_id || r.qloo_id))];
    const dom = CARD_DOMAIN[p.kind] || [];
    const ord = [...reordered.filter((r) => dom.includes(r.type)), ...reordered.filter((r) => !dom.includes(r.type))].slice(0, 2);
    ord.forEach((r) => used.add(r.card_id || r.qloo_id));
    const names = ord.map((r) => r.name).filter(Boolean);
    const zhNames = ord.filter((r) => r.name).map(zhTitle).filter(Boolean);
    const why = names.length
      ? zhSpace((lang === "zh" ? `因为你记过${zhNames.join("和")}` : `Because you kept ${names.join(" and ")}`) + (p.tags.length ? (lang === "zh" ? `；口味目录把它归在${ZH_CATALOGUE_GAP}${p.tags.slice(0, 2).map(zhTag).join("、")}。` : `; the catalogue files it under ${p.tags.slice(0, 2).join(", ").toLowerCase()}.`) : (lang === "zh" ? "。" : ".")))
      : (lang === "zh" ? "口味目录根据你的卡片整体给出。" : "The catalogue returned it for your cards taken together.");
    return {
      qloo_id: p.qloo_id, name: p.name, kind: p.kind, year: p.year, by: p.by, image: p.image, description: p.description, tags: p.tags,
      overview: p.overview || p.description || "",
      read: p.description || "", why_line: why, sources: ord,
      why: { attribution, contributions: cf.length ? cf : null, affinity: p.affinity, popularity: p.popularity, vibes: p.tags, qloo_id: p.qloo_id, type: MEDIA_URN[p.kind], seeds_sent: (p.seeds_used || []).length },
    };
  });
}
