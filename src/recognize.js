// Recognition: a saved note -> mentions -> Qloo entities -> cards + footprints, or the inbox.
// The note is always saved first; nothing here can lose it.
import { getEntities, slimEntity } from "./qloo.js";
import { llmJSON } from "./llm.js";

const BASE = "https://hackathon.api.qloo.com";
export const TYPE_URNS = {
  film: ["urn:entity:movie"],
  tv: ["urn:entity:tv_show"],
  music: ["urn:entity:artist"],
  book: ["urn:entity:book"],
  place: ["urn:entity:place"],
  person: ["urn:entity:person"],
  other: ["urn:entity:podcast", "urn:entity:brand", "urn:entity:destination"],
};
const URN_TYPE = {
  "urn:entity:movie": "film", "urn:entity:tv_show": "tv", "urn:entity:artist": "music",
  "urn:entity:book": "book", "urn:entity:place": "place", "urn:entity:podcast": "other",
  "urn:entity:brand": "other", "urn:entity:destination": "other", "urn:entity:video_game": "other", "urn:entity:person": "person",
};
// Cards only know the six UI types; a director or author saved as a person shows as "other".
const cardType = (t) => (t === "person" ? "other" : t);
export const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);
export const norm = (s) => (s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    mentions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          surface: { type: "string" },
          title: { type: "string" },
          type: { type: "string", enum: ["film", "tv", "music", "book", "place", "person", "other"] },
          creator: { type: "string" },
          music_work: { type: "string", enum: ["artist", "song", "album", "none"] },
          kind: { type: "string", enum: ["note", "rewatch", "first_watch", "listen", "read", "visit", "quote", "screenshot", "link"] },
          sentiment: { type: "string", enum: ["positive", "negative", "mixed", "neutral"] },
        },
        required: ["surface", "title", "type", "kind", "sentiment"],
      },
    },
  },
  required: ["mentions"],
};

const SYSTEM = `You read one short personal note and list the specific, named cultural things it mentions: films, TV shows, musicians or bands (songs and albums count as their artist; put the artist in "title" when you know it, else the song/album title), books, and named real venues (bookshops, cafes, cinemas, bars, museums).
Rules:
- "surface" must be copied EXACTLY, character for character, from the note (the words the user wrote).
- For music: music_work is "artist" when the surface names the musician/band, "song" or "album" when it names a song or album; then put the performing artist in "creator" if you are confident, else leave creator empty. Use "none" for non-music.
- "title" is the canonical title you think it refers to, in its English / international release form even when the note is in Chinese or another language (王家卫 -> "Wong Kar-wai", 花样年华 -> "In the Mood for Love", 正常人 -> "Normal People"); for a song/album: the song/album title. Never invent things that are not named. Generic words ("a movie", "the counter place", "lunch", "the radio", "the G train") are NOT mentions.
- Film directors, authors named as people (not a book) and other people: type "person".
- "surface" is only the name itself, not the verb or the sentence around it ("watched Solaris" -> "Solaris").
- kind: rewatch/first_watch/listen/read/visit/quote when the note says so, else note.
- sentiment: the user's feeling about THAT thing in this note.
Return {"mentions":[]} when nothing is named.`;

