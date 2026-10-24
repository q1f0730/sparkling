// Sparkling Worker: notebook API + static app.
import APP from "./app.html";
import { pwaAsset } from "./pwa.js";
import { recognizeNote, readImageFull, upsertCard, addFootprint, uid, norm, parseLetterboxd, resolveSample, inboxReason, qsearch, CARD_URNS, TYPE_URNS, pickerMerge, cleanTags } from "./recognize.js";
import { makePlan, planDiff, dressPlan, cohorts, planNotice, cacheGet, cachePut, checkPlainPlaces } from "./plan.js";
import { llmJSON } from "./llm.js";
import { qlooTagInsights, getEntities, compareTastes } from "./qloo.js";
import { SAMPLE_NOTES } from "./sample.js";

const J = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
const ERR = (msg, status = 400) => J({ error: msg }, status);
const DAY = 86400000;

// Media store: R2 when bound (MEDIA), otherwise Workers KV (MEDIA_KV) as a free fallback.
const media = {
  put: (env, key, bytes, type) => env.MEDIA ? env.MEDIA.put(key, bytes, { httpMetadata: { contentType: type } }) : env.MEDIA_KV.put(key, bytes, { metadata: { type } }),
  get: async (env, key) => {
    if (env.MEDIA) { const o = await env.MEDIA.get(key); return o && { body: o.body, type: o.httpMetadata?.contentType }; }
    const o = await env.MEDIA_KV.getWithMetadata(key, "arrayBuffer"); return o?.value && { body: o.value, type: o.metadata?.type };
  },
  del: (env, key) => env.MEDIA ? env.MEDIA.delete(key) : env.MEDIA_KV.delete(key),
};

function cookie(req, name) {
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch (_) { return null; } // malformed %-escapes = no session, not a 500
}
// Request bodies: a JSON object or null (bad JSON, arrays, strings, null all count as malformed).
async function readJSON(req) {
  try { const b = await req.json(); return b && typeof b === "object" && !Array.isArray(b) ? b : null; } catch (_) { return null; }
}
const BAD_BODY = () => ERR("That request was not readable.", 400);
const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif|heic|heif|avif)$/;
const strField = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : undefined);
async function currentUser(env, req) {
  const t = cookie(req, "sp");
  if (!t) return null;
  return env.DB.prepare("SELECT * FROM users WHERE token=?").bind(t).first();
}
const pubUser = (u) => ({ id: u.id, area: u.area, budget: u.budget, when: u.whenx, sample: !!u.sample });

async function noteOut(env, n) {
  return {
    id: n.id, text: n.text || "", kind: n.kind, link: n.link || undefined,
    image_url: n.media_key ? `/media/${n.media_key}` : undefined, ocr_text: n.ocr_text || undefined,
    created_at: n.created_at, status: n.status, mentions: JSON.parse(n.mentions || "[]"),
    card_count: JSON.parse(n.mentions || "[]").filter((m) => m.state === "matched").length,
  };
}

async function cardsFor(env, userId, type) {
  const rows = (await env.DB.prepare(`SELECT c.*, COUNT(DISTINCT COALESCE(f.note_id, f.id)) fp, MAX(f.created_at) last_at, MIN(f.created_at) first_at
     FROM cards c LEFT JOIN footprints f ON f.card_id=c.id WHERE c.user_id=? GROUP BY c.id`).bind(userId).all()).results || [];
  const now = Date.now();
  const out = rows.filter((r) => r.fp > 0 || r.heart === 1).map((r) => {
    const recency = r.last_at ? Math.exp(-(now - r.last_at) / (120 * DAY)) : 0.3;
    const attention = r.fp * (0.5 + 0.5 * recency) + (r.heart === 1 ? 1 : 0);
    return {
      id: r.id, qloo_id: r.qloo_id, name: r.name, type: r.type, year: r.year || undefined, by: r.byline || undefined,
      image: r.image || undefined, footprints: r.fp, heart: r.heart, last_at: r.last_at, first_at: r.first_at,
      tags: JSON.parse(r.tags || "[]"), attention, size: attention >= 3.2 ? 3 : attention >= 1.6 ? 2 : 1,
    };
  });
  const want = type && type !== "all" ? (type === "film" ? ["film", "tv"] : [type]) : null;
  return out.filter((c) => !want || want.includes(c.type)).sort((a, b) => b.size - a.size || (b.last_at || 0) - (a.last_at || 0));
}

async function seedSample(env, userId) {
  const now = Date.now(), stmts = [];
  for (const s of SAMPLE_NOTES) {
    const id = uid(), at = now - s.daysAgo * DAY - (s.minutes || 0) * 60000;
    const pinned = s.map || s.ask;
    // Notes with nothing named are plain from the start; pinned ones resolve in the background without a model call.
    const meta = pinned ? JSON.stringify({ sample: { map: s.map, ask: s.ask, fk: s.fk, sentiment: s.sentiment } }) : null;
    stmts.push(env.DB.prepare("INSERT INTO notes (id,user_id,text,kind,meta,status,mentions,created_at) VALUES (?,?,?,'text',?,?,'[]',?)").bind(id, userId, s.text, meta, pinned ? "pending" : "done", at));
    for (const [surface, qid] of Object.entries(s.map || {}))
      stmts.push(env.DB.prepare("INSERT OR REPLACE INTO mappings (user_id,surface,qloo_id) VALUES (?,?,?)").bind(userId, norm(surface), qid));
  }
  await env.DB.batch(stmts);
}

async function recognizePending(env, userId, limit = 6) {
  const rows = (await env.DB.prepare("SELECT id FROM notes WHERE user_id=? AND status='pending' ORDER BY created_at LIMIT ?").bind(userId, limit).all()).results || [];
  const one = async (r) => {
    try { await Promise.race([recognizeNote(env, userId, r.id), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 25000))]); }
    catch (e) {
      // Timeout path used to reset tries to 1 forever; count it so a note that always times out ends as failed (retryable from the UI).
      const cur = await env.DB.prepare("SELECT meta FROM notes WHERE id=?").bind(r.id).first();
      let t = 0; try { t = JSON.parse(cur?.meta || "{}").tries || 0; } catch {}
      t += 1;
      await env.DB.prepare("UPDATE notes SET status=?, meta=? WHERE id=? AND status='pending'").bind(t < 3 ? "pending" : "failed", JSON.stringify({ error: String(e.message), tries: t }), r.id).run();
    }
  };
  // Three notes at a time: each note is ~2-4 Qloo calls, so 6 notes stay well under the 50-subrequest cap.
  for (let i = 0; i < rows.length; i += 3) await Promise.all(rows.slice(i, i + 3).map(one));
  return rows.length;
}

