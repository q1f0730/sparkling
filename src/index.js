// Sparkling Worker: notebook API + static app.
import APP from "./app.html";
import { recognizeNote, readImage, upsertCard, addFootprint, uid, norm } from "./recognize.js";
import { makePlan, dressPlan } from "./plan.js";
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
  return m ? decodeURIComponent(m[1]) : null;
}
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
  const rows = (await env.DB.prepare(`SELECT c.*, COUNT(f.id) fp, MAX(f.created_at) last_at, MIN(f.created_at) first_at
     FROM cards c LEFT JOIN footprints f ON f.card_id=c.id WHERE c.user_id=? GROUP BY c.id`).bind(userId).all()).results || [];
  const now = Date.now();
  const out = rows.filter((r) => r.fp > 0 || r.heart === 1).map((r) => {
    const recency = r.last_at ? Math.exp(-(now - r.last_at) / (120 * DAY)) : 0.3;
    const attention = r.fp * (0.5 + 0.5 * recency) + (r.heart === 1 ? 1 : 0);
    return {
      id: r.id, qloo_id: r.qloo_id, name: r.name, type: r.type, year: r.year || undefined, by: r.byline || undefined,
      image: r.image || undefined, footprints: r.fp, heart: r.heart, last_at: r.last_at, first_at: r.first_at,
      tags: JSON.parse(r.tags || "[]"), attention, size: attention >= 4 ? 3 : attention >= 2 ? 2 : 1,
    };
  });
  const want = type && type !== "all" ? (type === "film" ? ["film", "tv"] : [type]) : null;
  return out.filter((c) => !want || want.includes(c.type)).sort((a, b) => b.size - a.size || (b.last_at || 0) - (a.last_at || 0));
}

async function seedSample(env, userId) {
  const now = Date.now();
  for (const s of SAMPLE_NOTES) {
    const id = uid();
    await env.DB.prepare("INSERT INTO notes (id,user_id,text,kind,status,created_at) VALUES (?,?,?,?, 'pending', ?)")
      .bind(id, userId, s.text, s.kind || "text", now - s.daysAgo * DAY - (s.minutes || 0) * 60000).run();
    for (const [surface, qid] of Object.entries(s.map || {}))
      await env.DB.prepare("INSERT OR REPLACE INTO mappings (user_id,surface,qloo_id) VALUES (?,?,?)").bind(userId, norm(surface), qid).run();
  }
}

async function recognizePending(env, userId, limit = 6) {
  const rows = (await env.DB.prepare("SELECT id FROM notes WHERE user_id=? AND status='pending' ORDER BY created_at LIMIT ?").bind(userId, limit).all()).results || [];
  for (const r of rows) await recognizeNote(env, userId, r.id);
  return rows.length;
}

