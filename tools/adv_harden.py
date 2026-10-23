"""Hardening patch from the adversarial suite (tests/adversarial). Anchor-based: aborts without writing if any anchor is missing.
Usage: python3 tools/adv_harden.py [--dry]"""
import sys, os
ROOT = os.path.join(os.path.dirname(__file__), "..")
DRY = "--dry" in sys.argv
P = []  # (file, old, new, count)
def rep(f, old, new, count=1): P.append((f, old, new, count))

# ---------------- index.js ----------------
I = "src/index.js"
rep(I, """function cookie(req, name) {
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}""", """function cookie(req, name) {
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch (_) { return null; } // malformed %-escapes = no session, not a 500
}
// Request bodies: a JSON object or null (bad JSON, arrays, strings, null all count as malformed).
async function readJSON(req) {
  try { const b = await req.json(); return b && typeof b === "object" && !Array.isArray(b) ? b : null; } catch (_) { return null; }
}
const BAD_BODY = () => ERR("That request was not readable.", 400);
const IMAGE_TYPES = /^image\\/(jpeg|png|webp|gif|heic|heif|avif)$/;
const strField = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : undefined);""")
rep(I, """    const body = await req.json().catch(() => ({}));
    const token = uid() + uid(), id = uid();""", """    const body = (await readJSON(req)) || {};
    const token = uid() + uid(), id = uid();""")
rep(I, """  if (p === "/api/signout" && m === "POST") return J({ ok: true }, 200, { "set-cookie": "sp=; Path=/; Max-Age=0" });""",
    """  if (p === "/api/signout" && m === "POST") return J({ ok: true }, 200, { "set-cookie": "sp=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0" });""")
rep(I, """  if (p === "/api/me" && m === "PATCH") {
    const b = await req.json();
    await env.DB.prepare("UPDATE users SET area=COALESCE(?,area), budget=COALESCE(?,budget), whenx=COALESCE(?,whenx) WHERE id=?")
      .bind(b.area ?? null, b.budget ?? null, b.when ?? null, U).run();""", """  if (p === "/api/me" && m === "PATCH") {
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
      .bind(strField(b.area, 120) ?? null, budget, strField(b.when, 80) ?? null, U).run();""")
rep(I, """  if (p === "/api/notes" && m === "POST") {
    const b = await req.json();
    const text = String(b.text || "").slice(0, 5000);""", """  if (p === "/api/notes" && m === "POST") {
    const b = await readJSON(req);
    if (!b) return BAD_BODY();
    const text = (typeof b.text === "string" || typeof b.text === "number" ? String(b.text) : "").slice(0, 5000);""")
rep(I, """    const fd = await req.formData();
    const file = fd.get("file"); const caption = String(fd.get("caption") || "");
    if (!file || typeof file === "string") return ERR("no file");
    if (file.size > 8 * 1024 * 1024) return ERR("That image is too large (8 MB max).");""", """    let fd;
    try { fd = await req.formData(); } catch (_) { return ERR("no file"); }
    const file = fd.get("file"); const caption = String(fd.get("caption") || "").slice(0, 5000);
    if (!file || typeof file === "string") return ERR("no file");
    if (file.size > 8 * 1024 * 1024) return ERR("That image is too large (8 MB max).");
    if (!IMAGE_TYPES.test(file.type || "")) return ERR("That file is not a photo (JPEG, PNG, WebP, GIF or HEIC).");""")
rep(I, """    if (m === "PATCH") {
      const b = await req.json();
      await env.DB.batch([""", """    if (m === "PATCH") {
      const b = await readJSON(req);
      if (!b || typeof b.text !== "string") return BAD_BODY();
      if (!b.text.trim()) return ERR("empty"); // never wipe a note through an edit
      b.text = b.text.slice(0, 5000);
      await env.DB.batch([""")