async function api(req, env, ctx, url) {
  const p = url.pathname, m = req.method;

  if (p === "/api/session" && m === "POST") {
    const body = (await readJSON(req)) || {};
    // anonymous-session throttle: per-IP, KV counter, 20/hour (sample sessions cost LLM+Qloo calls)
    const ip = req.headers.get("cf-connecting-ip") || "unknown";
    const rk = "rl:sess:" + ip + ":" + Math.floor(Date.now() / 3600000);
    const used = parseInt((await env.MEDIA_KV.get(rk)) || "0", 10);
    if (used >= 20) return ERR("Too many new sessions from this network. Try again in an hour.", 429);
    await env.MEDIA_KV.put(rk, String(used + 1), { expirationTtl: 7200 }).catch(() => {}); // KV allows 1 write/s per key; best-effort
    const token = uid() + uid(), id = uid();
    const sample = body.mode === "sample";
    await env.DB.prepare("INSERT INTO users (id,token,sample,area,budget,whenx,created_at) VALUES (?,?,?,?,40,'Saturday afternoon',?)")
      .bind(id, token, sample ? 1 : 0, sample ? "Greenpoint, Brooklyn" : null, Date.now()).run();
    if (sample) { await seedSample(env, id); ctx.waitUntil(resolveSample(env, id).catch((e) => console.log("sample", e.message))); }
    const u = await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(id).first();
    return J({ user: pubUser(u) }, 200, { "set-cookie": `sp=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=31536000` });
  }

  if (p === "/api/signout" && m === "POST") return J({ ok: true }, 200, { "set-cookie": "sp=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0" });
  const user = await currentUser(env, req);
  if (!user) return ERR("no session", 401);
  const U = user.id;

  if (p === "/api/notes/retry" && m === "POST") {
    const r = await env.DB.prepare("UPDATE notes SET status='pending', meta=NULL WHERE user_id=? AND status='failed'").bind(U).run();
    ctx.waitUntil(recognizePending(env, U));
    return J({ requeued: r.meta?.changes ?? 0 });
  }

  if (p === "/api/me" && m === "GET") {
    const ib = await env.DB.prepare("SELECT COUNT(*) n FROM inbox WHERE user_id=? AND status='open'").bind(U).first();
    const pending = await env.DB.prepare("SELECT COUNT(*) n FROM notes WHERE user_id=? AND status='pending'").bind(U).first();
    if (pending.n) ctx.waitUntil(recognizePending(env, U));
    const due = await env.DB.prepare("SELECT id, plan, created_at FROM plans WHERE user_id=? AND saved=1 AND went IS NULL ORDER BY created_at DESC LIMIT 1").bind(U).first();
    let did_you_go = null;
    if (due) { const pl = JSON.parse(due.plan); did_you_go = { plan_id: due.id, place: pl.stops[0]?.name, label: pl.meta?.when || "your plan" }; }
    return J({ user: pubUser(user), inbox_count: ib.n, pending: pending.n, did_you_go });
  }
  if (p === "/api/me" && m === "PATCH") {
    const b = await readJSON(req);
    if (!b) return BAD_BODY();
    for (const k of ["area", "when"]) if (b[k] != null && typeof b[k] !== "string") return ERR(`${k} must be text`);
    let budget = null;
    if (b.budget != null) {
      const n = typeof b.budget === "number" || (typeof b.budget === "string" && b.budget.trim()) ? Number(b.budget) : NaN;
      if (!Number.isFinite(n) || n < 0 || n > 100000) return ERR("Budget needs a number above zero.");
      budget = Math.round(n);
    }
    await env.DB.prepare("UPDATE users SET area=COALESCE(?,area), budget=COALESCE(?,budget), whenx=COALESCE(?,whenx) WHERE id=?")
      .bind(strField(b.area, 120) ?? null, budget, strField(b.when, 80) ?? null, U).run();
    return J({ user: pubUser(await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(U).first()) });
  }

  // ---- notes
  if (p === "/api/notes" && m === "GET") {
    const f = url.searchParams.get("filter") || "all", q = (url.searchParams.get("q") || "").trim();
    let sql = "SELECT * FROM notes WHERE user_id=?", args = [U];
    if (q) { sql += " AND (text LIKE ? OR ocr_text LIKE ?)"; args.push(`%${q}%`, `%${q}%`); }
    if (f === "photos") sql += " AND kind='photo'";
    sql += " ORDER BY created_at DESC LIMIT 300";
    let notes = await Promise.all(((await env.DB.prepare(sql).bind(...args).all()).results || []).map((n) => noteOut(env, n)));
    if (f === "cards") notes = notes.filter((n) => n.card_count > 0);
    if (f === "plain") notes = notes.filter((n) => n.card_count === 0 && n.kind !== "photo");
    return J({ notes });
  }
  if (p === "/api/notes" && m === "POST") {
    const b = await readJSON(req);
    if (!b) return BAD_BODY();
    const text = (typeof b.text === "string" || typeof b.text === "number" ? String(b.text) : "").slice(0, 5000);
    if (!text.trim()) return ERR("empty");
    const link = (text.match(/https?:\/\/\S+/) || [])[0];
    const id = uid(), now = Date.now();
    const tags = cleanTags(b.tags).filter((g) => text.includes(g.name));
    await env.DB.prepare("INSERT INTO notes (id,user_id,text,kind,link,meta,status,created_at) VALUES (?,?,?,?,?,?,'pending',?)").bind(id, U, text, link ? "link" : "text", link || null, tags.length ? JSON.stringify({ tags }) : null, now).run();
    ctx.waitUntil(recognizeNote(env, U, id));
    return J({ note: await noteOut(env, await env.DB.prepare("SELECT * FROM notes WHERE id=?").bind(id).first()) });
  }
  if (p === "/api/notes/photo" && m === "POST") {
    let fd;
    try { fd = await req.formData(); } catch (_) { return ERR("no file"); }
    const file = fd.get("file"); const caption = String(fd.get("caption") || "").slice(0, 5000);
    if (!file || typeof file === "string") return ERR("no file");
    if (file.size > 8 * 1024 * 1024) return ERR("That image is too large (8 MB max).");
    if (!IMAGE_TYPES.test(file.type || "")) return ERR("That file is not a photo (JPEG, PNG, WebP, GIF or HEIC).");
    const id = uid(), key = `${U}/${id}`, bytes = await file.arrayBuffer();
    const tags = cleanTags(String(fd.get("tags") || "")).filter((g) => caption.includes(g.name));
    await media.put(env, key, bytes, file.type || "image/jpeg");
    await env.DB.prepare("INSERT INTO notes (id,user_id,text,kind,media_key,meta,status,created_at) VALUES (?,?,?,'photo',?,?,'pending',?)").bind(id, U, caption, key, tags.length ? JSON.stringify({ tags }) : null, Date.now()).run();
    ctx.waitUntil((async () => {
      // The vision model can take a minute on a real photo; past 18 s recognition goes ahead on the caption alone.
      try {
        const v = await Promise.race([readImageFull(env, bytes, file.type || "image/jpeg"), new Promise((_, rej) => setTimeout(() => rej(new Error("vision timeout")), 18000))]);
        await env.DB.prepare("UPDATE notes SET ocr_text=?, meta=json_set(COALESCE(meta,'{}'),'$.scene',?) WHERE id=?").bind(v.text || null, v.scene || null, id).run();
      } catch (e) { console.log("ocr", e.message); }
      await recognizeNote(env, U, id);
    })());
    return J({ note: await noteOut(env, await env.DB.prepare("SELECT * FROM notes WHERE id=?").bind(id).first()) });
  }
  let mm;
  if ((mm = p.match(/^\/api\/notes\/(\w+)$/))) {
    const n = await env.DB.prepare("SELECT * FROM notes WHERE id=? AND user_id=?").bind(mm[1], U).first();
    if (!n) return ERR("not found", 404);
    if (m === "GET") return J({ note: await noteOut(env, n) });
    if (m === "DELETE") {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM footprints WHERE note_id=? AND user_id=?").bind(n.id, U),
        env.DB.prepare("DELETE FROM inbox WHERE note_id=? AND user_id=?").bind(n.id, U),
        env.DB.prepare("DELETE FROM notes WHERE id=?").bind(n.id),
      ]);
      return J({ ok: true });
    }
    if (m === "PATCH") {
      const b = await readJSON(req);
      if (!b || typeof b.text !== "string") return BAD_BODY();
      if (!b.text.trim()) return ERR("empty"); // never wipe a note through an edit
      b.text = b.text.slice(0, 5000);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM footprints WHERE note_id=? AND user_id=?").bind(n.id, U),
        env.DB.prepare("DELETE FROM inbox WHERE note_id=? AND user_id=? AND status='open'").bind(n.id, U),
        env.DB.prepare("UPDATE notes SET text=?, status='pending', mentions='[]' WHERE id=?").bind(String(b.text || ""), n.id),
      ]);
      ctx.waitUntil(recognizeNote(env, U, n.id));
      return J({ note: await noteOut(env, await env.DB.prepare("SELECT * FROM notes WHERE id=?").bind(n.id).first()) });
    }
  }
  if ((mm = p.match(/^\/media\/(.+)$/)) && m === "GET") {
    if (!mm[1].startsWith(U + "/")) return ERR("not found", 404);
    const o = await media.get(env, mm[1]);
    if (!o) return ERR("not found", 404);
    const type = IMAGE_TYPES.test(o.type || "") ? o.type : "application/octet-stream"; // older uploads were not type-checked
    return new Response(o.body, { headers: { "content-type": type, "cache-control": "private, max-age=86400", "content-security-policy": "default-src 'none'; sandbox", ...(type.startsWith("image/") ? {} : { "content-disposition": "attachment" }) } });
  }

  // ---- catalogue search for the "/" picker and "Not this?" (one Qloo call per query, cached 10 min)
  if (p === "/api/catalogue" && m === "GET") {
    const raw = (url.searchParams.get("q") || "").replace(/\s+/g, " ").trim().slice(0, 60);
    const type = url.searchParams.get("type") || "all";
    const URNS = { all: CARD_URNS, person: TYPE_URNS.person, film: TYPE_URNS.film, tv: TYPE_URNS.tv, music: TYPE_URNS.music, book: TYPE_URNS.book, place: TYPE_URNS.place };
    if (!URNS[type]) return ERR("Unknown type.");
    if (!raw) return J({ query: "", results: [] });
    const key = "cat:v4:" + type + ":" + raw.toLowerCase();
    try { const hit = await env.MEDIA_KV.getWithMetadata(key, "text"); if (hit && hit.value) return J(JSON.parse(hit.value)); } catch (_) {}
    let q = raw;
    if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(raw)) q = (await translateName(env, raw)) || raw;
    // "All" searches people, works and places apart (3 calls) so cafés called Margaret don't bury Margaret Qualley
    const plan = type === "all" ? [[TYPE_URNS.person, 10], [[...TYPE_URNS.film, ...TYPE_URNS.tv, ...TYPE_URNS.music, ...TYPE_URNS.book, "urn:entity:podcast"], 10], [TYPE_URNS.place, 4]] : [[URNS[type], 12]];
    const lists = await Promise.all(plan.map(([urns, take]) => qsearch(env, q, urns, take).catch(() => null)));
    if (lists.every((l) => l === null)) return ERR("The catalogue did not answer. Try again.", 502);
    const out = { query: raw, en: q !== raw ? q : undefined, results: pickerMerge(q, lists, type) };
    if (raw.length >= 2) await env.MEDIA_KV.put(key, JSON.stringify(out), { expirationTtl: 600 }).catch(() => {});
    return J(out);
  }
  if ((mm = p.match(/^\/api\/cards\/(\w+)\/swap$/)) && m === "POST") {
    const c = await env.DB.prepare("SELECT * FROM cards WHERE id=? AND user_id=?").bind(mm[1], U).first();
    if (!c) return ERR("not found", 404);
    const b = await readJSON(req);
    const qid = b && typeof b.qloo_id === "string" ? b.qloo_id.trim() : "";
    if (!/^[A-Za-z0-9-]{6,64}$/.test(qid)) return BAD_BODY();
    if (qid.toLowerCase() === String(c.qloo_id).toLowerCase()) return J({ ok: true, card_id: c.id });
    const [e] = await getEntities(env, [qid]).catch(() => []);
    if (!e) return ERR("That one is not in the catalogue.", 404);
    const DT = { movie: "film", tv_show: "tv", artist: "music", book: "book", place: "place", person: "person" };
    const type = DT[e.domain] || (["film", "tv", "music", "book", "place", "person"].includes(b.type) ? b.type : "other");
    const newId = await swapCard(env, U, c, { qloo_id: e.id, name: e.name, type, year: e.year ? String(e.year) : undefined, by: e.by, image: e.image, tags: e.tags || [] });
    return J({ ok: true, card_id: newId });
  }

  // ---- cards
  if (p === "/api/cards" && m === "GET") return J({ cards: await cardsFor(env, U, url.searchParams.get("type")) });
  if ((mm = p.match(/^\/api\/cards\/(\w+)$/))) {
    const c = await env.DB.prepare("SELECT * FROM cards WHERE id=? AND user_id=?").bind(mm[1], U).first();
    if (!c) return ERR("not found", 404);
    if (m === "PATCH") { const b = await readJSON(req); if (!b) return BAD_BODY(); await env.DB.prepare("UPDATE cards SET heart=? WHERE id=?").bind(Math.max(-1, Math.min(1, Math.round(+b.heart) || 0)), c.id).run(); }
    if (m === "DELETE") {
      await env.DB.batch([env.DB.prepare("DELETE FROM footprints WHERE card_id=?").bind(c.id), env.DB.prepare("DELETE FROM cards WHERE id=?").bind(c.id)]);
      return J({ ok: true });
    }
    const fps = ((await env.DB.prepare(`SELECT f.*, n.text note_text, n.media_key FROM footprints f LEFT JOIN notes n ON n.id=f.note_id WHERE f.card_id=? ORDER BY f.created_at DESC`).bind(c.id).all()).results || [])
      .filter((f, i, a) => !f.note_id || a.findIndex((g) => g.note_id === f.note_id) === i)
      .map((f) => ({ id: f.id, note_id: f.note_id, kind: f.kind, sentiment: f.sentiment, quote: f.note_text || f.quote || "", created_at: f.created_at, source: f.source, image_url: f.media_key ? `/media/${f.media_key}` : undefined }));
    let view_changed = null;
    const pos = fps.find((f) => f.sentiment === "positive"), neg = fps.find((f) => f.sentiment === "negative");
    if (pos && neg) view_changed = pos.created_at > neg.created_at ? { a: neg, b: pos } : { a: pos, b: neg };
    const card = (await cardsFor(env, U)).find((x) => x.id === c.id) || { id: c.id, name: c.name, type: c.type, heart: c.heart, footprints: 0 };
    return J({ card: { ...card, heart: (await env.DB.prepare("SELECT heart FROM cards WHERE id=?").bind(c.id).first()).heart }, footprints: fps, view_changed, qloo_tags: JSON.parse(c.tags || "[]").slice(0, 3), photos: fps.filter((f) => f.image_url).map((f) => f.image_url) });
  }
  if ((mm = p.match(/^\/api\/footprints\/(\w+)$/)) && m === "DELETE") {
    const f = await env.DB.prepare("SELECT f.*, c.qloo_id, n.text FROM footprints f JOIN cards c ON c.id=f.card_id LEFT JOIN notes n ON n.id=f.note_id WHERE f.id=? AND f.user_id=?").bind(mm[1], U).first();
    if (!f) return ERR("not found", 404);
    await env.DB.prepare("DELETE FROM footprints WHERE id=?").bind(f.id).run();
    // remember the correction: unlink the mention in the note
    const note = await env.DB.prepare("SELECT * FROM notes WHERE id=?").bind(f.note_id).first();
    if (note) {
      const ms = JSON.parse(note.mentions || "[]").map((x) => (x.card_id === f.card_id ? { ...x, state: "plain", card_id: undefined } : x));
      await env.DB.prepare("UPDATE notes SET mentions=? WHERE id=?").bind(JSON.stringify(ms), note.id).run();
      for (const x of ms) if (x.state === "plain") await env.DB.prepare("INSERT OR REPLACE INTO mappings (user_id,surface,qloo_id) VALUES (?,?,'none')").bind(U, norm(x.surface)).run();
    }
    return J({ ok: true });
  }

  // ---- inbox
  if (p === "/api/inbox" && m === "GET") {
    const rows = (await env.DB.prepare("SELECT i.*, n.text FROM inbox i JOIN notes n ON n.id=i.note_id WHERE i.user_id=? AND i.status='open' ORDER BY i.created_at").bind(U).all()).results || [];
    return J({ items: rows.map((r) => { const guesses = JSON.parse(r.guesses || "[]"); return { id: r.id, note_id: r.note_id, sentence: r.text, mention: r.mention, guesses, reason: inboxReason(r.mention, guesses) }; }) });
  }
  if (p === "/api/inbox/accept_all" && m === "POST") {
    const rows = (await env.DB.prepare("SELECT id FROM inbox WHERE user_id=? AND status='open'").bind(U).all()).results || [];
    for (const r of rows) await inboxAct(env, U, r.id, { action: "accept" });
    return J({ ok: true, accepted: rows.length });
  }
  if ((mm = p.match(/^\/api\/inbox\/(\w+)$/)) && m === "POST") {
    const b = await readJSON(req);
    if (!b) return BAD_BODY();
    const r = await inboxAct(env, U, mm[1], b);
    return J(r, r.error === "not found" ? 404 : r.error ? 400 : 200);
  }

  // ---- monthly taste letter (derived from your own cards and notes; no model call)
  if (p === "/api/letter" && m === "GET") {
    const all = (await cardsFor(env, U)).filter((c) => c.heart >= 0);
    if (all.length < 3) return J({ letter: null, reason: "Your first letter arrives once a few notes have turned into cards." });
    const byM = {}; for (const c of all) if (c.last_at) { const k = new Date(c.last_at).toISOString().slice(0, 7); byM[k] = (byM[k] || 0) + 1; }
    const keys = Object.keys(byM).sort().slice(-3), best = keys.sort((x, y2) => byM[y2] - byM[x] || (x < y2 ? 1 : -1))[0];
    const lastAt = Date.parse(best + "-15T00:00:00Z");
    const d = new Date(lastAt), y = d.getUTCFullYear(), mo = d.getUTCMonth();
    const from = Date.UTC(y, mo, 1), to = Date.UTC(y, mo + 1, 1);
    const inMonth = all.filter((c) => (c.last_at || 0) >= from && (c.last_at || 0) < to);
    const fresh = all.filter((c) => (c.first_at || 0) >= from && (c.first_at || 0) < to);
    const month = new Date(from).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    const returns = [...inMonth].sort((a, b) => b.footprints - a.footprints).slice(0, 3).filter((c) => c.footprints >= 2);
    const mix = {}; for (const c of inMonth) mix[c.type] = (mix[c.type] || 0) + 1;
    const tagCount = {}; for (const c of inMonth) for (const t of c.tags || []) tagCount[t] = (tagCount[t] || 0) + 1;
    const themes = Object.entries(tagCount).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, n]) => ({ name, cards: n }));
    const q = await env.DB.prepare("SELECT f.quote, n.text, f.created_at, c.name, c.id FROM footprints f JOIN notes n ON n.id=f.note_id JOIN cards c ON c.id=f.card_id WHERE c.user_id=? AND f.sentiment!='negative' AND f.created_at>=? AND f.created_at<? ORDER BY length(n.text) DESC LIMIT 3").bind(U, from, to).all().catch(() => null);
    const words = ((q && q.results) || []).map((r) => ({ text: r.text, card: r.name, card_id: r.id, at: r.created_at }));
    const word = { film: "films", tv: "shows", music: "artists", book: "books", place: "places", person: "people", other: "things" };
    const lead = Object.entries(mix).sort((a, b) => b[1] - a[1])[0];
    const para = [];
    para.push(`${fresh.length} new ${fresh.length === 1 ? "card" : "cards"} joined your wall in ${month}` + (lead ? `, and mostly it was ${word[lead[0]] || "other things"} (${lead[1]} of ${inMonth.length} you touched).` : "."));
    if (returns.length) para.push(`You went back to ${returns.map((c) => c.name).join(", ")} more than anything else.`);
    if (themes.length) para.push(`The tags that kept showing up across your cards: ${themes.map((t) => t.name).join(", ")}.`);
    const pl = inMonth.filter((c) => c.type === "place").slice(0, 3);
    if (pl.length) para.push(`Out in the world, you kept ${pl.map((c) => c.name).join(", ")} on your map. Those are the places your plan can start from.`);
    const gaps = ["film", "music", "book", "place"].filter((t) => !mix[t]).map((t) => word[t]);
    if (gaps.length) para.push(`Nothing from ${gaps.join(" or ")} this month. That is not a verdict, just an empty shelf.`);
    // Taste drift: Qloo /v2/insights/compare between cards first noted before this month and the ones noted in it. The date split is Sparkling's own.
    let drift = null;
    try {
      const idsOf = (l) => [...new Set(l.filter((c) => c.qloo_id).map((c) => c.qloo_id))].slice(0, 20).sort();
      const A = idsOf(all.filter((c) => (c.first_at || 0) < from)), B = idsOf(fresh);
      if (A.length >= 2 && B.length >= 2) {
        const ck = "drift:v1:" + A.join(",") + "|" + B.join(",");
        let d2 = await cacheGet(env, ck, 6 * 3600000);
        if (!d2) { d2 = await compareTastes(env, { a_ids: A, b_ids: B, take: 12 }); await cachePut(env, ck, d2); }
        const ok = (t) => /theme|style|genre|music|setting|mood|tone/.test(t.sub || t.kind || "") && !/speech|politic|rights|commentary|religio|war|crime|violence|controvers|brand|person/i.test(t.name + " " + (t.sub || ""));
        const pk = (l) => (l || []).filter(ok).slice(0, 4).map((t) => t.name);
        drift = { before: pk(d2.only_a), now: pk(d2.only_b), shared: pk(d2.shared), before_cards: A.length, now_cards: B.length };
        if (!drift.before.length && !drift.now.length) drift = null;
      }
    } catch (e) { drift = null; }
    let monthOut = month, paraOut = para, receiptOut = "Computed from your cards, footprints and Qloo tags. No model wrote this.";
    if (url.searchParams.get("lang") === "zh") {
      const wz = { film: "电影", tv: "剧集", music: "音乐人", book: "书", place: "地点", person: "人物", other: "其他" };
      const nm = (l) => l.join("、");
      monthOut = `${y}年${mo + 1}月`;
      paraOut = [`${monthOut}有 ${fresh.length} 张新卡片加入你的墙` + (lead ? `，主要是${wz[lead[0]] || "其他"}（你碰过的 ${inMonth.length} 张里占 ${lead[1]} 张）。` : "。")];
      if (returns.length) paraOut.push(`你回头最多的是${nm(returns.map((c) => c.name))}。`);
      if (themes.length) paraOut.push(`在你的卡片里反复出现的标签：${nm(themes.map((t) => t.name))}。`);
      if (pl.length) paraOut.push(`在现实世界里，你把${nm(pl.map((c) => c.name))}留在了地图上。这些就是你的计划可以出发的地方。`);
      if (gaps.length) paraOut.push(`这个月没有${gaps.map((g) => ({ films: "电影", music: "音乐", artists: "音乐", books: "书", places: "地点" }[g] || g)).join("或")}。这不是评判，只是一个空着的书架。`);
      receiptOut = "由你的卡片、足迹和 Qloo 标签计算得出，没有模型参与撰写。";
    }
    return J({ letter: { month: monthOut, new_cards: fresh.length, touched: inMonth.length, mix, returns: returns.map((c) => ({ id: c.id, name: c.name, type: c.type, image: c.image, footprints: c.footprints })), places: pl.map((c) => ({ id: c.id, name: c.name, type: c.type, image: c.image })), new: fresh.slice(0, 6).map((c) => ({ id: c.id, name: c.name, type: c.type, image: c.image })), themes, drift, your_words: words, paragraphs: paraOut, receipt: receiptOut } });
  }

  // ---- threads
  if (p === "/api/threads" && m === "GET") {
    const all = (await cardsFor(env, U)).filter((c) => c.heart >= 0 && c.footprints >= 1);
    const liked = all.filter((c) => c.heart === 1 || c.footprints >= 1);
    if (liked.length < 4 || new Set(liked.map((c) => c.type)).size < 2)
      return J({ threads: [], reason: "Threads show up once a few things keep coming back." });
    const co = cohorts(liked, 6);
    const KEEP = /theme|style|mood|tone|music:qloo|artist:qloo|setting|subgenre|keyword/;
    const tagRead = async (cards) => {
      // Qloo tag insights for this card set, cached 6 h (same cards -> same answer; saves ~0.8 s per call).
      const ids = cards.map((c) => c.qloo_id).sort();
      const ck = "tags:v1:" + ids.join(",");
      let d = await cacheGet(env, ck, 6 * 3600000);
      if (!d) { d = await qlooTagInsights(env, cards.map((c) => c.qloo_id)); await cachePut(env, ck, d); }
      return d.filter((t) => KEEP.test(t.subtype || "") && !/genre:brand|person|subgenre|lifestyle/.test(t.subtype || "") && !/speech|politic|rights|commentary|design|religio|war|crime|violence|controvers|anxiety|scandal/i.test(t.name)).slice(0, 12);
    };
    const period = ["now", "then"].includes(url.searchParams.get("period")) ? url.searchParams.get("period") : "all";
    if (period !== "all" && co.size < 3) return J({ threads: [], period, reason: "Not enough notes yet to compare earlier and recent you. Keep writing; this fills in on its own." });
    const heavy = period === "now" ? co.now : period === "then" ? co.then : [...liked].sort((a, b) => b.attention - a.attention).slice(0, 8);
    let main = [], nowT = [], thenT = [];
    try {
      let mainAll;
      [nowT, thenT, mainAll] = await Promise.all([co.size >= 3 ? tagRead(co.now) : [], co.size >= 3 ? tagRead(co.then) : [], period === "all" ? tagRead(heavy) : null]);
      main = period === "now" ? nowT : period === "then" ? thenT : mainAll;
    } catch (e) { return J({ threads: [], period, reason: "The taste catalogue isn't answering right now. Your cards are fine." }); }
    const evidence = (tag, pool) => pool.filter((c) => c.tags.some((t) => t.toLowerCase() === tag.toLowerCase()));
    const latestQ = new Map();
    for (const r of ((await env.DB.prepare("SELECT f.card_id, f.quote, n.text, f.created_at FROM footprints f JOIN notes n ON n.id=f.note_id WHERE f.user_id=? AND f.sentiment!='negative' ORDER BY f.created_at DESC").bind(U).all()).results || [])) if (!latestQ.has(r.card_id)) latestQ.set(r.card_id, r);
    const quotesFor = async (cards) => {
      const out = [], seen = new Set();
      for (const c of cards) {
        const r = latestQ.get(c.id);
        if (r && !seen.has(r.text)) { seen.add(r.text); out.push({ text: r.text, at: r.created_at, card: c.name, card_id: c.id }); }
        if (out.length >= 3) break;
      }
      return out;
    };
    const nowNames = new Set(nowT.map((t) => t.name)), thenNames = new Set(thenT.map((t) => t.name));
    const shiftOf = (name) => (co.size < 3 ? null : nowNames.has(name) && !thenNames.has(name) ? "New in recent notes" : thenNames.has(name) && !nowNames.has(name) ? "Fading from recent notes" : nowNames.has(name) ? "Steady" : null);
    const kindWord = { film: "a film", tv: "a show", music: "an artist", book: "a book", place: "a place" };
    const threads = [];
    for (const t of main.slice(0, 8)) {
      const ev = evidence(t.name, heavy.length ? liked : liked);
      const cards = (ev.length >= 2 ? ev : heavy.slice(0, 4)).slice(0, 5);
      threads.push({
        tag: t.name, tag_id: t.id, kind: (t.subtype || "").split(":").pop(), affinity: t.affinity,
        qloo_tags: [{ name: t.name, id: t.id, subtype: t.subtype, affinity: t.affinity, listed_on: ev.map((c) => c.name) }],
        cards: cards.map((c) => ({ id: c.id, name: c.name, type: c.type, footprints: c.footprints, qloo_id: c.qloo_id, carries_tag: ev.some((e) => e.id === c.id) })),
        carried_by_cards: ev.length >= 2,
        your_words: await quotesFor(cards),
        shift: shiftOf(t.name),
        read: ev.length >= 2 ? `Shows up in ${[...new Set(ev.map((c) => kindWord[c.type] || "something"))].join(", ").replace(/, ([^,]*)$/, " and $1")} you keep returning to.` : "Read across the cards you return to most.",
      });
    }
    // Merge threads that rest on the same cards; drop near-duplicate tag names (Intimacy / Intimate).
    const stem = (w) => w.toLowerCase().replace(/(acy|ate|ity|ness|ive|al|s)$/,"");
    const merged = [];
    for (const t of threads) {
      const key = t.carried_by_cards ? t.cards.map((c) => c.id).join(",") : "u:" + stem(t.tag);
      const same = merged.find((m) => m.key === key);
      if (same) {
        if (!same.tags.some((x) => stem(x) === stem(t.tag))) { same.tags.push(t.tag); same.qloo_tags.push(...t.qloo_tags); if (!same.shift || same.shift === "Steady") same.shift = t.shift || same.shift; }
        continue;
      }
      merged.push({ ...t, key, tags: [t.tag] });
    }
    threads.length = 0;
    const input = heavy.map((c) => ({ qloo_id: c.qloo_id, name: c.name }));
    let mi = 0;
    for (const m of merged) {
      const { key, tags, ...rest } = m; const idx = mi++;
      threads.push({ ...rest, tag: tags.slice(0, 2).join(" · "), read: m.carried_by_cards ? m.read : (() => { const top = [...(m.cards || [])].sort((a, b) => (b.footprints || 0) - (a.footprints || 0)); top.push(...top.splice(0, idx % Math.max(1, top.length))); top.length = Math.min(top.length, 2); const names = top.map((c) => c.name); const lead = names.length > 1 ? `${names[0]} and ${names[1]}` : names[0]; const w = (m.your_words || [])[idx % Math.max(1, (m.your_words || []).length)]; const q = w ? (w.text || w.quote || (typeof w === "string" ? w : "")) : ""; return `${tags.map((x) => "“" + x + "”").join(" and ")} is how Qloo reads the pull of ${lead || (period === "now" ? "your recent cards" : "your cards")}${q ? ` — you wrote “${String(q).replace(/[.\s]+$/, "").slice(0, 70)}”` : ""}.`; })(),
        receipt: { endpoint: "/v2/insights", "filter.type": "urn:tag", "signal.interests.entities": input, tag_ids: m.qloo_tags.map((q) => q.id) } });
    }
    threads.splice(5);
    const pick = (arr) => arr.slice(0, 6).map((t) => t.name);
    return J({
      threads, period,
      shift: co.size >= 3 ? { based_on: co.size, now: pick(nowT), then: pick(thenT), now_cards: co.now.map((c) => c.name), then_cards: co.then.map((c) => c.name) } : { based_on: co.size, reason: "Not enough notes yet to compare earlier and recent." },
      receipt: { endpoint: "/v2/insights", "filter.type": "urn:tag", "signal.interests.entities": heavy.map((c) => c.qloo_id) },
    });
  }

  // ---- plans
  if (p === "/api/plan" && m === "POST") {
    const b = await readJSON(req);
    if (!b) return BAD_BODY();
    if (b.area != null && typeof b.area !== "string") return ERR("area must be text");
    if (typeof b.area === "string") b.area = b.area.trim().slice(0, 120);
    if (b.text != null) b.text = String(b.text).slice(0, 1000);
    // correction beat: "not for me" on one of the cards behind a plan -> same request, re-planned, with a visible diff
    let redo = null;
    if (typeof b.redo_from === "string" && /^\w+$/.test(b.redo_from)) {
      const prev = await env.DB.prepare("SELECT * FROM plans WHERE id=? AND user_id=?").bind(b.redo_from, U).first();
      if (!prev) return ERR("that plan is gone", 404);
      const cid = typeof b.dislike_card === "string" ? b.dislike_card : typeof b.restore_card === "string" ? b.restore_card : null;
      const card = cid ? await env.DB.prepare("SELECT id,name FROM cards WHERE id=? AND user_id=?").bind(cid, U).first() : null;
      if (!card) return ERR("card not found", 404);
      const restore = typeof b.restore_card === "string";
      await env.DB.prepare("UPDATE cards SET heart=? WHERE id=? AND user_id=?").bind(restore ? 0 : -1, card.id, U).run();
      let orig = {}; try { orig = JSON.parse(prev.request || "{}"); } catch (_) {}
      const lang = b.lang === "zh" ? "zh" : orig.lang || "en";
      let before = {}; try { before = JSON.parse(prev.plan || "{}"); } catch (_) {}
      redo = { from: prev.id, card: card.name, restore, before };
      for (const k of Object.keys(b)) delete b[k];
      Object.assign(b, orig, { lang });
    }
    const { readable, writable } = new TransformStream();
    const w = writable.getWriter(), enc = new TextEncoder();
    const send = (o) => w.write(enc.encode(JSON.stringify(o) + "\n"));
    ctx.waitUntil((async () => {
      const logs = [], trace = [], t0 = Date.now();
      try {
        if (b.area && b.area !== user.area) await env.DB.prepare("UPDATE users SET area=? WHERE id=?").bind(b.area, U).run();
        const plan = await makePlan(env, user, b, (t) => { logs.push(t); trace.push({ ms: Date.now() - t0, text: t }); send({ type: "log", text: t }); });
        plan.log = logs; plan.trace = trace;
        if (redo) plan.diff = planDiff(redo.before, plan, redo.card, redo.restore, redo.from);
        const { pool, ...rest } = plan;
        await env.DB.prepare("INSERT INTO plans (id,user_id,request,plan,pool,saved,created_at) VALUES (?,?,?,?,?,0,?)").bind(plan.id, U, JSON.stringify(b), JSON.stringify(rest), JSON.stringify(pool), Date.now()).run();
        await send({ type: "plan", plan: rest });
      } catch (e) {
        await send({ type: "error", state: e.state || "error", text: e.text || "Something went wrong making the plan. Your notes and cards are fine." });
        if (!e.state) console.log("plan error", e.message, e.stack);
      } finally { await w.close(); }
    })());
    return new Response(readable, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
  }
  if (p === "/api/plans" && m === "GET") {
    const rows = (await env.DB.prepare("SELECT * FROM plans WHERE user_id=? AND saved=1 ORDER BY created_at DESC").bind(U).all()).results || [];
    return J({ plans: rows.map((r) => ({ ...JSON.parse(r.plan), saved: true, went: r.went, created_at: r.created_at })) });
  }
  if ((mm = p.match(/^\/api\/plan\/(\w+)(?:\/(\w+))?$/))) {
    const row = await env.DB.prepare("SELECT * FROM plans WHERE id=? AND user_id=?").bind(mm[1], U).first();
    if (!row) return ERR("not found", 404);
    let plan = JSON.parse(row.plan); const pool = JSON.parse(row.pool || "[]"); const act = mm[2];
    if (act && m !== "POST") return ERR("not found", 404); // plan actions change state: POST only
    const b = m === "POST" ? (await readJSON(req)) || {} : {};
    if (!act && m === "GET") return J({ plan: { ...plan, saved: !!row.saved } });
    if (act === "plain") {
      const centreOf = (st) => { const c = (st || []).map((x) => x.coords).filter((c) => c && isFinite(c.lat) && isFinite(c.lon)); return c.length ? { lat: c.reduce((a, x) => a + x.lat, 0) / c.length, lon: c.reduce((a, x) => a + x.lon, 0) / c.length } : null; };
      if (plan.plain && plan.plain.checked === 3) return J({ plain: plan.plain });
      if (plan.plain && plan.plain.stops && plan.plain.stops.length) {
        const ck = await checkPlainPlaces(env, plan.plain.stops.map((x) => x.name), centreOf(plan.stops), plan.plain.area);
        plan.plain = { ...plan.plain, stops: plan.plain.stops.map((x, i) => ({ ...x, check: ck[i] })), checked: 3 };
        await env.DB.prepare("UPDATE plans SET plan=? WHERE id=?").bind(JSON.stringify(plan), row.id).run();
        return J({ plain: plan.plain });
      }
      const seeds = ((plan.receipt || {}).seeds || []).map((x) => x.name);
      const area = (JSON.parse(row.request || "{}").area || user.area || "").slice(0, 120);
      const kinds = (plan.stops || []).map((x) => x.kind).filter(Boolean);
      const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"; // same first model llm.js uses for Sparkling's own sentences
      let stopsOut = [], note = null;
      try {
        const out = await llmJSON(env, "You plan an afternoon out. Suggest real venues from your own memory only. Return {\"stops\":[{\"name\":string,\"kind\":string,\"why\":string}]}. Why is one sentence.",
          `Things this person loves: ${seeds.join(", ")}. Area: ${area}. Plan ${(kinds.length || 3)} stops${kinds.length ? " of these kinds, in order: " + kinds.join(", ") : ""}.`,
          { name: "plain", schema: { type: "object", properties: { stops: { type: "array", items: { type: "object", properties: { name: { type: "string" }, kind: { type: "string" }, why: { type: "string" } }, required: ["name", "why"] } } }, required: ["stops"] } }, 600);
        stopsOut = (out.stops || []).slice(0, 4).map((x) => ({ name: String(x.name || "").slice(0, 80), kind: String(x.kind || "").slice(0, 30), why: String(x.why || "").slice(0, 240) })).filter((x) => x.name);
      } catch (e) { note = "The plain model is unavailable right now (daily AI quota). Try again later."; }
      if (stopsOut.length) { const ck = await checkPlainPlaces(env, stopsOut.map((x) => x.name), centreOf(plan.stops), area); stopsOut = stopsOut.map((x, i) => ({ ...x, check: ck[i] })); }
      const plain = { model: MODEL, seeds, area, stops: stopsOut, note, verified: false, checked: stopsOut.length ? 3 : false };
      if (stopsOut.length) { plan.plain = plain; await env.DB.prepare("UPDATE plans SET plan=? WHERE id=?").bind(JSON.stringify(plan), row.id).run(); }
      return J({ plain });
    }
    if (act === "save") { await env.DB.prepare("UPDATE plans SET saved=1 WHERE id=?").bind(row.id).run(); return J({ plan: { ...plan, saved: true } }); }
    if (act === "went") {
      await env.DB.prepare("UPDATE plans SET went=? WHERE id=?").bind(b.went ? 1 : 0, row.id).run();
      const stop = (plan.stops || [])[0];
      if (b.went && typeof b.text === "string" && b.text.trim() && stop) {
        b.text = b.text.slice(0, 5000);
        const nid = uid(), now = Date.now();
        await env.DB.prepare("INSERT INTO notes (id,user_id,text,kind,status,created_at) VALUES (?,?,?,'text','pending',?)").bind(nid, U, b.text, now).run();
        const cardId = await upsertCard(env, U, { qloo_id: stop.qloo_id, name: stop.name, type: "place", by: stop.neighborhood }, now);
        await addFootprint(env, U, cardId, nid, { kind: "visit", sentiment: "positive" }, now);
        const start = b.text.indexOf(stop.name);
        await env.DB.prepare("INSERT OR REPLACE INTO mappings (user_id,surface,qloo_id) VALUES (?,?,?)").bind(U, norm(stop.name), stop.qloo_id).run();
        await env.DB.prepare("UPDATE notes SET status='done', mentions=? WHERE id=?").bind(JSON.stringify(start >= 0 ? [{ start, end: start + stop.name.length, surface: stop.name, state: "matched", card_id: cardId }] : []), nid).run();
        return J({ ok: true, card_id: cardId, note_id: nid });
      }
      return J({ ok: true });
    }
    if (act === "swap" || act === "shorten" || act === "budget") {
      let stops = plan.stops.map((s) => ({ ...s, coords: s.coords, vibes: s.vibes || [], kind: s.kind }));
      if (act === "swap") {
        const i = Number.isInteger(+b.index) ? +b.index : 0, kind = stops[i]?.kind;
        if (i < 0 || i >= stops.length) return ERR("There is no such stop.");
        const used = new Set([...(plan.swapped || []), ...stops.map((s) => s.qloo_id)]);
        const pl = pool.find((x) => x.kind === kind) || pool[i] || { items: [] };
        const next = pl.items.find((c) => !used.has(c.qloo_id));
        if (!next) return J({ plan, notice: "That's every good option I found for this stop." });
        plan.swapped = [...(plan.swapped || []), stops[i].qloo_id];
        plan.log = [...(plan.log || []), `You swapped stop ${i + 1}: ${stops[i].name} is out, ${next.name} is in (next catalogue result for ${String(kind).toLowerCase()}).`];
        plan.notice_swap = `Swapped stop ${i + 1}`;
        stops[i] = { ...next, kind };
      } else if (act === "shorten") {
        if (stops.length > 1) { plan.log = [...(plan.log || []), `You shortened the plan: dropped ${stops[stops.length - 1].name}.`]; stops = stops.slice(0, stops.length - 1); }
        else return J({ plan, notice: "It's already one stop." });
      } else if (act === "budget") {
        const asked = typeof b.budget === "number" || typeof b.budget === "string" ? Number(b.budget) : NaN;
        const nb = Number.isFinite(asked) && asked > 0 ? Math.min(Math.round(asked), 100000) : Math.max(10, (plan.meta?.budget || 40) - 15);
        const maxP = nb <= 20 ? 1 : nb <= 40 ? 2 : 3;
        const fits = (s) => !s.price_level || s.price_level <= maxP;
        stops = stops.map((s, i) => (fits(s) ? s : ((pool.find((x) => x.kind === s.kind) || { items: [] }).items.find((c) => fits(c) && !stops.some((o) => o.qloo_id === c.qloo_id)) && { ...(pool.find((x) => x.kind === s.kind).items.find((c) => fits(c) && !stops.some((o) => o.qloo_id === c.qloo_id))), kind: s.kind }) || null)).filter(Boolean);
        plan.meta = { ...plan.meta, budget: nb };
        plan.log = [...(plan.log || []), `You lowered the budget to $${nb}; re-ranked the same results.`];
        if (!stops.length) return J({ plan, notice: "Nothing I found fits that budget. Try a wider area." });
      }
      const seeds = plan.seeds || [];
      const re = await dressPlan(env, user, seeds, stops, plan.meta);
      plan = { ...plan, header: re.header, stops: re.stops };
      plan.notice = planNotice(plan.stops, plan.meta?.area, plan.widened);
      if (plan.receipt) plan.receipt.stops = plan.stops.map((s) => ({ name: s.name, qloo_id: s.qloo_id }));
      await env.DB.prepare("UPDATE plans SET plan=? WHERE id=?").bind(JSON.stringify(plan), row.id).run();
      return J({ plan: { ...plan, saved: !!row.saved } });
    }
  }

  // ---- import (Letterboxd export CSV; the raw file is not stored)
  if (p === "/api/import/letterboxd" && m === "POST") {
    let csv = "";
    const ct = req.headers.get("content-type") || "";
    if (+(req.headers.get("content-length") || 0) > 3.5e6) return ERR("That file is too large.");
    if (ct.includes("multipart")) { let f; try { f = (await req.formData()).get("file"); } catch (_) { return ERR("Choose your export file."); } if (!f || typeof f === "string") return ERR("Choose your export file."); if (f.size > 3e6) return ERR("That file is too large."); csv = await f.text(); }
    else { csv = await req.text(); if (csv.length > 3e6) return ERR("That file is too large."); }
    const rows = parseLetterboxd(csv);
    if (!rows) return ERR("That doesn't look like a Letterboxd diary or reviews file.");
    const stars = (r) => (r == null || !Number.isFinite(r) ? "" : " · " + "★".repeat(Math.max(0, Math.min(5, Math.floor(r)))) + (r % 1 ? "½" : ""));
    const stmts = rows.slice(0, 1000).map((r) => {
      const at = r.date ? Date.parse(r.date) || Date.now() : Date.now();
      const text = r.review || `${r.rewatch ? "Rewatched" : "Watched"} ${r.title}${r.year ? ` (${r.year})` : ""}${stars(r.rating)}`;
      const full = text.includes(r.title) ? text : `${r.title}: ${text}`;
      return env.DB.prepare("INSERT INTO notes (id,user_id,text,kind,meta,status,created_at) VALUES (?,?,?,'import',?,'pending',?)").bind(uid(), U, full, JSON.stringify(r), at);
    });
    for (let k = 0; k < stmts.length; k += 50) await env.DB.batch(stmts.slice(k, k + 50));
    ctx.waitUntil(recognizePending(env, U, 20));
    return J({ read: rows.length, queued: stmts.length });
  }
  if (p === "/api/import/status" && m === "GET") {
    const r = await env.DB.prepare(`SELECT COUNT(*) total, SUM(status='pending') pending, SUM(status='done' AND mentions LIKE '%"matched"%') cards, SUM(status='done' AND mentions LIKE '%"inbox"%') inbox FROM notes WHERE user_id=? AND kind='import'`).bind(U).first();
    if (r.pending) ctx.waitUntil(recognizePending(env, U, 20));
    return J({ read: r.total, pending: r.pending || 0, cards: r.cards || 0, inbox: r.inbox || 0, notes: (r.total || 0) - (r.pending || 0) - (r.cards || 0) - (r.inbox || 0) });
  }

  // ---- settings
  if (p === "/api/prefs") {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS prefs (user_id TEXT PRIMARY KEY, json TEXT, updated_at INTEGER)").run();
    if (m === "GET") {
      const r = await env.DB.prepare("SELECT json FROM prefs WHERE user_id=?").bind(U).first();
      return J({ prefs: r ? JSON.parse(r.json) : null });
    }
    if (m === "PUT") {
      const b = await req.json().catch(() => ({}));
      const s = JSON.stringify(b && typeof b.prefs === "object" ? b.prefs : {});
      if (s.length > 4000) return ERR("prefs too large");
      await env.DB.prepare("INSERT INTO prefs (user_id,json,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at").bind(U, s, Date.now()).run();
      return J({ ok: true });
    }
  }
  if (p === "/api/export.md" && m === "GET") {
    const notes = (await env.DB.prepare("SELECT text,kind,link,created_at FROM notes WHERE user_id=? ORDER BY created_at").bind(U).all()).results || [];
    const cards = (await env.DB.prepare("SELECT name,type,year,heart FROM cards WHERE user_id=? ORDER BY name").bind(U).all()).results || [];
    let md = "# Sparkling notes\n\nExported " + new Date().toISOString() + "\n\n## Notes\n\n";
    for (const n of notes) md += "### " + new Date(n.created_at).toISOString().slice(0, 16).replace("T", " ") + "\n\n" + (n.text || "") + (n.link ? "\n\n<" + n.link + ">" : "") + "\n\n";
    md += "## Cards\n\n" + cards.map((c) => "- " + (c.heart === 1 ? "♥ " : "") + c.name + (c.year ? " (" + c.year + ")" : "") + " · " + c.type).join("\n") + "\n";
    return new Response(md, { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": "attachment; filename=sparkling-notes.md" } });
  }
  if (p === "/api/export" && m === "GET") {
    const q = (sql) => env.DB.prepare(sql).bind(U).all().then((r) => r.results || []);
    const data = { exported_at: new Date().toISOString(), notes: await q("SELECT id,text,kind,link,ocr_text,created_at FROM notes WHERE user_id=?"), cards: await q("SELECT id,qloo_id,name,type,year,heart FROM cards WHERE user_id=?"), footprints: await q("SELECT card_id,note_id,kind,sentiment,created_at,source FROM footprints WHERE user_id=?"), plans: await q("SELECT plan,saved,went,created_at FROM plans WHERE user_id=? AND saved=1") };
    return new Response(JSON.stringify(data, null, 2), { headers: { "content-type": "application/json", "content-disposition": "attachment; filename=sparkling-export.json" } });
  }
  if (p === "/api/delete" && m === "POST") {
    const b = (await readJSON(req)) || {};
    if (b.confirm !== "DELETE") return ERR("Type DELETE to confirm.");
    const keys = (await env.DB.prepare("SELECT media_key FROM notes WHERE user_id=? AND media_key IS NOT NULL").bind(U).all()).results || [];
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS prefs (user_id TEXT PRIMARY KEY, json TEXT, updated_at INTEGER)").run();
    for (const r of keys) await media.del(env, r.media_key).catch(() => {});
    await env.DB.batch(["notes", "cards", "footprints", "inbox", "mappings", "plans", "prefs"].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE user_id=?`).bind(U)).concat([env.DB.prepare("DELETE FROM users WHERE id=?").bind(U)]));
    return J({ ok: true }, 200, { "set-cookie": "sp=; Path=/; Max-Age=0" });
  }
  return ERR("not found", 404);
}

async function inboxAct(env, U, id, b) {
  const it = await env.DB.prepare("SELECT i.*, n.text, n.created_at note_at, n.mentions FROM inbox i JOIN notes n ON n.id=i.note_id WHERE i.id=? AND i.user_id=?").bind(id, U).first();
  if (!it) return { error: "not found" };
  const guesses = JSON.parse(it.guesses || "[]");
  const setMention = async (state, cardId) => {
    const ms = JSON.parse(it.mentions || "[]").map((x) => (x.surface === it.mention ? { ...x, state, card_id: cardId } : x));
    await env.DB.prepare("UPDATE notes SET mentions=? WHERE id=?").bind(JSON.stringify(ms), it.note_id).run();
  };
  if (b.action === "undo") {
    if (it.resolved_fp) await env.DB.prepare("DELETE FROM footprints WHERE id=?").bind(it.resolved_fp).run();
    await env.DB.prepare("DELETE FROM mappings WHERE user_id=? AND surface=?").bind(U, norm(it.mention)).run();
    await env.DB.prepare("UPDATE inbox SET status='open', resolved_card=NULL, resolved_fp=NULL WHERE id=?").bind(id).run();
    await setMention("inbox");
    return { ok: true };
  }
  if (b.action === "reject") {
    await env.DB.prepare("INSERT OR REPLACE INTO mappings (user_id,surface,qloo_id) VALUES (?,?,'none')").bind(U, norm(it.mention)).run();
    await env.DB.prepare("UPDATE inbox SET status='rejected' WHERE id=?").bind(id).run();
    await setMention("plain");
    return { ok: true };
  }
  let g = guesses.find((x) => x.qloo_id === b.qloo_id);
  if (!g && b.pick && typeof b.qloo_id === "string" && /^[A-Za-z0-9-]{6,64}$/.test(b.qloo_id)) {
    // picked from the catalogue ("Something else"), not one of the guesses
    const [e] = await getEntities(env, [b.qloo_id]).catch(() => []);
    if (!e) return { error: "not in catalogue" };
    const DT = { movie: "film", tv_show: "tv", artist: "music", book: "book", place: "place", person: "person" };
    g = { qloo_id: e.id, name: e.name, type: DT[e.domain] || (["film", "tv", "music", "book", "place", "person"].includes(b.type) ? b.type : "other"), year: e.year ? String(e.year) : undefined, by: e.by, image: e.image, tags: e.tags || [] };
  }
  g = g || guesses[0];
  if (!g) return { error: "no guess" };
  const cardId = await upsertCard(env, U, g, Date.now());
  const fp = await addFootprint(env, U, cardId, it.note_id, { kind: it.kind, sentiment: it.sentiment }, it.note_at);
  await env.DB.prepare("INSERT OR REPLACE INTO mappings (user_id,surface,qloo_id) VALUES (?,?,?)").bind(U, norm(it.mention), g.qloo_id).run();
  await env.DB.prepare("UPDATE inbox SET status='accepted', resolved_card=?, resolved_fp=? WHERE id=?").bind(cardId, fp, id).run();
  await setMention("matched", cardId);
  return { ok: true, card_id: cardId };
}

/** The "/" picker types Chinese; Qloo's catalogue is English. Cached a week per string. */
async function translateName(env, raw) {
  const key = "tr:v1:" + raw;
  try { const hit = await env.MEDIA_KV.getWithMetadata(key, "text"); if (hit && hit.value) return hit.value; } catch (_) {}
  try {
    const out = await llmJSON(env, "The user is typing the name of a film, TV show, book, musician, person or place, maybe only part of it, in Chinese, Japanese or Korean. Return its usual English or international name as {\"en\":\"...\"}: the official title when it is a known work (花样年华 -> In the Mood for Love), otherwise the usual romanisation of the name (阿曼达 -> Amanda, 玛格丽特 -> Margaret). No explanation.",
      `Text: """${raw}"""`, { type: "object", properties: { en: { type: "string" } }, required: ["en"] }, 60);
    const en = typeof out?.en === "string" ? out.en.replace(/["“”]/g, "").trim().slice(0, 80) : "";
    if (!en) return null;
    await env.MEDIA_KV.put(key, en, { expirationTtl: 7 * 86400 }).catch(() => {});
    return en;
  } catch (_) { return null; }
}

/** "Not this?" on a card: the footprints, note chips and name mappings move to the right entity; the wrong card goes. */
async function swapCard(env, U, c, ent) {
  const newId = await upsertCard(env, U, ent, Date.now());
  if (newId === c.id) return newId;
  await env.DB.batch([
    env.DB.prepare("UPDATE footprints SET card_id=? WHERE card_id=? AND (note_id IS NULL OR note_id NOT IN (SELECT note_id FROM footprints WHERE card_id=? AND note_id IS NOT NULL))").bind(newId, c.id, newId),
    env.DB.prepare("DELETE FROM footprints WHERE card_id=?").bind(c.id),
    env.DB.prepare("UPDATE cards SET heart=? WHERE id=? AND heart=0").bind(c.heart || 0, newId),
    env.DB.prepare("UPDATE mappings SET qloo_id=? WHERE user_id=? AND qloo_id=?").bind(ent.qloo_id, U, c.qloo_id),
    env.DB.prepare("DELETE FROM cards WHERE id=?").bind(c.id),
  ]);
  const rows = (await env.DB.prepare("SELECT id, mentions FROM notes WHERE user_id=? AND mentions LIKE ?").bind(U, `%${c.id}%`).all()).results || [];
  for (const n of rows) {
    let ms; try { ms = JSON.parse(n.mentions || "[]"); } catch (_) { continue; }
    ms = ms.map((x) => (x && x.card_id === c.id ? { ...x, card_id: newId, confirmed: true, card: { ...(x.card || {}), name: ent.name, type: ent.type, image: ent.image || null, year: ent.year || null } } : x));
    await env.DB.prepare("UPDATE notes SET mentions=? WHERE id=?").bind(JSON.stringify(ms), n.id).run();
  }
  return newId;
}

const app = {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/")) return await api(req, env, ctx, url);
      const asset = req.method === "GET" ? pwaAsset(url) : null;
      if (asset) return asset;
      return new Response(APP, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
    } catch (e) {
      console.log("error", e.message, e.stack);
      return ERR("Something went wrong. Your notes are safe.", 500);
    }
  },
};

// Baseline security headers on every response (no sniffing, no framing, no referrer leak of ids). Added by the adversarial suite.
export default {
  async fetch(req, env, ctx) {
    const res = await app.fetch(req, env, ctx);
    try {
      res.headers.set("x-content-type-options", "nosniff");
      res.headers.set("x-frame-options", "DENY");
      res.headers.set("referrer-policy", "same-origin");
    } catch (_) {}
    return res;
  },
};
