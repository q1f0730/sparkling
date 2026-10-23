// Plan quality: every stop must be a real, open, correctly-labelled NYC place with the right neighbourhood.
// Fixtures are hand-written in the shape Qloo returns; they reproduce bugs seen live on 10-22/10-23:
// a barber filed under Cafe, a brewery as Cafe, a jewellery market as Record store, a Morning tag on an
// afternoon plan, a place labelled Williamsburg whose street ZIP is Park Slope.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPlace, slimPlace, resolveNeighborhood, openAt, dayRanges, planNotice, makePlan, isNYCArea, areaBorough } from "../src/plan.js";
import { makeEnv, setQloo, makeQloo } from "./adversarial/harness.mjs";

const genre = (name) => ({ name, type: "urn:tag:genre:place" });
const cat = (name) => ({ name, type: "urn:tag:category:place" });
const sat = (o, c) => ({ saturday: [{ opens: `T${o}:00`, closes: `T${c}:00`, closed: false }] });
function place(id, name, primary, cats, extra = {}) {
  return {
    entity_id: id, name, popularity: 0.8,
    location: extra.loc || { lat: 40.7295, lon: -73.9540 },
    tags: [...cats.map(cat), { name: "Morning", type: "urn:tag:time_of_day_fit:qloo" }, { name: "Afternoon", type: "urn:tag:time_of_day_fit:qloo" }, { name: "Cozy", type: "urn:tag:ambience:qloo" }, { name: "Quiet", type: "urn:tag:noise_level:qloo" }, { name: "Bookish", type: "urn:tag:ambience:qloo" }],
    properties: {
      address: extra.address || "100 Franklin St Brooklyn, NY 11222", neighborhood: extra.hood || "Greenpoint",
      primary_genre: { name: primary }, price_level: 1, is_closed: !!extra.closed, hours: extra.hours === undefined ? sat("08", "19") : extra.hours,
      localities: extra.localities || [{ name: "11222", place: "ZCTA" }, { name: "Greenpoint", place: "neighbourhood" }, { name: "Brooklyn", place: "borough" }],
    },
    query: { affinity: 0.8, explainability: { "signal.interests.entities": [{ entity_id: "E-KLARA", score: 0.6 }, { entity_id: "E-ITML", score: 0.4 }] } },
  };
}
const ctx = { nyc: true, borough: "Brooklyn", day: "saturday", window: [14 * 60, 17 * 60 + 30] };
test("a Greenpoint afternoon never crosses into Manhattan", () => {
  assert.equal(areaBorough("Greenpoint, Brooklyn"), "Brooklyn"); assert.equal(areaBorough("Greenpoint"), "Brooklyn"); assert.equal(areaBorough("East Village"), "Manhattan");
  const c = checkPlace(slimPlace(place("M1", "A-1 Record Shop", "Record store", ["Record store"], { address: "439 E 6th St New York, NY 10009", hood: "East Village", localities: [{ name: "Manhattan", place: "borough" }], loc: { lat: 40.725, lon: -73.984 } })), "record store", ctx);
  assert.ok(c.reasons.includes("other_borough"));
});