// Rule-based fallback when the model is unavailable (quota, outage): capitalised phrases,
// allowing small joining words ("In the Mood for Love"), plus quoted titles.
const JOIN = new Set(["the", "of", "for", "and", "a", "an", "in", "to", "on", "at", "with", "&", "de", "la", "le"]);
const STOP_START = new Set(["I", "I'm", "I've", "It", "The", "A", "We", "My", "This", "That", "Today", "Finally", "Still", "So", "And", "But", "Just", "Then"]);
function heuristicMentions(text) {
  const found = [];
  const quoted = text.match(/["“']([^"”']{2,60})["”']/g) || [];
  for (const q of quoted) found.push(q.slice(1, -1));
  const words = text.split(/(\s+)/);
  let cur = [];
  const flush = () => {
    while (cur.length && JOIN.has(cur[cur.length - 1].toLowerCase())) cur.pop();
    if (cur.length) found.push(cur.join(" "));
    cur = [];
  };
  for (const raw of text.split(/\s+/)) {
    const w = raw.replace(/^[(\[]+|[.,!?;:)\]]+$/g, "");
    const endsClause = /[.,!?;:]$/.test(raw);
    if (/^[A-Z0-9][\w'’&-]*$/.test(w)) cur.push(w);
    else if (cur.length && JOIN.has(w.toLowerCase())) cur.push(w);
    else flush();
    if (endsClause) flush();
  }
  flush();
  const out = [];
  for (let f of found) {
    let parts = f.split(" ");
    while (parts.length > 1 && STOP_START.has(parts[0])) parts = parts.slice(1);
    if (parts.length === 1 && STOP_START.has(parts[0])) continue;
    f = parts.join(" ");
    if (f.length < 3 || !text.includes(f)) continue;
    if (!out.includes(f)) out.push(f);
  }
  const low = text.toLowerCase();
  const kind = /rewatch|again|re-read|reread/.test(low) ? "rewatch" : /listen|on repeat|shuffle|playlist|album|song/.test(low) ? "listen" : /reading|finished reading|started|book/.test(low) ? "read" : /went to|visited|walked to/.test(low) ? "visit" : "note";
  const sentiment = /too slow|boring|couldn't settle|hated|meh|disappoint|overrated/.test(low) ? "negative" : /love|best|cried|perfect|beautiful|great|devastating|kind|sign|got me/.test(low) ? "positive" : "neutral";
  return out.slice(0, 4).map((s) => ({ surface: s, title: s, type: "any", kind, sentiment, music_work: "none", heuristic: true }));
}

export async function extractMentions(env, text) {
  if (!text || text.trim().length < 2) return [];
  let out;
  // Cache by note text: the same sentence always yields the same mentions (saves model quota).
  const key = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("v2:" + text))), (b) => b.toString(16).padStart(2, "0")).join("");
  try {
    const hit = await env.DB.prepare("SELECT value FROM llm_cache WHERE key=?").bind(key).first();
    if (hit) out = JSON.parse(hit.value);
  } catch (_) {}
  if (!out) {
    try {
      out = await llmJSON(env, SYSTEM, `Note: """${text.slice(0, 1500)}"""`, EXTRACT_SCHEMA);
      try { await env.DB.prepare("INSERT OR REPLACE INTO llm_cache (key,value,created_at) VALUES (?,?,?)").bind(key, JSON.stringify(out), Date.now()).run(); } catch (_) {}
    } catch (e) {
      return heuristicMentions(text);
    }
  }
  const ms = (Array.isArray(out?.mentions) ? out.mentions : []).map((m) => (m && typeof m === "object" ? { ...m, creator: m.creator && !/^(none|unknown|n\/a|)$/i.test(String(m.creator).trim()) ? m.creator : undefined } : m));
  // keep only mentions whose surface really appears in the note
  const seen = new Set();
  return ms.filter((m) => {
    if (!m || typeof m.surface !== "string" || !m.surface.trim() || !text.includes(m.surface)) return false;
    const k = m.surface.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 6);
}

async function qsearch(env, query, types, take = 5) {
  const qs = new URLSearchParams({ query, take: String(take) });
  if (types) qs.set("types", types.join(","));
  const r = await fetch(`${BASE}/search?${qs}`, { headers: { "X-Api-Key": env.QLOO_API_KEY, accept: "application/json" }, signal: AbortSignal.timeout(+env.QLOO_TIMEOUT_MS || 10000) });
  if (!r.ok) throw new Error(`Qloo search ${r.status}`);
  const d = await r.json();
  return (d.results || []).map((e) => {
    const p = e.properties || {};
    const urn = (e.types || []).find((t) => URN_TYPE[t]) || (e.types || [])[0];
    return {
      qloo_id: e.entity_id, name: e.name, type: URN_TYPE[urn] || "other",
      year: String(p.release_year || p.publication_year || "") || undefined,
      by: Array.isArray(p.authors) ? p.authors[0] : p.author || (Array.isArray(p.directors) ? p.directors[0]?.name : undefined) || p.neighborhood || undefined,
      image: p.image?.url, popularity: e.popularity,
      tags: Array.isArray(e.tags) ? slimEntity({ ...e, tags: e.tags }).tags : undefined,
    };
  });
}

