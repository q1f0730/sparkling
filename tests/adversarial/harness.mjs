// Local harness: real SQLite behind a D1-shaped API, a programmable Workers AI mock and a programmable
// Qloo mock installed on globalThis.fetch. Lets the real Worker code run end to end with zero live calls.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const SCHEMA = readFileSync(new URL("../../schema.sql", import.meta.url), "utf8");

// D1 rejects undefined / objects / arrays as bind values; mirror that so type-confusion bugs surface.
function d1Val(v) {
  if (v === undefined) throw new Error("D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'");
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v !== null && typeof v === "object") throw new Error("D1_TYPE_ERROR: Type 'object' not supported for value '" + String(v).slice(0, 40) + "'");
  if (typeof v === "number" && !Number.isFinite(v)) return null;
  return v;
}
export function makeDB() {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  const stmt = (sql, args = []) => ({
    sql, args,
    bind: (...a) => stmt(sql, a.map(d1Val)),
    first: async (col) => { const r = db.prepare(sql).get(...args); if (!r) return null; const o = { ...r }; return col ? o[col] : o; },
    all: async () => ({ results: db.prepare(sql).all(...args).map((r) => ({ ...r })), success: true, meta: {} }),
    run: async () => { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
    _run: () => db.prepare(sql).run(...args),
  });
  return {
    _db: db,
    prepare: (sql) => stmt(sql),
    batch: async (stmts) => {
      db.exec("BEGIN");
      try { const out = stmts.map((s) => { const r = s._run(); return { success: true, meta: { changes: Number(r.changes) } }; }); db.exec("COMMIT"); return out; }
      catch (e) { db.exec("ROLLBACK"); throw e; }
    },
    q: (sql, ...a) => db.prepare(sql).all(...a).map((r) => ({ ...r })),
  };
}

// ---------- Qloo catalogue (fictional where it matters; ids are made up) ----------
export const CATALOG = [
  { entity_id: "E-ITML", name: "In the Mood for Love", types: ["urn:entity:movie"], popularity: 0.9, properties: { release_year: 2000 } },
  { entity_id: "E-SOLARIS-72", name: "Solaris", types: ["urn:entity:movie"], popularity: 0.8, properties: { release_year: 1972 } },
  { entity_id: "E-SOLARIS-02", name: "Solaris", types: ["urn:entity:movie"], popularity: 0.7, properties: { release_year: 2002 } },
  { entity_id: "E-PATERSON", name: "Paterson", types: ["urn:entity:movie"], popularity: 0.7, properties: { release_year: 2016 } },
  { entity_id: "E-HER", name: "Her", types: ["urn:entity:movie"], popularity: 0.9, properties: { release_year: 2013 } },
  { entity_id: "E-BIGTHIEF", name: "Big Thief", types: ["urn:entity:artist"], popularity: 0.8, properties: {} },
  { entity_id: "E-KLARA", name: "Klara and the Sun", types: ["urn:entity:book"], popularity: 0.8, properties: { publication_year: 2021, author: "K. Ishiguro" } },
  { entity_id: "E-NORWOOD", name: "Norwegian Wood", types: ["urn:entity:book"], popularity: 0.8, properties: { publication_year: 1987 } },
  { entity_id: "E-SPIRITED", name: "千と千尋の神隠し", types: ["urn:entity:movie"], popularity: 0.9, properties: { release_year: 2001 } },
  { entity_id: "E-HUOZHE", name: "活着", types: ["urn:entity:book"], popularity: 0.7, properties: {} },
  { entity_id: "E-XSS", name: "<img src=x onerror=window.__xss=1>", types: ["urn:entity:movie"], popularity: 0.6, properties: {} },
];
export const PLACES = [
  // area "Testville": bookstores, cafes, record stores with prices, hours, coords
  ...[1, 2, 3, 4, 5].map((i) => ({ entity_id: `P-BOOK-${i}`, name: `Book Nook ${i}`, popularity: 0.9 - i * 0.05, location: { lat: 40.72 + i * 0.001, lon: -73.95 }, tags: [{ name: "Bookstore", type: "urn:tag:category:place" }, { name: "Cozy", type: "urn:tag:genre:place:vibe" }], properties: { address: `${i} Page St`, neighborhood: i % 2 ? "Greenpoint" : "Williamsburg", price_level: (i % 4) + 1, hours: { saturday: [{ opens: "T10:00", closes: "T18:00" }], monday: [{ closed: true }] } } })),
  ...[1, 2, 3, 4, 5].map((i) => ({ entity_id: `P-CAFE-${i}`, name: `Cafe ${i}`, popularity: 0.8 - i * 0.05, location: { lat: 40.721 + i * 0.001, lon: -73.951 }, tags: [{ name: "Coffee Shop", type: "urn:tag:category:place" }], properties: { address: `${i} Bean Ave`, neighborhood: "Greenpoint", price_level: i % 3 + 1, hours: { saturday: [{ opens: "T08:00", closes: "T16:00" }] } } })),
  ...[1, 2, 3].map((i) => ({ entity_id: `P-REC-${i}`, name: `Records ${i}`, popularity: 0.7, location: { lat: 40.722, lon: -73.952 + i * 0.001 }, tags: [{ name: "Record Store", type: "urn:tag:category:place" }], properties: { address: `${i} Vinyl Rd`, neighborhood: "Greenpoint", price_level: 2 } })),
  // category leak: a bar returned for every query
  { entity_id: "P-LEAK-BAR", name: "Leaky Bar", popularity: 0.95, location: { lat: 40.72, lon: -73.95 }, tags: [{ name: "Bar", type: "urn:tag:category:place" }], properties: { neighborhood: "Greenpoint", price_level: 2 } },
];
export const TAGS = [
  { id: "urn:tag:category:place:bookstore", name: "Bookstore", type: "urn:tag:category:place" },
  { id: "urn:tag:category:place:coffee_shop", name: "Coffee Shop", type: "urn:tag:category:place" },
  { id: "urn:tag:category:place:record_store", name: "Record Store", type: "urn:tag:category:place" },
];

const json = (o, status = 200) => new Response(typeof o === "string" ? o : JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

// Programmable Qloo: mode decides behaviour per call. calls[] records every URL.
export function makeQloo() {
  const Q = {
    calls: [], mode: "ok", places: PLACES, catalog: CATALOG, override: null,
    handle(url, init) {
      const u = new URL(url);
      Q.calls.push(u.pathname + u.search);
      if (Q.override) { const r = Q.override(u, init, Q.calls.length); if (r) return r; }
      switch (Q.mode) {
        case "timeout": return new Promise((_, rej) => { const s = init?.signal; if (s) { if (s.aborted) rej(s.reason || new Error("aborted")); s.addEventListener("abort", () => rej(s.reason || new Error("aborted"))); } });
        case "throw": return Promise.reject(new TypeError("fetch failed"));
        case "429": return json({ error: "rate limited" }, 429);
        case "500": return json({ error: "boom" }, 500);
        case "503": return new Response("<html>Service Unavailable</html>", { status: 503 });
        case "401": return json({ error: "bad key" }, 401);
        case "html": return new Response("<html>not json</html>", { status: 200 });
        case "empty": return json({ success: true, results: u.pathname === "/search" || u.pathname === "/entities" ? [] : { entities: [], tags: [] } });
        case "nullres": return json({ success: true, results: null });
        case "truncated": return new Response('{"results":[{"entity_id":"X', { status: 200 });
      }
      const p = u.searchParams;
      if (u.pathname === "/search") {
        const q = (p.get("query") || "").toLowerCase(), types = (p.get("types") || "").split(",").filter(Boolean);
        let res = Q.catalog.filter((e) => e.name.toLowerCase().includes(q) || (q && q.includes(e.name.toLowerCase())));
        if (types.length) res = res.filter((e) => e.types.some((t) => types.includes(t)));
        if (Q.mode === "dupes") res = [...res, ...res];
        return json({ results: res.slice(0, +p.get("take") || 5) });
      }
      if (u.pathname === "/entities") {
        const ids = (p.get("entity_ids") || "").split(",");
        return json({ results: [...Q.catalog, ...Q.places].filter((e) => ids.includes(e.entity_id)).map((e) => ({ ...e, tags: e.tags || [{ name: "Melancholy", type: "urn:tag:theme:qloo" }] })) });
      }
      if (u.pathname === "/v2/tags") return json({ results: { tags: TAGS.filter((t) => t.name.toLowerCase().includes((p.get("filter.query") || "").toLowerCase().split(" ")[0].replace(/s$/, "")) || (p.get("filter.query") === "cafe" && /coffee/i.test(t.name))) } });
      if (u.pathname === "/v2/insights/compare") return json({ results: { tags: [{ tag_id: "T1", name: "Melancholy", subtype: "urn:tag:theme:qloo", query: { score: 0.5 } }], a: [{ tag_id: "T2", name: "Neon" }], b: [] } });
      if (u.pathname === "/v2/insights") {
        if (p.get("filter.type") === "urn:tag") return json({ results: { tags: [{ tag_id: "T1", name: "Melancholy", subtype: "urn:tag:theme:qloo", query: { affinity: 0.9 } }, { tag_id: "T2", name: "Neon", subtype: "urn:tag:style:qloo", query: { affinity: 0.7 } }] } });
        const tag = p.get("filter.tags") || "";
        let ents = Q.places.filter((e) => !tag || e.entity_id === "P-LEAK-BAR" || e.tags.some((t) => tag.endsWith(t.name.toLowerCase().replace(/ /g, "_"))));
        if (Q.mode === "dupes") ents = [...ents, ...ents];
        return json({ results: { entities: ents.slice(0, +p.get("take") || 15) } });
      }
      return json({ error: "unknown path" }, 404);
    },
  };
  return Q;
}

// Programmable Workers AI. extract(text) -> {mentions:[...]} ; throws when Q.down.
export function makeAI() {
  const A = {
    calls: 0, down: false, extract: null, raw: null,
    async run(model, input) {
      A.calls++;
      if (A.down) throw new Error("AI quota exceeded");
      const sys = input.messages?.[0]?.content || "";
      const user = typeof input.messages?.[1]?.content === "string" ? input.messages[1].content : "";
      if (A.raw) return { response: A.raw(sys, user, model) };
      if (/cultural things/.test(sys)) {
        const text = (user.match(/^Note: """([\s\S]*)"""$/) || [, user])[1];
        if (A.extract) return { response: A.extract(text) };
        const mentions = [];
        for (const e of CATALOG) if (text.includes(e.name)) mentions.push({ surface: e.name, title: e.name, type: e.types[0].includes("movie") ? "film" : e.types[0].includes("artist") ? "music" : "book", kind: "note", sentiment: "positive", music_work: "none" });
        return { response: { mentions } };
      }
      if (/venue category words/.test(sys)) return { response: { stops: ["bookstore", "cafe"] } };
      if (/For each venue/.test(sys)) return { response: { reads: ["A quiet room for an afternoon."] } };
      if (/Transcribe/.test(sys)) return { response: "NONE" };
      return { response: {} };
    },
  };
  return A;
}

// One shared fetch dispatcher: tests swap the active Qloo with setQloo().
// Routing: an env can own a Qloo (env.__q, keyed by its unique API key); otherwise the last setQloo() wins.
let ACTIVE_Q = makeQloo();
const BY_KEY = new Map();
export const setQloo = (q, env) => { if (env) { BY_KEY.set(env.QLOO_API_KEY, q); env.__q = q; } else ACTIVE_Q = q; return q; };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const s = String(url);
  if (s.startsWith("https://hackathon.api.qloo.com")) {
    const k = init?.headers?.["X-Api-Key"] || (init?.headers?.get && init.headers.get("X-Api-Key"));
    return (BY_KEY.get(k) || ACTIVE_Q).handle(s, init);
  }
  if (process.env.ALLOW_NET) return realFetch(url, init);
  throw new Error("network disabled in tests: " + s);
};

export function makeEnv(extra = {}) {
  const env = { DB: makeDB(), AI: makeAI(), QLOO_API_KEY: "test-key-" + Math.random().toString(36).slice(2), QLOO_TIMEOUT_MS: "300", ...extra };
  const kv = new Map();
  env.MEDIA_KV = {
    put: async (k, v, o) => kv.set(k, { v, m: o?.metadata }),
    getWithMetadata: async (k) => (kv.has(k) ? { value: kv.get(k).v, metadata: kv.get(k).m } : { value: null }),
    delete: async (k) => kv.delete(k), _map: kv,
  };
  return env;
}

export function makeCtx() {
  const pending = [];
  return {
    waitUntil: (p) => pending.push(Promise.resolve(p).catch((e) => { (pending.errors ||= []).push(e); })),
    async drain() { while (pending.length) { const b = pending.splice(0); await Promise.all(b); } },
    pending,
  };
}

// Call the Worker like a browser would. Returns {status, headers, text, json}.
export async function call(worker, env, method, path, { body, headers = {}, cookie, raw } = {}) {
  const h = new Headers(headers);
  if (cookie) h.set("cookie", "sp=" + cookie);
  let b = body;
  if (body !== undefined && !raw && typeof body !== "string" && !(body instanceof FormData)) { b = JSON.stringify(body); if (!h.has("content-type")) h.set("content-type", "application/json"); }
  const init = { method, headers: h };
  if (b !== undefined && method !== "GET" && method !== "HEAD") init.body = b;
  const req = new Request("https://sparkling.test" + path, init);
  const ctx = makeCtx();
  const res = await worker.fetch(req, env, ctx);
  const [text] = await Promise.all([res.text(), ctx.drain()]);
  let j = null; try { j = JSON.parse(text); } catch (_) {}
  return { status: res.status, headers: res.headers, text, json: j, ctx };
}

export async function newSession(worker, env, mode) {
  const r = await call(worker, env, "POST", "/api/session", { body: mode ? { mode } : {} });
  const m = (r.headers.get("set-cookie") || "").match(/sp=([^;]+)/);
  return { token: m && m[1], user: r.json?.user };
}