async function api(req, env, ctx, url) {
  const p = url.pathname, m = req.method;

  if (p === "/api/session" && m === "POST") {
    const body = await req.json().catch(() => ({}));
    const token = uid() + uid(), id = uid();
    const sample = body.mode === "sample";
    await env.DB.prepare("INSERT INTO users (id,token,sample,area,budget,whenx,created_at) VALUES (?,?,?,?,40,'Saturday afternoon',?)")
      .bind(id, token, sample ? 1 : 0, sample ? "Greenpoint, Brooklyn" : null, Date.now()).run();
    if (sample) { await seedSample(env, id); ctx.waitUntil(recognizePending(env, id, 8)); }
    const u = await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(id).first();
    return J({ user: pubUser(u) }, 200, { "set-cookie": `sp=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=31536000` });
  }

  const user = await currentUser(env, req);
  if (!user) return ERR("no session", 401);
  const U = user.id;

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
    const b = await req.json();
    await env.DB.prepare("UPDATE users SET area=COALESCE(?,area), budget=COALESCE(?,budget), whenx=COALESCE(?,whenx) WHERE id=?")
      .bind(b.area ?? null, b.budget ?? null, b.when ?? null, U).run();
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
    const b = await req.json();
    const text = String(b.text || "").slice(0, 5000);
    if (!text.trim()) return ERR("empty");
    const link = (text.match(/https?:\/\/\S+/) || [])[0];
    const id = uid(), now = Date.now();
    await env.DB.prepare("INSERT INTO notes (id,user_id,text,kind,link,status,created_at) VALUES (?,?,?,?,?,'pending',?)").bind(id, U, text, link ? "link" : "text", link || null, now).run();
    ctx.waitUntil(recognizeNote(env, U, id));
    return J({ note: await noteOut(env, await env.DB.prepare("SELECT * FROM notes WHERE id=?").bind(id).first()) });
  }
  if (p === "/api/notes/photo" && m === "POST") {
    const fd = await req.formData();
    const file = fd.get("file"); const caption = String(fd.get("caption") || "");
    if (!file || typeof file === "string") return ERR("no file");
    if (file.size > 8 * 1024 * 1024) return ERR("That image is too large (8 MB max).");
    const id = uid(), key = `${U}/${id}`, bytes = await file.arrayBuffer();
    await media.put(env, key, bytes, file.type || "image/jpeg");
    await env.DB.prepare("INSERT INTO notes (id,user_id,text,kind,media_key,status,created_at) VALUES (?,?,?,'photo',?,'pending',?)").bind(id, U, caption, key, Date.now()).run();
    ctx.waitUntil((async () => {
      try { const t = await readImage(env, bytes, file.type || "image/jpeg"); await env.DB.prepare("UPDATE notes SET ocr_text=? WHERE id=?").bind(t || null, id).run(); } catch (e) { console.log("ocr", e.message); }
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
      const b = await req.json();
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
    return new Response(o.body, { headers: { "content-type": o.type || "image/jpeg", "cache-control": "private, max-age=86400" } });
  }

  // ---- cards
  if (p === "/api/cards" && m === "GET") return J({ cards: await cardsFor(env, U, url.searchParams.get("type")) });
  if ((mm = p.match(/^\/api\/cards\/(\w+)$/))) {
    const c = await env.DB.prepare("SELECT * FROM cards WHERE id=? AND user_id=?").bind(mm[1], U).first();
    if (!c) return ERR("not found", 404);
    if (m === "PATCH") { const b = await req.json(); await env.DB.prepare("UPDATE cards SET heart=? WHERE id=?").bind(Math.max(-1, Math.min(1, +b.heart || 0)), c.id).run(); }
    if (m === "DELETE") {
      await env.DB.batch([env.DB.prepare("DELETE FROM footprints WHERE card_id=?").bind(c.id), env.DB.prepare("DELETE FROM cards WHERE id=?").bind(c.id)]);
      return J({ ok: true });
    }
    const fps = ((await env.DB.prepare(`SELECT f.*, n.text note_text, n.media_key FROM footprints f LEFT JOIN notes n ON n.id=f.note_id WHERE f.card_id=? ORDER BY f.created_at DESC`).bind(c.id).all()).results || [])
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
    return J({ items: rows.map((r) => ({ id: r.id, note_id: r.note_id, sentence: r.text, mention: r.mention, guesses: JSON.parse(r.guesses || "[]") })) });
  }
  if (p === "/api/inbox/accept_all" && m === "POST") {
    const rows = (await env.DB.prepare("SELECT id FROM inbox WHERE user_id=? AND status='open'").bind(U).all()).results || [];
    for (const r of rows) await inboxAct(env, U, r.id, { action: "accept" });
    return J({ ok: true, accepted: rows.length });
  }
  if ((mm = p.match(/^\/api\/inbox\/(\w+)$/)) && m === "POST") return J(await inboxAct(env, U, mm[1], await req.json()));

  // ---- threads
  if (p === "/api/threads" && m === "GET") {
    const cards = (await cardsFor(env, U)).filter((c) => c.heart >= 0 && (c.footprints >= 2 || c.heart === 1));
    const byTag = new Map();
    for (const c of cards) for (const t of c.tags) { if (!byTag.has(t)) byTag.set(t, []); byTag.get(t).push(c); }
    const threads = [...byTag.entries()]
      .filter(([, cs]) => new Set(cs.map((c) => c.type)).size >= 2 && cs.length >= 2)
      .sort((a, b) => b[1].reduce((s, c) => s + c.footprints, 0) - a[1].reduce((s, c) => s + c.footprints, 0))
      .slice(0, 6)
      .map(([tag, cs]) => ({ tag, cards: cs.map((c) => ({ id: c.id, name: c.name, type: c.type, footprints: c.footprints })), read: `This shows up in ${[...new Set(cs.map((c) => ({ film: "a film", tv: "a show", music: "an artist", book: "a book", place: "a place" }[c.type] || "something")))].join(", ").replace(/, ([^,]*)$/, " and $1")} you keep returning to.` }));
    return J({ threads, reason: threads.length ? undefined : "Threads show up once a few things keep coming back." });
  }

  // ---- plans
  if (p === "/api/plan" && m === "POST") {
    const b = await req.json();
    const { readable, writable } = new TransformStream();
    const w = writable.getWriter(), enc = new TextEncoder();
    const send = (o) => w.write(enc.encode(JSON.stringify(o) + "\n"));
    ctx.waitUntil((async () => {
      const logs = [];
      try {
        if (b.area && b.area !== user.area) await env.DB.prepare("UPDATE users SET area=? WHERE id=?").bind(b.area, U).run();
        const plan = await makePlan(env, user, b, (t) => { logs.push(t); send({ type: "log", text: t }); });
        plan.log = logs;
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
    const b = m === "POST" ? await req.json().catch(() => ({})) : {};
    if (!act && m === "GET") return J({ plan: { ...plan, saved: !!row.saved } });
    if (act === "save") { await env.DB.prepare("UPDATE plans SET saved=1 WHERE id=?").bind(row.id).run(); return J({ plan: { ...plan, saved: true } }); }
    if (act === "went") {
      await env.DB.prepare("UPDATE plans SET went=? WHERE id=?").bind(b.went ? 1 : 0, row.id).run();
      if (b.went && b.text) {
        const nid = uid(), now = Date.now();
        await env.DB.prepare("INSERT INTO notes (id,user_id,text,kind,status,created_at) VALUES (?,?,?,'text','pending',?)").bind(nid, U, b.text, now).run();
        const stop = plan.stops[0];
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
        const i = +b.index || 0, kind = stops[i]?.kind;
        const used = new Set([...(plan.swapped || []), ...stops.map((s) => s.qloo_id)]);
        const pl = pool.find((x) => x.kind === kind) || pool[i] || { items: [] };
        const next = pl.items.find((c) => !used.has(c.qloo_id));
        if (!next) return J({ plan, notice: "That's every good option I found for this stop." });
        plan.swapped = [...(plan.swapped || []), stops[i].qloo_id];
        stops[i] = { ...next, kind };
      } else if (act === "shorten") {
        if (stops.length > 1) stops = stops.slice(0, stops.length - 1);
        else return J({ plan, notice: "It's already one stop." });
      } else if (act === "budget") {
        const nb = Number(b.budget) || Math.max(10, (plan.meta?.budget || 40) - 15);
        const maxP = nb <= 20 ? 1 : nb <= 40 ? 2 : 3;
        const fits = (s) => !s.price_level || s.price_level <= maxP;
        stops = stops.map((s, i) => (fits(s) ? s : ((pool.find((x) => x.kind === s.kind) || { items: [] }).items.find((c) => fits(c) && !stops.some((o) => o.qloo_id === c.qloo_id)) && { ...(pool.find((x) => x.kind === s.kind).items.find((c) => fits(c) && !stops.some((o) => o.qloo_id === c.qloo_id))), kind: s.kind }) || null)).filter(Boolean);
        plan.meta = { ...plan.meta, budget: nb };
        if (!stops.length) return J({ plan, notice: "Nothing I found fits that budget. Try a wider area." });
      }
      const seeds = plan.seeds || [];
      const re = await dressPlan(env, user, seeds, stops, plan.meta);
      plan = { ...plan, header: re.header, stops: re.stops };
      await env.DB.prepare("UPDATE plans SET plan=? WHERE id=?").bind(JSON.stringify(plan), row.id).run();
      return J({ plan: { ...plan, saved: !!row.saved } });
    }
  }

  // ---- settings
  if (p === "/api/export" && m === "GET") {
    const q = (sql) => env.DB.prepare(sql).bind(U).all().then((r) => r.results || []);
    const data = { exported_at: new Date().toISOString(), notes: await q("SELECT id,text,kind,link,ocr_text,created_at FROM notes WHERE user_id=?"), cards: await q("SELECT id,qloo_id,name,type,year,heart FROM cards WHERE user_id=?"), footprints: await q("SELECT card_id,note_id,kind,sentiment,created_at,source FROM footprints WHERE user_id=?"), plans: await q("SELECT plan,saved,went,created_at FROM plans WHERE user_id=? AND saved=1") };
    return new Response(JSON.stringify(data, null, 2), { headers: { "content-type": "application/json", "content-disposition": "attachment; filename=sparkling-export.json" } });
  }
  if (p === "/api/delete" && m === "POST") {
    const b = await req.json();
    if (b.confirm !== "DELETE") return ERR("Type DELETE to confirm.");
    const media = (await env.DB.prepare("SELECT media_key FROM notes WHERE user_id=? AND media_key IS NOT NULL").bind(U).all()).results || [];
    for (const r of media) await media.del(env, r.media_key);
    await env.DB.batch(["notes", "cards", "footprints", "inbox", "mappings", "plans"].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE user_id=?`).bind(U)).concat([env.DB.prepare("DELETE FROM users WHERE id=?").bind(U)]));
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
  const g = guesses.find((x) => x.qloo_id === b.qloo_id) || guesses[0];
  if (!g) return { error: "no guess" };
  const cardId = await upsertCard(env, U, g, Date.now());
  const fp = await addFootprint(env, U, cardId, it.note_id, { kind: it.kind, sentiment: it.sentiment }, it.note_at);
  await env.DB.prepare("INSERT OR REPLACE INTO mappings (user_id,surface,qloo_id) VALUES (?,?,?)").bind(U, norm(it.mention), g.qloo_id).run();
  await env.DB.prepare("UPDATE inbox SET status='accepted', resolved_card=?, resolved_fp=? WHERE id=?").bind(cardId, fp, id).run();
  await setMention("matched", cardId);
  return { ok: true, card_id: cardId };
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/")) return await api(req, env, ctx, url);
      return new Response(APP, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
    } catch (e) {
      console.log("error", e.message, e.stack);
      return ERR("Something went wrong. Your notes are safe.", 500);
    }
  },
};