const SMALL = new Set(["the", "a", "an", "of", "and", "on", "in", "to", "for", "at", "with", "by", "&"]);
const toks = (x) => norm(x).split(" ").filter((w) => w && !SMALL.has(w));
/** Word-level resemblance: every meaningful word of the shorter name appears in the longer one ("G train" is not "Dog Training"). */
export function resembles(a, b) {
  const A = toks(a), B = toks(b);
  if (!A.length || !B.length) return norm(a) === norm(b) && !!norm(a);
  const [short, long] = A.length <= B.length ? [A, B] : [B, A];
  if (long.length > short.length * 3 + 1) return false; // "Normal" vs a 12-word subtitle
  return short.every((w) => long.includes(w));
}
/** A mention worth asking about: it looks like a name (capital letter, quotes or CJK), not a common phrase. */
export function properish(surface) {
  const t = String(surface || "");
  if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(t)) return true;
  if (/["“”'‘’]/.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 7) return false;
  const caps = words.filter((w) => /^[A-Z0-9]/.test(w));
  if (!caps.length) return false;
  if (words.length <= 2 && /^[A-Z]$/.test(words[0]) && /^(train|line|bus|express|local)$/i.test(words[1] || "")) return false; // subway lines
  return true;
}
const LEAD_VERB = /^(?:(?:finally|just|re-?)?\s*(?:watched|rewatched|watching|saw|seen|read|reading|re-?read|finished|started|listened to|listening to|heard|hearing|playing|played|finished reading|started reading)\s+)+/i;
/** "watched Solaris" -> "Solaris"; a whole sentence -> just the title when the title is inside it. */
export function cleanSurface(m, text) {
  let sf = String(m.surface || "");
  const stripped = sf.replace(LEAD_VERB, "");
  if (stripped && stripped !== sf && text.includes(stripped)) sf = stripped;
  const tt = String(m.title || "");
  if (tt && sf.length > tt.length + 12 && sf.toLowerCase().includes(tt.toLowerCase())) {
    const i = text.toLowerCase().indexOf(tt.toLowerCase());
    if (i >= 0) sf = text.slice(i, i + tt.length);
  }
  if (sf.split(/\s+/).length > 8) return null; // a sentence, not a name
  return sf;
}

// Decide whether the best search result is a sure match.
const GENERIC = new Set(['live','live recording','recording','not','the','song','album','film','movie','book','show','music','track','single','radio']);
function judge(m, results) {
  if (GENERIC.has(norm(m.surface))) return { sure: false, guesses: [] };
  if (!results.length) return { sure: false, guesses: [] };
  const t = norm(m.title || m.surface), s = norm(m.surface);
  const exact = results.filter((r) => norm(r.name) === t || norm(r.name) === s);
  const typed = exact.filter((r) => r.type === m.type);
  const top = typed[0] || exact[0];
  // sure: an exact-title hit of the expected type, and no second exact hit of the same type that is nearly as popular
  if (top && top.type === m.type) {
    const rivals = typed.filter((r) => r !== top && (r.popularity || 0) > (top.popularity || 0) * 0.6);
    if (!rivals.length && m.surface.length >= 3) return { sure: true, pick: top, guesses: [] };
  }
  // Only offer guesses whose names actually resemble what the user wrote.
  const near = (r) => resembles(r.name, m.title || m.surface) || resembles(r.name, m.surface);
  const ordered = [...typed, ...exact.filter((r) => !typed.includes(r)), ...results.filter((r) => !exact.includes(r) && near(r))];
  return { sure: false, guesses: ordered.slice(0, 3) };
}

export async function upsertCard(env, userId, ent, now) {
  const existing = await env.DB.prepare("SELECT id FROM cards WHERE user_id=? AND qloo_id=?").bind(userId, ent.qloo_id).first();
  if (existing) return existing.id;
  let tags = Array.isArray(ent.tags) ? ent.tags : [], image = ent.image, year = ent.year, by = ent.by;
  if (!Array.isArray(ent.tags) || !image) {
    try {
      const [full] = await getEntities(env, [ent.qloo_id]);
      if (full) { tags = tags.length ? tags : full.tags || []; image = image || full.image; year = year || (full.year ? String(full.year) : undefined); by = by || full.by; }
    } catch (_) { /* card still works without tags */ }
  }
  const id = uid();
  await env.DB.prepare("INSERT OR IGNORE INTO cards (id,user_id,qloo_id,name,type,year,byline,image,tags,heart,created_at) VALUES (?,?,?,?,?,?,?,?,?,0,?)")
    .bind(id, userId, ent.qloo_id, ent.name, cardType(ent.type), year || null, by || null, image || null, JSON.stringify(tags), now).run();
  const row = await env.DB.prepare("SELECT id FROM cards WHERE user_id=? AND qloo_id=?").bind(userId, ent.qloo_id).first();
  return row.id;
}

export async function addFootprint(env, userId, cardId, noteId, m, at, source = "note") {
  if (noteId) {
    const dup = await env.DB.prepare("SELECT id FROM footprints WHERE card_id=? AND note_id=?").bind(cardId, noteId).first();
    if (dup) return dup.id;
  }
  const id = uid();
  await env.DB.prepare("INSERT INTO footprints (id,user_id,card_id,note_id,kind,sentiment,quote,source,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(id, userId, cardId, noteId, m.kind || "note", m.sentiment || "neutral", m.quote || null, source, at).run();
  return id;
}

/** One question per note and mention: a retried recognition must not duplicate an open inbox row. */
async function askInbox(env, userId, noteId, mention, kind, sentiment, guesses) {
  const open = await env.DB.prepare("SELECT 1 FROM inbox WHERE user_id=? AND note_id=? AND mention=? AND status='open' LIMIT 1").bind(userId, noteId, mention).first();
  if (open) return;
  await env.DB.prepare("INSERT INTO inbox (id,user_id,note_id,mention,kind,sentiment,guesses,status,created_at) VALUES (?,?,?,?,?,?,?,'open',?)")
    .bind(uid(), userId, noteId, mention, kind, sentiment, JSON.stringify(guesses), Date.now()).run();
}

/**
 * Rank candidate entities by the user's own taste: Qloo /v2/insights restricted to the candidates
 * (filter.results.entities), with the user's most-returned cards as signal.interests.entities and
 * feature.explainability, so each guess carries an affinity and which of the user's cards pulled it up.
 */
export async function tasteRank(env, userId, guesses) {
  if (!Array.isArray(guesses) || guesses.length < 2) return guesses;
  try {
    const rows = (await env.DB.prepare(`SELECT c.qloo_id, c.name, COUNT(f.id) n FROM cards c JOIN footprints f ON f.card_id=c.id
      WHERE c.user_id=? AND c.heart>=0 AND f.sentiment!='negative' GROUP BY c.id ORDER BY c.heart DESC, n DESC LIMIT 8`).bind(userId).all()).results || [];
    const ids = new Set(guesses.map((g) => g.qloo_id));
    const sig = rows.filter((r) => !ids.has(r.qloo_id));
    if (sig.length < 2) return guesses;
    const names = new Map(sig.map((r) => [String(r.qloo_id).toLowerCase(), r.name]));
    const byType = {};
    for (const g of guesses) { const urn = (TYPE_URNS[g.type] || TYPE_URNS.other)[0]; (byType[urn] ||= []).push(g.qloo_id); }
    const score = new Map();
    await Promise.all(Object.entries(byType).map(async ([urn, list]) => {
      const d = await qinsights(env, { "filter.type": urn, "filter.results.entities": list.join(","), "signal.interests.entities": sig.map((r) => r.qloo_id).join(","), "feature.explainability": "true", take: String(list.length) });
      for (const e of d?.results?.entities || []) {
        const ex = (e.query?.explainability?.["signal.interests.entities"] || []).filter((x) => x && typeof x.score === "number").sort((x, y) => y.score - x.score).slice(0, 2);
        score.set(e.entity_id, { affinity: typeof e.query?.affinity === "number" ? +e.query.affinity.toFixed(2) : null, via: ex.map((x) => ({ name: names.get(String(x.entity_id).toLowerCase()) || null, score: +x.score.toFixed(2) })).filter((x) => x.name) });
      }
    }));
    if (!score.size) return guesses;
    return guesses.map((g) => (score.has(g.qloo_id) ? { ...g, taste: score.get(g.qloo_id) } : g))
      .sort((a, b) => (b.taste?.affinity ?? -1) - (a.taste?.affinity ?? -1));
  } catch (_) { return guesses; }
}
async function qinsights(env, params) {
  const r = await fetch(`${BASE}/v2/insights?${new URLSearchParams(params)}`, { headers: { "X-Api-Key": env.QLOO_API_KEY, accept: "application/json" }, signal: AbortSignal.timeout(+env.QLOO_TIMEOUT_MS || 10000) });
  if (!r.ok) throw new Error(`Qloo insights ${r.status}`);
  return r.json();
}

/** One mention -> matched card, an inbox question, or plain text. */
async function resolveMention(env, userId, note, noteId, text, m) {
  const sf = cleanSurface(m, note.text || text) || m.surface;
  if (sf !== m.surface && (note.text || text).includes(sf)) m = { ...m, surface: sf };
  const start = (note.text || "").indexOf(m.surface);
  const mention = { start, end: start >= 0 ? start + m.surface.length : -1, surface: m.surface, state: "plain" };
  if (cleanSurface(m, note.text || text) === null) return mention;
  const key = norm(m.surface);
  const mapped = await env.DB.prepare("SELECT qloo_id FROM mappings WHERE user_id=? AND surface=?").bind(userId, key).first();
  m.quote = note.text || note.ocr_text;
  if (mapped?.qloo_id === "none") return mention;
  let pick = null, guesses = [];
  if (mapped?.qloo_id) {
    const [e] = await getEntities(env, [mapped.qloo_id]);
    if (e) pick = { qloo_id: e.id, name: e.name, type: URN_TYPE["urn:entity:" + e.domain] || mapType(e.domain), year: e.year ? String(e.year) : undefined, by: e.by, image: e.image, tags: e.tags };
  }
  const songish = m.type === "music" && (m.music_work === "song" || m.music_work === "album");
  if (!pick && songish) {
    // Songs and albums are saved under their artist. Never sure without a named artist.
    if (m.creator) {
      const res = await qsearch(env, m.creator, TYPE_URNS.music);
      const j = judge({ ...m, title: m.creator, surface: m.creator }, res);
      if (j.sure && text.toLowerCase().includes(m.creator.toLowerCase())) { pick = j.pick; m.kind = m.kind === "note" ? "listen" : m.kind; } else guesses = j.sure ? [j.pick] : j.guesses;
    }
    if (!pick && !guesses.length) return mention;
  }
  if (!pick && m.heuristic) {
    const res = await qsearch(env, m.surface, undefined, 6);
    const exact = res.filter((x) => norm(x.name) === norm(m.surface));
    if (exact.length) {
      const top = exact.sort((a, b) => (b.popularity || 0) - (a.popularity || 0))[0];
      const rivals = exact.filter((x) => x !== top && (x.popularity || 0) > (top.popularity || 0) * 0.6);
      if (!rivals.length && (top.popularity || 0) > 0.5 && m.surface.includes(" ")) pick = top; else guesses = exact.slice(0, 3);
    }
    if (!pick && !guesses.length) return mention;
  }
  if (!pick && !songish && !m.heuristic) {
    const q = m.title || m.surface;
    let res = await qsearch(env, q, TYPE_URNS[m.type]);
    if (!res.length && m.type === "person") res = await qsearch(env, q, TYPE_URNS.music); // musicians the model called people
    if (!res.length) res = await qsearch(env, q);
    const j = judge(m, res);
    if (j.sure) pick = j.pick; else guesses = j.guesses;
  }
  if (pick) {
    const had = await env.DB.prepare("SELECT id FROM cards WHERE user_id=? AND qloo_id=?").bind(userId, pick.qloo_id).first();
    const cardId = await upsertCard(env, userId, pick, Date.now());
    const dup = await env.DB.prepare("SELECT id FROM footprints WHERE card_id=? AND note_id=?").bind(cardId, noteId).first();
    if (!dup) await addFootprint(env, userId, cardId, noteId, m, note.created_at);
    Object.assign(mention, { state: "matched", card_id: cardId, plus_one: !!had, card: { name: pick.name, type: cardType(pick.type), image: pick.image || null, year: pick.year || null } });
  } else if (guesses.length && !(m.heuristic && !/\s/.test(m.surface)) && (properish(m.surface) || guesses.some((g) => norm(g.name) === norm(m.surface)))) {
    const ranked = await tasteRank(env, userId, guesses.map(({ tags, ...g }) => g));
    await askInbox(env, userId, noteId, m.surface, m.kind, m.sentiment, ranked);
    mention.state = "inbox";
  }
  return mention;
}

// ---- Sample notebook: mentions are pinned to Qloo IDs in sample.js, so no model call is needed.
const pickFrom = (e) => ({ qloo_id: e.id, name: e.name, type: mapType(e.domain), year: e.year ? String(e.year) : undefined, by: e.by, image: e.image, tags: e.tags || [] });
async function claim(env, noteId) {
  try {
    const r = await env.DB.prepare("UPDATE notes SET meta=json_set(COALESCE(meta,'{}'),'$.claimed',?) WHERE id=? AND json_extract(COALESCE(meta,'{}'),'$.claimed') IS NULL").bind(Date.now(), noteId).run();
    return (r?.meta?.changes ?? r?.changes ?? 1) > 0;
  } catch (_) { return true; }
}
/** Resolve every pinned sample note for a user: one /entities call for all IDs, then the Inbox asks ranked by taste. */
export async function resolveSample(env, userId) {
  const rows = (await env.DB.prepare("SELECT * FROM notes WHERE user_id=? AND status='pending' AND meta LIKE '%\"sample\"%' ORDER BY created_at").bind(userId).all()).results || [];
  if (!rows.length) return 0;
  const metas = rows.map((n) => { try { return JSON.parse(n.meta || "{}").sample || {}; } catch (_) { return {}; } });
  const ids = [...new Set(metas.flatMap((s) => [...Object.values(s.map || {}), ...((s.ask || {}).ids || [])]))];
  const ents = new Map();
  for (let i = 0; i < ids.length; i += 20) for (const e of await getEntities(env, ids.slice(i, i + 20))) ents.set(String(e.id).toUpperCase(), e);
  // pinned mentions first, so the Inbox ranking can use the cards they create
  const order = rows.map((n, i) => [n, metas[i]]).sort((a, b) => (a[1].ask ? 1 : 0) - (b[1].ask ? 1 : 0));
  let done = 0;
  const run = async ([n, sm]) => { try { if (await recognizeSampleNote(env, userId, n, sm, ents)) done++; } catch (e) { console.log("sample", e.message); } };
  const pinned = order.filter(([, sm]) => !sm.ask), asks = order.filter(([, sm]) => sm.ask);
  for (let i = 0; i < pinned.length; i += 8) await Promise.all(pinned.slice(i, i + 8).map(run));
  await Promise.all(asks.map(run));
  return done;
}
async function recognizeSampleNote(env, userId, note, sm, ents) {
  if (!(await claim(env, note.id))) return false;
  try { return await sampleNoteBody(env, userId, note, sm, ents); }
  catch (e) { await env.DB.prepare("UPDATE notes SET meta=json_remove(meta,'$.claimed') WHERE id=?").bind(note.id).run().catch(() => {}); throw e; }
}
async function sampleNoteBody(env, userId, note, sm, ents) {
  const text = note.text || "";
  const mentions = [];
  const fp = { kind: sm.fk || "note", sentiment: sm.sentiment || "positive", quote: text };
  if (!ents) { ents = new Map(); const ids = [...Object.values(sm.map || {}), ...((sm.ask || {}).ids || [])]; if (ids.length) for (const e of await getEntities(env, ids)) ents.set(String(e.id).toUpperCase(), e); }
  for (const [surface, qid] of Object.entries(sm.map || {})) {
    const e = ents.get(String(qid).toUpperCase());
    const start = text.indexOf(surface);
    const mention = { start, end: start >= 0 ? start + surface.length : -1, surface, state: "plain" };
    if (e) {
      const pick = pickFrom(e);
      const had = await env.DB.prepare("SELECT id FROM cards WHERE user_id=? AND qloo_id=?").bind(userId, pick.qloo_id).first();
      const cardId = await upsertCard(env, userId, pick, note.created_at);
      await addFootprint(env, userId, cardId, note.id, fp, note.created_at);
      Object.assign(mention, { state: "matched", card_id: cardId, plus_one: !!had, card: { name: pick.name, type: cardType(pick.type), image: pick.image || null, year: pick.year || null } });
    }
    mentions.push(mention);
  }
  if (sm.ask) {
    const guesses = (sm.ask.ids || []).map((id) => ents.get(String(id).toUpperCase())).filter(Boolean).map(pickFrom).map(({ tags, ...g }) => g);
    const start = text.indexOf(sm.ask.surface);
    const mention = { start, end: start >= 0 ? start + sm.ask.surface.length : -1, surface: sm.ask.surface, state: "plain" };
    if (guesses.length) {
      const ranked = await tasteRank(env, userId, guesses);
      await askInbox(env, userId, note.id, sm.ask.surface, sm.ask.fk || "note", sm.sentiment || "positive", ranked);
      mention.state = "inbox";
    }
    mentions.push(mention);
  }
  await env.DB.prepare("UPDATE notes SET mentions=?, status='done' WHERE id=?").bind(JSON.stringify(mentions), note.id).run();
  return true;
}

/** Run recognition for one note. Updates notes.mentions and status. */
export async function recognizeNote(env, userId, noteId) {
  const note = await env.DB.prepare("SELECT * FROM notes WHERE id=? AND user_id=?").bind(noteId, userId).first();
  if (!note) return;
  const text = [note.text, note.ocr_text].filter(Boolean).join("\n");
  if (note.kind === "import") return recognizeImport(env, userId, note);
  let sm = null;
  try { sm = JSON.parse(note.meta || "{}").sample || null; } catch (_) {}
  if (sm) { try { await recognizeSampleNote(env, userId, note, sm); } catch (e) { console.log("sample note", e.message); } return; }
  try {
    const found = await extractMentions(env, text);
    // Mentions are independent: resolve them in parallel (one note = one round of Qloo calls, not N).
    const mentions = await Promise.all(found.map((m) => resolveMention(env, userId, note, noteId, text, m)));
    await env.DB.prepare("UPDATE notes SET mentions=?, status='done' WHERE id=?").bind(JSON.stringify(mentions), noteId).run();
  } catch (e) {
    console.log("recognize failed", e.message);
    let tries = 0;
    try { tries = (JSON.parse(note.meta || "{}").tries || 0) + 1; } catch {}
    // Transient errors (quota, timeouts) go back to pending up to 3 times; then the note stays failed with the reason.
    const status = tries < 3 ? "pending" : "failed";
    await env.DB.prepare("UPDATE notes SET status=?, meta=? WHERE id=?").bind(status, JSON.stringify({ error: String(e.message || e).slice(0, 300), tries }), noteId).run();
  }
}

function mapType(domain) {
  return { movie: "film", tv_show: "tv", artist: "music", book: "book", place: "place" }[domain] || "other";
}

/** Image -> text with a vision model; Qloo never sees the image. */
export async function readImage(env, bytes, mime) {
  const b64 = btoa(Array.from(new Uint8Array(bytes), (c) => String.fromCharCode(c)).join(""));
  const r = await env.AI.run("@cf/meta/llama-4-scout-17b-16e-instruct", {
    messages: [
      { role: "system", content: "Transcribe the readable text in the image (titles, names, lyrics, signs). If it is a poster, book cover, record sleeve or shop sign, start with: TITLE: <title> BY: <creator>. If there is no readable text, reply exactly NONE. No commentary." },
      { role: "user", content: [{ type: "text", text: "Read this image." }, { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } }] },
    ],
    max_tokens: 400,
  });
  const t = (r?.response || "").trim();
  return t === "NONE" ? "" : t;
}

/** One honest line on why Sparkling asks, using Qloo's taste ranking when it ran. */
export function inboxReason(mention, guesses) {
  if (!Array.isArray(guesses) || !guesses.length) return null;
  const top = guesses[0], word = { film: "films", tv: "shows", music: "artists", book: "books", place: "places" };
  const same = guesses.filter((g) => String(g.name || "").toLowerCase() === String(top.name || "").toLowerCase());
  const types = [...new Set(guesses.map((g) => g.type))];
  const label = (g) => g.name + (g.year ? ` (${g.year}${types.length > 1 ? ", " + (g.type === "tv" ? "show" : g.type) : ""})` : types.length > 1 ? ` (${g.type === "tv" ? "show" : g.type})` : "");
  const lead = same.length > 1 ? (types.length > 1 ? `"${mention}" is a ${types.map((t) => (t === "tv" ? "show" : t)).join(" and a ")}.` : `${same.length} ${word[top.type] || "things"} are called ${top.name}.`) : guesses.length > 1 ? `"${mention}" could be a few things.` : `Not sure "${mention}" means ${top.name}.`;
  if (top.taste && typeof top.taste.affinity === "number") {
    const via = (top.taste.via || []).map((v) => v.name).filter(Boolean).slice(0, 2);
    return `${lead} Qloo puts ${label(top)} closest to your taste (${top.taste.affinity.toFixed(2)})${via.length ? `, mostly through ${via.join(" and ")}` : ""}.`;
  }
  return lead;
}

/** A Letterboxd diary row: title + year are known, so no model runs. */
async function recognizeImport(env, userId, note) {
  const meta = JSON.parse(note.meta || "{}");
  try {
    let res;
    try { res = await qsearch(env, meta.title, TYPE_URNS.film, 5); }
    catch (_) { await new Promise((r) => setTimeout(r, 700)); res = await qsearch(env, meta.title, TYPE_URNS.film, 5); }
    const t = norm(meta.title);
    const hits = res.filter((r) => norm(r.name) === t && r.type === "film");
    const exact = hits.find((r) => meta.year && r.year === String(meta.year));
    const pick = exact || (hits.length === 1 && !meta.year ? hits[0] : null);
    const start = (note.text || "").indexOf(meta.title);
    const mention = { start, end: start >= 0 ? start + meta.title.length : -1, surface: meta.title, state: "plain" };
    const m = { kind: meta.rewatch ? "rewatch" : "first_watch", sentiment: meta.rating == null ? "neutral" : meta.rating >= 3.5 ? "positive" : meta.rating <= 2 ? "negative" : "mixed", surface: meta.title };
    if (pick) {
      const cardId = await upsertCard(env, userId, pick, Date.now());
      await addFootprint(env, userId, cardId, note.id, m, note.created_at, meta.dated ? "imported" : "imported_pref");
      Object.assign(mention, { state: "matched", card_id: cardId });
    } else if (hits.length) {
      await askInbox(env, userId, note.id, meta.title, m.kind, m.sentiment, hits.slice(0, 3));
      mention.state = "inbox";
    }
    await env.DB.prepare("UPDATE notes SET mentions=?, status='done' WHERE id=?").bind(JSON.stringify([mention]), note.id).run();
  } catch (e) {
    // Transient Qloo errors: back to pending up to 3 tries, with the reason kept for debugging.
    const tries = (meta.tries || 0) + 1;
    await env.DB.prepare("UPDATE notes SET status=?, meta=? WHERE id=?").bind(tries < 3 ? "pending" : "failed", JSON.stringify({ ...meta, error: String(e.message || e).slice(0, 300), tries }), note.id).run();
  }
}

/** Parse a Letterboxd diary.csv / reviews.csv / watched.csv export. */
export function parseLetterboxd(csv) {
  csv = String(csv || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (q) { if (c === '"' && csv[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && csv[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = (rows.shift() || []).map((h) => h.trim().toLowerCase());
  const col = (n) => head.indexOf(n);
  const iName = col("name"), iYear = col("year"), iRating = col("rating"), iRe = col("rewatch"), iW = col("watched date"), iD = col("date"), iRev = col("review");
  if (iName < 0) return null;
  const rate = (v) => { const n = v ? Number(v) : NaN; return Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : null; };
  return rows.filter((r) => (r[iName] || "").trim()).map((r) => ({
    title: r[iName].trim(), year: iYear >= 0 ? r[iYear] : undefined,
    rating: iRating >= 0 ? rate(r[iRating]) : null,
    rewatch: iRe >= 0 && /yes/i.test(r[iRe] || ""),
    date: (iW >= 0 && r[iW]) || (iD >= 0 && r[iD]) || null, dated: iW >= 0 && !!r[iW],
    review: iRev >= 0 ? (r[iRev] || "").trim() : "",
  }));
}
