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
  other: ["urn:entity:podcast", "urn:entity:brand", "urn:entity:destination"],
};
const URN_TYPE = {
  "urn:entity:movie": "film", "urn:entity:tv_show": "tv", "urn:entity:artist": "music",
  "urn:entity:book": "book", "urn:entity:place": "place", "urn:entity:podcast": "other",
  "urn:entity:brand": "other", "urn:entity:destination": "other", "urn:entity:video_game": "other",
};
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
          type: { type: "string", enum: ["film", "tv", "music", "book", "place", "other"] },
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
- "title" is the canonical title you think it refers to (for a song/album: the song/album title). Never invent things that are not named. Generic words ("a movie", "the counter place", "lunch") are NOT mentions.
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
  const key = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("v1:" + text))), (b) => b.toString(16).padStart(2, "0")).join("");
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
  const ms = Array.isArray(out?.mentions) ? out.mentions : [];
  // keep only mentions whose surface really appears in the note
  const seen = new Set();
  return ms.filter((m) => {
    if (!m || !m.surface || !text.includes(m.surface)) return false;
    const k = m.surface.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 6);
}

async function qsearch(env, query, types, take = 5) {
  const qs = new URLSearchParams({ query, take: String(take) });
  if (types) qs.set("types", types.join(","));
  const r = await fetch(`${BASE}/search?${qs}`, { headers: { "X-Api-Key": env.QLOO_API_KEY, accept: "application/json" } });
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
    };
  });
}

// Decide whether the best search result is a sure match.
function judge(m, results) {
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
  const near = (r) => { const n = norm(r.name); return n === t || n === s || (t.length > 3 && n.length > 3 && (n.includes(t) || t.includes(n))) || (s.length > 3 && n.includes(s)); };
  const ordered = [...typed, ...exact.filter((r) => !typed.includes(r)), ...results.filter((r) => !exact.includes(r) && near(r))];
  return { sure: false, guesses: ordered.slice(0, 3) };
}