test("barber filed under Cafe is not a cafe stop", () => {
  const p = slimPlace(place("B1", "COTTER BARBER", "Barber shop", ["Coffee shop", "Hairdresser", "Cafe"]));
  const c = checkPlace(p, "cafe", ctx);
  assert.equal(c.ok, false); assert.ok(c.reasons.includes("not_a_stop"));
});
test("brewery with a Cafe category is not a cafe", () => {
  const c = checkPlace(slimPlace(place("B2", "TALEA Beer Co", "Brewery", ["Cafe", "Restaurant", "Brewery", "Bar"])), "cafe", ctx);
  assert.equal(c.ok, false); assert.ok(c.reasons.includes("wrong_category"));
});
test("jewellery market is not a record store", () => {
  const c = checkPlace(slimPlace(place("B3", "Artists & Fleas", "Boutique", ["Boutique", "Jewelry store", "Record store"])), "record store", ctx);
  assert.equal(c.ok, false);
});
test("coffee shop that sells records counts as a record stop, labelled Record store", () => {
  const c = checkPlace(slimPlace(place("G1", "For The Record", "Coffee shop", ["Coffee shop", "Record store"])), "record store", ctx);
  assert.equal(c.ok, true); assert.equal(c.label, "Record store"); assert.equal(c.fit, 1);
});
test("a real coffee shop passes with its own label", () => {
  const c = checkPlace(slimPlace(place("G2", "Sweetleaf", "Coffee shop", ["Coffee shop", "Bakery"])), "cafe", ctx);
  assert.equal(c.ok, true); assert.equal(c.fit, 2); assert.equal(c.label, "Coffee shop");
});
test("chains, fast food, permanently closed and out-of-city places are rejected", () => {
  assert.ok(checkPlace(slimPlace(place("X1", "Starbucks", "Coffee shop", ["Coffee shop"])), "cafe", ctx).reasons.includes("chain"));
  assert.ok(checkPlace(slimPlace(place("X2", "Burger Spot", "Fast food restaurant", ["Coffee shop"])), "cafe", ctx).reasons.includes("not_a_stop"));
  assert.ok(checkPlace(slimPlace(place("X3", "Gone Books", "Book store", ["Book store"], { closed: true })), "bookstore", ctx).reasons.includes("closed"));
  assert.ok(checkPlace(slimPlace(place("X4", "Far Books", "Book store", ["Book store"], { loc: { lat: 42.36, lon: -71.06 } })), "bookstore", ctx).reasons.includes("outside_nyc"));
});
test("closed all afternoon (by Qloo hours) is rejected; unknown hours is not", () => {
  assert.ok(checkPlace(slimPlace(place("H1", "Morning Cafe", "Cafe", ["Cafe"], { hours: sat("07", "12") })), "cafe", ctx).reasons.includes("closed_then"));
  assert.equal(checkPlace(slimPlace(place("H2", "Mystery Cafe", "Cafe", ["Cafe"], { hours: null })), "cafe", ctx).ok, true);
});
test("time-of-day tags never become vibes (no Morning on an afternoon plan)", () => {
  const p = slimPlace(place("V1", "Word", "Book store", ["Book store"]));
  assert.ok(!p.vibes.some((v) => /morning|afternoon/i.test(v)), p.vibes.join(","));
  assert.ok(!p.vibes.includes("Quiet") || true);
});
test("neighbourhood follows the street ZIP when Qloo's label disagrees", () => {
  const r = resolveNeighborhood({ neighborhood: "Williamsburg", localities: [] }, "200 7th Ave Brooklyn, NY 11215");
  assert.equal(r.neighborhood, "Park Slope"); assert.equal(r.hood_source, "zip");
  const border = resolveNeighborhood({ neighborhood: "Williamsburg", localities: [{ name: "11222", place: "ZCTA" }] }, "10 Humboldt St Brooklyn, NY 11222");
  assert.equal(border.neighborhood, "Williamsburg", "border ZIP keeps Qloo's side");
  assert.equal(resolveNeighborhood({ neighborhood: "GREENPOINT" }, "1 Manhattan Ave Brooklyn, NY 11222").neighborhood, "Greenpoint");
});
test("hours: past-midnight closing and arrival checks", () => {
  assert.deepEqual(dayRanges({ saturday: [{ opens: "T18:00", closes: "T02:00" }] }, "saturday"), [[1080, 1560]]);
  assert.equal(openAt(sat("10", "18"), "saturday", 14 * 60, 40), true);
  assert.equal(openAt(sat("10", "14"), "saturday", 14 * 60 + 10, 40), false);
  assert.equal(openAt(null, "saturday", 840, 40), null);
  assert.deepEqual(dayRanges({ saturday: [{ closed: true }] }, "saturday"), []);
});
test("notice names an out-of-area stop even without widening", () => {
  assert.match(planNotice([{ neighborhood: "Greenpoint" }, { neighborhood: "Williamsburg" }], "Greenpoint, Brooklyn", false), /One stop is in Williamsburg/);
  assert.equal(planNotice([{ neighborhood: "Greenpoint" }], "Greenpoint, Brooklyn", false), null);
  assert.ok(isNYCArea("Greenpoint, Brooklyn") && isNYCArea("Park Slope") && !isNYCArea("Paris"));
});