rep(I, """    if (!mm[1].startsWith(U + "/")) return ERR("not found", 404);
    const o = await media.get(env, mm[1]);
    if (!o) return ERR("not found", 404);
    return new Response(o.body, { headers: { "content-type": o.type || "image/jpeg", "cache-control": "private, max-age=86400" } });""",
    """    if (!mm[1].startsWith(U + "/")) return ERR("not found", 404);
    const o = await media.get(env, mm[1]);
    if (!o) return ERR("not found", 404);
    const type = IMAGE_TYPES.test(o.type || "") ? o.type : "application/octet-stream"; // older uploads were not type-checked
    return new Response(o.body, { headers: { "content-type": type, "cache-control": "private, max-age=86400", "content-security-policy": "default-src 'none'; sandbox", ...(type.startsWith("image/") ? {} : { "content-disposition": "attachment" }) } });""")
rep(I, """    if (m === "PATCH") { const b = await req.json(); await env.DB.prepare("UPDATE cards SET heart=? WHERE id=?").bind(Math.max(-1, Math.min(1, +b.heart || 0)), c.id).run(); }""",
    """    if (m === "PATCH") { const b = await readJSON(req); if (!b) return BAD_BODY(); await env.DB.prepare("UPDATE cards SET heart=? WHERE id=?").bind(Math.max(-1, Math.min(1, Math.round(+b.heart) || 0)), c.id).run(); }""")
rep(I, """  if ((mm = p.match(/^\\/api\\/inbox\\/(\\w+)$/)) && m === "POST") return J(await inboxAct(env, U, mm[1], await req.json()));""",
    """  if ((mm = p.match(/^\\/api\\/inbox\\/(\\w+)$/)) && m === "POST") {
    const b = await readJSON(req);
    if (!b) return BAD_BODY();
    const r = await inboxAct(env, U, mm[1], b);
    return J(r, r.error === "not found" ? 404 : r.error ? 400 : 200);
  }""")
rep(I, """  if (p === "/api/plan" && m === "POST") {
    const b = await req.json();""", """  if (p === "/api/plan" && m === "POST") {
    const b = await readJSON(req);
    if (!b) return BAD_BODY();
    if (b.area != null && typeof b.area !== "string") return ERR("area must be text");
    if (typeof b.area === "string") b.area = b.area.trim().slice(0, 120);
    if (b.text != null) b.text = String(b.text).slice(0, 1000);""")
rep(I, """    const b = m === "POST" ? await req.json().catch(() => ({})) : {};""", """    if (act && m !== "POST") return ERR("not found", 404); // plan actions change state: POST only
    const b = m === "POST" ? (await readJSON(req)) || {} : {};""")
rep(I, """      if (b.went && b.text) {
        const nid = uid(), now = Date.now();
        await env.DB.prepare("INSERT INTO notes (id,user_id,text,kind,status,created_at) VALUES (?,?,?,'text','pending',?)").bind(nid, U, b.text, now).run();
        const stop = plan.stops[0];""", """      const stop = (plan.stops || [])[0];
      if (b.went && typeof b.text === "string" && b.text.trim() && stop) {
        b.text = b.text.slice(0, 5000);
        const nid = uid(), now = Date.now();
        await env.DB.prepare("INSERT INTO notes (id,user_id,text,kind,status,created_at) VALUES (?,?,?,'text','pending',?)").bind(nid, U, b.text, now).run();""")
rep(I, """        const i = +b.index || 0, kind = stops[i]?.kind;""", """        const i = Number.isInteger(+b.index) ? +b.index : 0, kind = stops[i]?.kind;
        if (i < 0 || i >= stops.length) return ERR("There is no such stop.");""")
rep(I, """        const nb = Number(b.budget) || Math.max(10, (plan.meta?.budget || 40) - 15);""", """        const asked = typeof b.budget === "number" || typeof b.budget === "string" ? Number(b.budget) : NaN;
        const nb = Number.isFinite(asked) && asked > 0 ? Math.min(Math.round(asked), 100000) : Math.max(10, (plan.meta?.budget || 40) - 15);""")