export async function upsertCard(env, userId, ent, now) {
  const existing = await env.DB.prepare("SELECT id FROM cards WHERE user_id=? AND qloo_id=?").bind(userId, ent.qloo_id).first();
  if (existing) return existing.id;
  let tags = [], image = ent.image, year = ent.year, by = ent.by;
  try {
    const [full] = await getEntities(env, [ent.qloo_id]);
    if (full) { tags = full.tags || []; image = image || full.image; year = year || (full.year ? String(full.year) : undefined); by = by || full.by; }
  } catch (_) { /* card still works without tags */ }
  const id = uid();
  await env.DB.prepare("INSERT OR IGNORE INTO cards (id,user_id,qloo_id,name,type,year,byline,image,tags,heart,created_at) VALUES (?,?,?,?,?,?,?,?,?,0,?)")
    .bind(id, userId, ent.qloo_id, ent.name, ent.type, year || null, by || null, image || null, JSON.stringify(tags), now).run();
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

/** Run recognition for one note. Updates notes.mentions and status. */
export async function recognizeNote(env, userId, noteId) {
  const note = await env.DB.prepare("SELECT * FROM notes WHERE id=? AND user_id=?").bind(noteId, userId).first();
  if (!note) return;
  const text = [note.text, note.ocr_text].filter(Boolean).join("\n");
  if (note.kind === "import") return recognizeImport(env, userId, note);
  try {
    const found = await extractMentions(env, text);
    const mentions = [];
    for (const m of found) {
      const start = (note.text || "").indexOf(m.surface);
      const mention = { start, end: start >= 0 ? start + m.surface.length : -1, surface: m.surface, state: "plain" };
      const key = norm(m.surface);
      const mapped = await env.DB.prepare("SELECT qloo_id FROM mappings WHERE user_id=? AND surface=?").bind(userId, key).first();
      m.quote = note.text || note.ocr_text;
      if (mapped?.qloo_id === "none") { mentions.push(mention); continue; }
      let pick = null, guesses = [];
      if (mapped?.qloo_id) {
        const [e] = await getEntities(env, [mapped.qloo_id]);
        if (e) pick = { qloo_id: e.id, name: e.name, type: URN_TYPE["urn:entity:" + e.domain] || mapType(e.domain), year: e.year ? String(e.year) : undefined, by: e.by, image: e.image };
      }
      const songish = m.type === "music" && (m.music_work === "song" || m.music_work === "album");
      if (!pick && songish) {
        // Songs and albums are saved under their artist. Never sure without a named artist.
        if (m.creator) {
          const res = await qsearch(env, m.creator, TYPE_URNS.music);
          const j = judge({ ...m, title: m.creator, surface: m.creator }, res);
          if (j.sure && text.toLowerCase().includes(m.creator.toLowerCase())) { pick = j.pick; m.kind = m.kind === "note" ? "listen" : m.kind; } else guesses = j.sure ? [j.pick] : j.guesses;
        }
        if (!pick && !guesses.length) { mentions.push(mention); continue; }
      }
      if (!pick && m.heuristic) {
        const res = await qsearch(env, m.surface, undefined, 6);
        const exact = res.filter((x) => norm(x.name) === norm(m.surface));
        if (exact.length) {
          const top = exact.sort((a, b) => (b.popularity || 0) - (a.popularity || 0))[0];
          const rivals = exact.filter((x) => x !== top && (x.popularity || 0) > (top.popularity || 0) * 0.6);
          if (!rivals.length && (top.popularity || 0) > 0.5 && m.surface.includes(" ")) pick = top; else guesses = exact.slice(0, 3);
        }
        if (!pick && !guesses.length) { mentions.push(mention); continue; }
      }
      if (!pick && !songish && !m.heuristic) {
        let res = await qsearch(env, m.title || m.surface, TYPE_URNS[m.type]);
        if (!res.length) res = await qsearch(env, m.title || m.surface);
        const j = judge(m, res);
        if (j.sure) pick = j.pick; else guesses = j.guesses;
      }
      if (pick) {
        const had = await env.DB.prepare("SELECT id FROM cards WHERE user_id=? AND qloo_id=?").bind(userId, pick.qloo_id).first();
        const cardId = await upsertCard(env, userId, pick, Date.now());
        const dup = await env.DB.prepare("SELECT id FROM footprints WHERE card_id=? AND note_id=?").bind(cardId, noteId).first();
        if (!dup) await addFootprint(env, userId, cardId, noteId, m, note.created_at);
        Object.assign(mention, { state: "matched", card_id: cardId, plus_one: !!had, card: { name: pick.name, type: pick.type, image: pick.image || null, year: pick.year || null } });
      } else if (guesses.length && !(m.heuristic && !/\s/.test(m.surface))) {
        await env.DB.prepare("INSERT INTO inbox (id,user_id,note_id,mention,kind,sentiment,guesses,status,created_at) VALUES (?,?,?,?,?,?,?,'open',?)")
          .bind(uid(), userId, noteId, m.surface, m.kind, m.sentiment, JSON.stringify(guesses), Date.now()).run();
        mention.state = "inbox";
      }
      mentions.push(mention);
    }
    await env.DB.prepare("UPDATE notes SET mentions=?, status='done' WHERE id=?").bind(JSON.stringify(mentions), noteId).run();
  } catch (e) {
    console.log("recognize failed", e.message);
    await env.DB.prepare("UPDATE notes SET status='failed', meta=? WHERE id=?").bind(JSON.stringify({ error: String(e.message || e).slice(0, 300) }), noteId).run();
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

/** A Letterboxd diary row: title + year are known, so no model runs. */
async function recognizeImport(env, userId, note) {
  const meta = JSON.parse(note.meta || "{}");
  try {
    const res = await qsearch(env, meta.title, TYPE_URNS.film, 5);
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
      await env.DB.prepare("INSERT INTO inbox (id,user_id,note_id,mention,kind,sentiment,guesses,status,created_at) VALUES (?,?,?,?,?,?,?,'open',?)")
        .bind(uid(), userId, note.id, meta.title, m.kind, m.sentiment, JSON.stringify(hits.slice(0, 3)), Date.now()).run();
      mention.state = "inbox";
    }
    await env.DB.prepare("UPDATE notes SET mentions=?, status='done' WHERE id=?").bind(JSON.stringify([mention]), note.id).run();
  } catch (e) {
    await env.DB.prepare("UPDATE notes SET status='failed' WHERE id=?").bind(note.id).run();
  }
}

/** Parse a Letterboxd diary.csv / reviews.csv / watched.csv export. */
export function parseLetterboxd(csv) {
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
  return rows.filter((r) => r[iName]).map((r) => ({
    title: r[iName].trim(), year: iYear >= 0 ? r[iYear] : undefined,
    rating: iRating >= 0 && r[iRating] ? Number(r[iRating]) : null,
    rewatch: iRe >= 0 && /yes/i.test(r[iRe] || ""),
    date: (iW >= 0 && r[iW]) || (iD >= 0 && r[iD]) || null, dated: iW >= 0 && !!r[iW],
    review: iRev >= 0 ? (r[iRev] || "").trim() : "",
  }));
}