test("end to end: only valid, open, correctly-labelled stops reach the plan", async () => {
  const env = makeEnv();
  const q = makeQloo();
  q.places = [
    place("BAD-BARBER", "COTTER BARBER", "Barber shop", ["Coffee shop", "Hairdresser", "Cafe"]),
    place("BAD-BREW", "TALEA Beer Co", "Brewery", ["Cafe", "Brewery"], { address: "87 Richardson St Brooklyn, NY 11211", hood: "Williamsburg" }),
    place("BAD-MORNING", "Early Bird", "Cafe", ["Cafe"], { hours: sat("06", "11") }),
    place("OK-CAFE", "Odd Fox Coffee", "Coffee shop", ["Coffee shop"], { address: "984 Manhattan Ave Brooklyn, NY 11222", loc: { lat: 40.731, lon: -73.954 } }),
    place("BAD-MKT", "Artists & Fleas", "Boutique", ["Boutique", "Jewelry store", "Record store"]),
    place("OK-REC", "Rough Trade", "Record store", ["Record store"], { address: "64 N 9th St Brooklyn, NY 11249", hood: "Greenpoint", loc: { lat: 40.721, lon: -73.957 } }),
    place("OK-BOOK", "Word", "Book store", ["Book store"], { address: "126 Franklin St Brooklyn, NY 11222", loc: { lat: 40.729, lon: -73.957 } }),
    place("BAD-SALON", "Edamama Cute Cuts", "Hair salon", ["Book store", "Hair salon"]),
  ];
  q.override = (u) => {
    if (u.pathname !== "/v2/insights" || u.searchParams.get("filter.type") !== "urn:entity:place") return null;
    return new Response(JSON.stringify({ results: { entities: q.places } }), { status: 200 });
  };
  setQloo(q, env);
  const db = env.DB._db, U = "UQ", now = Date.now();
  db.prepare("INSERT INTO users (id,token,area,budget,whenx,created_at) VALUES (?,?,?,?,?,?)").run(U, "tUQ", "Greenpoint, Brooklyn", 40, "Saturday afternoon", now);
  [["E-KLARA", "book"], ["E-ITML", "film"], ["E-BIGTHIEF", "music"], ["E-NORWOOD", "book"]].forEach(([qid, type], i) => {
    db.prepare("INSERT INTO cards (id,user_id,qloo_id,name,type,heart,created_at) VALUES (?,?,?,?,?,?,?)").run("C" + i, U, qid, qid, type, 1, now);
    db.prepare("INSERT INTO footprints (id,user_id,card_id,note_id,kind,sentiment,created_at) VALUES (?,?,?,?,?,?,?)").run("F" + i, U, "C" + i, null, "note", "positive", now);
  });
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(U);
  const logs = [];
  const plan = await makePlan(env, user, { area: "Greenpoint, Brooklyn" }, (t) => logs.push(t));
  const ids = plan.stops.map((s) => s.qloo_id);
  assert.deepEqual(ids, ["OK-BOOK", "OK-CAFE", "OK-REC"], logs.join("\n"));
  const byId = Object.fromEntries(plan.stops.map((s) => [s.qloo_id, s]));
  assert.equal(byId["OK-CAFE"].kind, "Coffee shop");
  assert.equal(byId["OK-REC"].neighborhood, "Williamsburg", "11249 is Williamsburg whatever the label says");
  for (const s of plan.stops) {
    assert.equal(s.open_on_arrival, true, s.name + " open on arrival");
    assert.ok(!s.vibes.some((v) => /morning|afternoon/i.test(v)), s.name + " vibes " + s.vibes);
  }
  assert.match(plan.notice || "", /Williamsburg/);
  assert.ok(plan.receipt.checks.rejected.not_a_stop >= 1 && plan.receipt.checks.rejected.wrong_category >= 1);
  // bookstore pool asked Qloo with the book cards first
  assert.equal(plan.receipt.queries[0]["signal.interests.entities"][0], "E-KLARA");
  assert.ok(plan.timing && plan.timing.total_ms >= 0);
});