rep(I, """    if (ct.includes("multipart")) { const f = (await req.formData()).get("file"); if (!f || typeof f === "string") return ERR("Choose your export file."); if (f.size > 3e6) return ERR("That file is too large."); csv = await f.text(); }
    else csv = await req.text();""", """    if (+(req.headers.get("content-length") || 0) > 3.5e6) return ERR("That file is too large.");
    if (ct.includes("multipart")) { let f; try { f = (await req.formData()).get("file"); } catch (_) { return ERR("Choose your export file."); } if (!f || typeof f === "string") return ERR("Choose your export file."); if (f.size > 3e6) return ERR("That file is too large."); csv = await f.text(); }
    else { csv = await req.text(); if (csv.length > 3e6) return ERR("That file is too large."); }""")
rep(I, """    const stars = (r) => (r == null ? "" : " · " + "★".repeat(Math.floor(r)) + (r % 1 ? "½" : ""));""",
    """    const stars = (r) => (r == null || !Number.isFinite(r) ? "" : " · " + "★".repeat(Math.max(0, Math.min(5, Math.floor(r)))) + (r % 1 ? "½" : ""));""")
rep(I, """  if (p === "/api/delete" && m === "POST") {
    const b = await req.json();""", """  if (p === "/api/delete" && m === "POST") {
    const b = (await readJSON(req)) || {};""")
rep(I, """export default {
  async fetch(req, env, ctx) {""", """const app = {
  async fetch(req, env, ctx) {""")
APPEND = {I: """
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
"""}

# ---------------- recognize.js ----------------
R = "src/recognize.js"
rep(R, """    if (!m || !m.surface || !text.includes(m.surface)) return false;""", """    if (!m || typeof m.surface !== "string" || !m.surface.trim() || !text.includes(m.surface)) return false;""")
rep(R, """  const r = await fetch(`${BASE}/search?${qs}`, { headers: { "X-Api-Key": env.QLOO_API_KEY, accept: "application/json" } });""",
    """  const r = await fetch(`${BASE}/search?${qs}`, { headers: { "X-Api-Key": env.QLOO_API_KEY, accept: "application/json" }, signal: AbortSignal.timeout(+env.QLOO_TIMEOUT_MS || 10000) });""")
rep(R, """export function parseLetterboxd(csv) {
  const rows = [];""", """export function parseLetterboxd(csv) {
  csv = String(csv || "").replace(/^\\uFEFF/, "");
  const rows = [];""")
rep(R, """  return rows.filter((r) => r[iName]).map((r) => ({
    title: r[iName].trim(), year: iYear >= 0 ? r[iYear] : undefined,
    rating: iRating >= 0 && r[iRating] ? Number(r[iRating]) : null,""", """  const rate = (v) => { const n = v ? Number(v) : NaN; return Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : null; };
  return rows.filter((r) => (r[iName] || "").trim()).map((r) => ({
    title: r[iName].trim(), year: iYear >= 0 ? r[iYear] : undefined,
    rating: iRating >= 0 ? rate(r[iRating]) : null,""")

# ---------------- qloo.js ----------------
Q = "src/qloo.js"
rep(Q, """      res = await fetch(url, { headers: { "X-Api-Key": env.QLOO_API_KEY, accept: "application/json" } });""",
    """      res = await fetch(url, { headers: { "X-Api-Key": env.QLOO_API_KEY, accept: "application/json" }, signal: AbortSignal.timeout(+env.QLOO_TIMEOUT_MS || 10000) });""")
rep(Q, """  const domain = DOMAIN_BY_URN[e.subtype] || DOMAIN_BY_URN[(e.types || [])[0]] || (e.subtype || "").split(":").pop();""",
    """  const types = Array.isArray(e.types) ? e.types : [];
  const domain = DOMAIN_BY_URN[e.subtype] || DOMAIN_BY_URN[types[0]] || String(e.subtype || "").split(":").pop();""")
rep(Q, """    tags: (e.tags || [])
      .filter((t) => /genre|style|theme|mood|subgenre|audience/.test(t.type || t.subtype || "") && !/^(Place|Shopping|Restaurant)$/.test(t.name))""",
    """    tags: (Array.isArray(e.tags) ? e.tags : [])
      .filter((t) => t && typeof t.name === "string" && /genre|style|theme|mood|subgenre|audience/.test(t.type || t.subtype || "") && !/^(Place|Shopping|Restaurant)$/.test(t.name))""")
rep(Q, """  const dedupe = (arr) => {
    const seen = new Set();
    return arr.filter((t) => {
      const k = t.name.toLowerCase();""", """  const dedupe = (arr) => {
    const seen = new Set();
    return arr.filter((t) => {
      if (typeof t.name !== "string") return false;
      const k = t.name.toLowerCase();""")
rep(Q, """    take: Math.min(Math.max(take, 1), 30) + (exclude_ids?.length || 0),""", """    take: Math.min(Math.max(Number(take) || 6, 1), 30) + (exclude_ids?.length || 0),""")

# ---------------- plan.js ----------------
L = "src/plan.js"
rep(L, """  const r = await fetch(`${BASE}${path}?${qs}`, { headers: { "X-Api-Key": env.QLOO_API_KEY, accept: "application/json" } });""",
    """  const r = await fetch(`${BASE}${path}?${qs}`, { headers: { "X-Api-Key": env.QLOO_API_KEY, accept: "application/json" }, signal: AbortSignal.timeout(+env.QLOO_TIMEOUT_MS || 10000) });""")
rep(L, """  return 2 * R * Math.asin(Math.sqrt(x));
}""", """  const d = 2 * R * Math.asin(Math.sqrt(x));
  return Number.isFinite(d) ? d : null;
}""")
rep(L, """  const budget = Number(req.budget || user.budget || 40);""", """  const num = (v) => { const n = typeof v === "number" || (typeof v === "string" && v.trim()) ? Number(v) : NaN; return Number.isFinite(n) && n > 0 ? Math.min(n, 100000) : null; };
  const budget = num(req.budget) ?? num(user.budget) ?? 40;""")
rep(L, """  if (!h || !h.length) return "Hours not listed";
  if (h[0].closed) return""", """  if (!Array.isArray(h) || !h.length || !h[0]) return "Hours not listed";
  if (h[0].closed) return""")
rep(L, """  return `Qloo lists ${cap} ${h.map((x) => `${t(x.opens)}–${t(x.closes)}`).join(", ")} · not live-checked`;""",
    """  return `Qloo lists ${cap} ${h.filter(Boolean).map((x) => `${t(x.opens)}–${t(x.closes)}`).join(", ")} · not live-checked`;""")

# ---------------- app.html ----------------
A = "src/app.html"
rep(A, """  let out = ZH[key];
  if (out == null) {""", """  let out = Object.prototype.hasOwnProperty.call(ZH, key) ? ZH[key] : null; // "constructor"/"toString" are not UI strings
  if (out == null) {""")

files = {}
bad = []
for f, old, new, count in P:
    if f not in files: files[f] = open(os.path.join(ROOT, f), encoding="utf-8").read()
    n = files[f].count(old)
    if n != count:
        if files[f].count(new.split("\n")[0]) and new.split("\n")[0] != old.split("\n")[0]:
            print("already applied?", f, old.split("\n")[0][:70]); continue
        bad.append((f, n, old.split("\n")[0][:90])); continue
    files[f] = files[f].replace(old, new)
if bad:
    for b in bad: print("ANCHOR MISSING", b)
    sys.exit(1)
for f, extra in APPEND.items():
    if "Added by the adversarial suite" not in files[f]: files[f] += extra
if not DRY:
    for f, s in files.items(): open(os.path.join(ROOT, f), "w", encoding="utf-8").write(s)
print(("dry-run ok" if DRY else "applied"), len(P), "patches to", sorted(files))
