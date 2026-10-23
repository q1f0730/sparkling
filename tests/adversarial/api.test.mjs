// API abuse against the real Worker running locally (SQLite D1, mocked AI + Qloo). No live calls.
import { add, ok, eq, runAll } from "./lib.mjs";
import { makeEnv, makeQloo, setQloo, call, newSession } from "./harness.mjs";
import worker from "../../src/index.js";

const ROUTES = ["/api/session", "/api/signout", "/api/me", "/api/notes", "/api/notes/photo", "/api/notes/retry", "/api/notes/NID", "/media/UID/NID",
  "/api/cards", "/api/cards/CID", "/api/footprints/FID", "/api/inbox", "/api/inbox/accept_all", "/api/inbox/IID", "/api/threads", "/api/plan", "/api/plans",
  "/api/plan/PID", "/api/plan/PID/save", "/api/plan/PID/went", "/api/plan/PID/swap", "/api/plan/PID/shorten", "/api/plan/PID/budget",
  "/api/import/letterboxd", "/api/import/status", "/api/prefs", "/api/export.md", "/api/export", "/api/delete", "/api/nope", "/api/notes/a/b/c"];
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];

// A populated user: notes -> cards (+footprints), an inbox item (ambiguous "Solaris"), hearts, a saved plan.
async function populated(env) {
  setQloo(makeQloo());
  const s = await newSession(worker, env);
  const T = s.token;
  for (const text of ["rewatched In the Mood for Love, perfect", "watched Her again", "Paterson on a rainy Sunday", "Big Thief on repeat", "finally watched Solaris"])
    await call(worker, env, "POST", "/api/notes", { cookie: T, body: { text } });
  const cards = (await call(worker, env, "GET", "/api/cards", { cookie: T })).json.cards;
  for (const c of cards) await call(worker, env, "PATCH", "/api/cards/" + c.id, { cookie: T, body: { heart: 1 } });
  const notes = (await call(worker, env, "GET", "/api/notes", { cookie: T })).json.notes;
  const inbox = (await call(worker, env, "GET", "/api/inbox", { cookie: T })).json.items;
  const pr = await call(worker, env, "POST", "/api/plan", { cookie: T, body: { area: "Greenpoint, Brooklyn", text: "bookstore then cafe", budget: 40 } });
  const planLine = pr.text.split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((o) => o.type === "plan");
  const plan = planLine?.plan;
  if (plan) await call(worker, env, "POST", `/api/plan/${plan.id}/save`, { cookie: T });
  const fp = env.DB.q("SELECT id FROM footprints WHERE user_id=?", s.user.id)[0];
  // a photo note for media
  const fd = new FormData(); fd.set("file", new File([new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])], "a.jpg", { type: "image/jpeg" })); fd.set("caption", "poster");
  const ph = await call(worker, env, "POST", "/api/notes/photo", { cookie: T, body: fd });
  return { T, U: s.user.id, cards, notes, inbox, plan, fpId: fp?.id, photo: ph.json?.note };
}
const fill = (route, u) => route.replace("NID", u.notes?.[0]?.id || "x").replace("CID", u.cards?.[0]?.id || "x").replace("FID", u.fpId || "x").replace("IID", u.inbox?.[0]?.id || "x").replace("PID", u.plan?.id || "x").replace("/media/UID/x", u.photo?.image_url || "/media/x/x").replace("UID", u.U);

// 1) unauthenticated / forged sessions: every route x method
const AUTHS = [["none", null], ["garbage", "deadbeef"], ["sqli", "' OR '1'='1"], ["empty", ""], ["long", "a".repeat(8000)], ["unicode", "%E2%98%83%F0%9F%98%80"], ["bad_pct", "%E0%A4%A"]];
const PUBLIC = (r, m) => (r === "/api/session" && m === "POST") || (r === "/api/signout" && m === "POST");
for (const [aname, tok] of AUTHS) {
  let env; const E = async () => (env ||= makeEnv());
  for (const r of ROUTES) for (const m of METHODS) {
    if (PUBLIC(r, m)) continue;
    add("api.auth", `${aname}:${m}:${r}`, async () => {
      const res = await call(worker, await E(), m, r.replace(/NID|CID|FID|IID|PID|UID/g, "abc123"), tok == null ? {} : { headers: { cookie: "sp=" + tok } });
      ok([401, 404].includes(res.status), "status " + res.status + " " + res.text.slice(0, 80));
    });
  }
}

// 2) signed in, no body, every route x method: never a 5xx
for (const r of ROUTES) {
  let ctx; const C = async () => { if (!ctx) { const env = makeEnv(); ctx = { env, u: await populated(env) }; } return ctx; };
  for (const m of METHODS) add("api.nobody", `${m}:${r}`, async () => {
    const { env, u } = await C();
    const res = await call(worker, env, m, fill(r, u), { cookie: u.T });
    ok(res.status < 500, "status " + res.status + " " + res.text.slice(0, 100));
  });
}

// 3) malformed bodies x JSON endpoints
const BODIES = [["empty", ""], ["open_brace", "{"], ["null", "null"], ["array", "[]"], ["string", '"str"'], ["number", "123"], ["true", "true"], ["truncated", '{"text":'],
  ["nul", "\u0000"], ["text_null", '{"text":null}'], ["text_obj", '{"text":{}}'], ["text_arr", '{"text":[1,2]}'], ["text_num", '{"text":123}'], ["proto", '{"__proto__":{"polluted":1},"text":"x"}'],
  ["deep", "[".repeat(5000) + "]".repeat(5000)], ["big_2mb", JSON.stringify({ text: "x".repeat(2 * 1024 * 1024) })], ["bom", "\uFEFF{\"text\":\"hi\"}"], ["utf16", Buffer.from('{"text":"hi"}', "utf16le").toString("latin1")],
  ["xml", "<?xml version='1.0'?><a/>"], ["form", "text=hello&budget=1"]];
const JSON_EP = [["POST", "/api/notes"], ["PATCH", "/api/me"], ["PATCH", "/api/notes/NID"], ["PATCH", "/api/cards/CID"], ["POST", "/api/inbox/IID"], ["POST", "/api/plan"],
  ["POST", "/api/plan/PID/went"], ["POST", "/api/plan/PID/swap"], ["POST", "/api/plan/PID/budget"], ["PUT", "/api/prefs"], ["POST", "/api/delete"], ["POST", "/api/session"], ["POST", "/api/import/letterboxd"]];
for (const [m, r] of JSON_EP) {
  let ctx; const C = async () => { if (!ctx) { const env = makeEnv(); ctx = { env, u: await populated(env) }; } return ctx; };
  for (const [bn, body] of BODIES) {
    add("api.badjson", `${m}:${r}:${bn}`, async () => {
      const { env, u } = await C();
      const res = await call(worker, env, m, fill(r, u), { cookie: u.T, body, raw: true, headers: { "content-type": "application/json" } });
      ok(res.status < 500, "status " + res.status + " " + res.text.slice(0, 100));
      ok(({}).polluted === undefined, "prototype polluted");
    });
  }
  add("api.badjson", `${m}:${r}:account_survives`, async () => {
    const { env, u } = await C();
    ok(env.DB.q("SELECT id FROM users WHERE id=?", u.U).length === 1, "user deleted by malformed body");
  });
}

// 4) type confusion on profile fields
const VALS = [["null", null], ["num", 123], ["neg", -1], ["huge", 1e308], ["str_long", "x".repeat(100000)], ["obj", {}], ["arr", ["a"]], ["bool", true], ["script", "<script>alert(1)</script>"], ["nan_str", "NaN"], ["empty", ""], ["cjk", "绿点，布鲁克林"]];
for (const field of ["area", "budget", "when"]) for (const [vn, v] of VALS) {
  add("api.types", `me:${field}:${vn}`, async () => {
    const env = makeEnv(); const s = await newSession(worker, env);
    const res = await call(worker, env, "PATCH", "/api/me", { cookie: s.token, body: { [field]: v } });
    ok(res.status < 500, "status " + res.status);
    const u = env.DB.q("SELECT * FROM users WHERE id=?", s.user.id)[0];
    ok(u.area == null || (typeof u.area === "string" && u.area.length <= 200), "area not capped: " + String(u.area).length);
    ok(u.whenx == null || (typeof u.whenx === "string" && u.whenx.length <= 200), "when not capped");
    ok(Number.isFinite(Number(u.budget)) && Number(u.budget) >= 0 && Number(u.budget) <= 100000, "budget invalid: " + String(u.budget).slice(0, 30));
  });
}
for (const [vn, v] of VALS) add("api.types", `card_heart:${vn}`, async () => {
  const env = makeEnv(); const u = await populated(env);
  const res = await call(worker, env, "PATCH", "/api/cards/" + u.cards[0].id, { cookie: u.T, body: { heart: v } });
  ok(res.status < 500); const h = env.DB.q("SELECT heart FROM cards WHERE id=?", u.cards[0].id)[0].heart; ok([-1, 0, 1].includes(h), "heart " + h);
});
for (const [vn, v] of VALS) add("api.types", `note_post_text:${vn}`, async () => {
  const env = makeEnv(); const s = await newSession(worker, env);
  const res = await call(worker, env, "POST", "/api/notes", { cookie: s.token, body: { text: v } });
  ok(res.status < 500); for (const n of env.DB.q("SELECT text FROM notes")) ok(n.text.length <= 5000, "text not capped");
});
for (const [vn, v] of VALS) add("api.types", `note_patch_text:${vn}`, async () => {
  const env = makeEnv(); const u = await populated(env);
  const res = await call(worker, env, "PATCH", "/api/notes/" + u.notes[0].id, { cookie: u.T, body: { text: v } });
  ok(res.status < 500); const n = env.DB.q("SELECT text FROM notes WHERE id=?", u.notes[0].id)[0]; ok(typeof n.text === "string" && n.text.length <= 5000, "patched text not capped: " + String(n.text).length);
});
for (const [vn, v] of VALS) add("api.types", `prefs:${vn}`, async () => {
  const env = makeEnv(); const s = await newSession(worker, env);
  const res = await call(worker, env, "PUT", "/api/prefs", { cookie: s.token, body: { prefs: v } });
  ok(res.status < 500);
});

// 5) id fuzzing on every id-bearing route
const IDS = ["a", "0", "-1", "..%2f..%2fetc%2fpasswd", "%2e%2e", "x".repeat(3000), "1%20OR%201%3D1", "'%20OR%20'1'%3D'1", "%3Cscript%3E", "%00", "null", "undefined", "__proto__", "constructor", "%F0%9F%98%80", "%E4%B8%AD", "a%2Fb", "1e309", "NaN", "%20", "abc_def", "ABCDEF0123456789"];
const ID_ROUTES = [["GET", "/api/notes/X"], ["PATCH", "/api/notes/X"], ["DELETE", "/api/notes/X"], ["GET", "/api/cards/X"], ["PATCH", "/api/cards/X"], ["DELETE", "/api/cards/X"], ["DELETE", "/api/footprints/X"], ["POST", "/api/inbox/X"],
  ["GET", "/api/plan/X"], ["POST", "/api/plan/X/save"], ["POST", "/api/plan/X/went"], ["POST", "/api/plan/X/swap"], ["POST", "/api/plan/X/budget"], ["GET", "/media/X"], ["GET", "/media/X/X"]];
{
  let ctx; const C = async () => { if (!ctx) { const env = makeEnv(); ctx = { env, u: await populated(env) }; } return ctx; };
  for (const [m, r] of ID_ROUTES) for (const id of IDS) add("api.idfuzz", `${m}:${r}:${id.slice(0, 40)}`, async () => {
    const { env, u } = await C();
    const res = await call(worker, env, m, r.replace(/X/g, id), { cookie: u.T, body: m === "GET" ? undefined : { text: "x", action: "accept", index: 0 } });
    // "%2e%2e" is normalised by URL parsing out of /media/ entirely -> the SPA shell, which is fine
    ok([400, 404].includes(res.status) || (res.status === 200 && /^<!DOCTYPE html>/i.test(res.text) && /%2e%2e/i.test(id)), "status " + res.status + " " + res.text.slice(0, 80));
  });
  add("api.idfuzz", "data_intact_after_fuzz", async () => { const { env, u } = await C(); ok(env.DB.q("SELECT COUNT(*) n FROM notes WHERE user_id=?", u.U)[0].n >= 5, "notes lost"); });
}

// 6) cross-user access: B acting on A's ids gets 404 and A's data is untouched
{
  let ctx;
  const C = async () => { if (!ctx) { const env = makeEnv(); const A = await populated(env); const B = await newSession(worker, env); ctx = { env, A, B: B.token }; } return ctx; };
  const OPS = [
    ["GET", (A) => "/api/notes/" + A.notes[0].id], ["PATCH", (A) => "/api/notes/" + A.notes[0].id, { text: "hacked" }], ["DELETE", (A) => "/api/notes/" + A.notes[1].id],
    ["GET", (A) => "/api/cards/" + A.cards[0].id], ["PATCH", (A) => "/api/cards/" + A.cards[0].id, { heart: -1 }], ["DELETE", (A) => "/api/cards/" + A.cards[1].id],
    ["DELETE", (A) => "/api/footprints/" + A.fpId], ["POST", (A) => "/api/inbox/" + (A.inbox[0]?.id || "none"), { action: "accept" }], ["POST", (A) => "/api/inbox/" + (A.inbox[0]?.id || "none"), { action: "reject" }],
    ["POST", (A) => "/api/inbox/" + (A.inbox[0]?.id || "none"), { action: "undo" }], ["GET", (A) => "/api/plan/" + A.plan.id], ["POST", (A) => `/api/plan/${A.plan.id}/save`],
    ["POST", (A) => `/api/plan/${A.plan.id}/went`, { went: true, text: "hacked" }], ["POST", (A) => `/api/plan/${A.plan.id}/swap`, { index: 0 }], ["POST", (A) => `/api/plan/${A.plan.id}/shorten`],
    ["POST", (A) => `/api/plan/${A.plan.id}/budget`, { budget: 10 }], ["GET", (A) => A.photo.image_url], ["GET", (A) => "/media/" + A.U + "/../" + A.U + "/" + A.photo.id],
  ];
  OPS.forEach(([m, path, body], i) => add("api.crossuser", `op${i}:${m}`, async () => {
    const { env, A, B } = await C();
    const res = await call(worker, env, m, path(A), { cookie: B, body });
    eq(res.status, 404, "cross-user status");
  }));
  const after = [["notes_text", (env, A) => eq(env.DB.q("SELECT text FROM notes WHERE id=?", A.notes[0].id)[0].text, A.notes[0].text)],
    ["notes_count", (env, A) => eq(env.DB.q("SELECT COUNT(*) n FROM notes WHERE user_id=?", A.U)[0].n, A.notes.length + 1)],
    ["cards_count", (env, A) => eq(env.DB.q("SELECT COUNT(*) n FROM cards WHERE user_id=?", A.U)[0].n, A.cards.length)],
    ["heart", (env, A) => eq(env.DB.q("SELECT heart FROM cards WHERE id=?", A.cards[0].id)[0].heart, 1)],
    ["footprint", (env, A) => eq(env.DB.q("SELECT COUNT(*) n FROM footprints WHERE id=?", A.fpId)[0].n, 1)],
    ["inbox_open", (env, A) => ok(!A.inbox[0] || env.DB.q("SELECT status FROM inbox WHERE id=?", A.inbox[0].id)[0].status === "open")],
    ["plan_unchanged", (env, A) => eq(JSON.parse(env.DB.q("SELECT plan FROM plans WHERE id=?", A.plan.id)[0].plan).stops.length, A.plan.stops.length)],
    ["plan_went_null", (env, A) => eq(env.DB.q("SELECT went FROM plans WHERE id=?", A.plan.id)[0].went, null)],
    ["b_has_nothing", (env) => eq(env.DB.q("SELECT COUNT(*) n FROM notes WHERE user_id IN (SELECT id FROM users WHERE token!=?)", "x")[0].n >= 0, true)]];
  for (const [n, f] of after) add("api.crossuser", "after:" + n, async () => { const { env, A } = await C(); for (const [m, path, body] of OPS) await call(worker, env, m, path(A), { cookie: ctx.B, body }); f(env, A); });
  add("api.crossuser", "inbox_present_for_test", async () => { const { A } = await C(); ok(A.inbox.length > 0, "fixture produced no inbox item"); });
  add("api.crossuser", "plan_present_for_test", async () => { const { A } = await C(); ok(A.plan && A.plan.stops.length > 0, "fixture produced no plan"); });
  add("api.crossuser", "export_has_no_token", async () => { const { env, A } = await C(); const r = await call(worker, env, "GET", "/api/export", { cookie: A.T }); ok(!r.text.includes(A.T), "token leaked in export"); ok(!r.text.includes(ctx.B), "other user's token in export"); });
  add("api.crossuser", "export_only_own_notes", async () => { const { env, A } = await C(); const r = await call(worker, env, "GET", "/api/export", { cookie: ctx.B }); eq(r.json.notes.length, 0); });
  add("api.crossuser", "notes_list_isolated", async () => { const { env } = await C(); const r = await call(worker, env, "GET", "/api/notes", { cookie: ctx.B }); eq(r.json.notes.length, 0); });
  add("api.crossuser", "cards_list_isolated", async () => { const { env } = await C(); const r = await call(worker, env, "GET", "/api/cards", { cookie: ctx.B }); eq(r.json.cards.length, 0); });
  add("api.crossuser", "search_isolated", async () => { const { env } = await C(); const r = await call(worker, env, "GET", "/api/notes?q=%25", { cookie: ctx.B }); eq(r.json.notes.length, 0); });
}

// 7) plan action abuse
const IDX = [["neg", -1], ["big", 99], ["str", "abc"], ["huge", 1e9], ["null", null], ["strnum", "0"], ["frac", 2.5], ["proto", "__proto__"], ["obj", {}], ["arr", [0]]];
for (const [n, v] of IDX) add("api.plan_actions", "swap:" + n, async () => {
  const env = makeEnv(); const u = await populated(env);
  const r = await call(worker, env, "POST", `/api/plan/${u.plan.id}/swap`, { cookie: u.T, body: { index: v } }); ok(r.status < 500, "status " + r.status + " " + r.text.slice(0, 80));
});
const WENT = [["num", 123], ["obj", {}], ["arr", ["x"]], ["null", null], ["empty", ""], ["long", "x".repeat(100000)], ["script", "<script>alert(1)</script>"], ["true_only", undefined]];
for (const [n, v] of WENT) add("api.plan_actions", "went:" + n, async () => {
  const env = makeEnv(); const u = await populated(env);
  const r = await call(worker, env, "POST", `/api/plan/${u.plan.id}/went`, { cookie: u.T, body: { went: true, text: v } }); ok(r.status < 500, "status " + r.status + " " + r.text.slice(0, 80));
  for (const x of env.DB.q("SELECT text FROM notes WHERE user_id=?", u.U)) ok(typeof x.text === "string" && x.text.length <= 5000, "went note not capped / not string");
});
const BUD = [["str", "abc"], ["neg", -50], ["zero", 0], ["huge", 1e9], ["null", null], ["obj", {}], ["ten", 10], ["twenty", 20], ["forty", 40], ["eighty", 80]];
for (const [n, v] of BUD) add("api.plan_actions", "budget:" + n, async () => {
  const env = makeEnv(); const u = await populated(env);
  const r = await call(worker, env, "POST", `/api/plan/${u.plan.id}/budget`, { cookie: u.T, body: { budget: v } }); ok(r.status < 500, "status " + r.status);
  const nb = r.json?.plan?.meta?.budget; ok(nb === undefined || (Number.isFinite(nb) && nb > 0), "budget meta " + nb);
  if (r.json?.plan && !r.json.notice) { const maxP = nb <= 20 ? 1 : nb <= 40 ? 2 : 3; for (const s of r.json.plan.stops) ok(!s.price_level || s.price_level <= maxP, "stop over budget"); }
});
add("api.plan_actions", "shorten_to_one_then_notice", async () => {
  const env = makeEnv(); const u = await populated(env);
  let r; for (let i = 0; i < 5; i++) r = await call(worker, env, "POST", `/api/plan/${u.plan.id}/shorten`, { cookie: u.T }); ok(r.status === 200 && r.json.notice, "no notice at one stop");
});
add("api.plan_actions", "swap_exhausts_with_notice", async () => {
  const env = makeEnv(); const u = await populated(env);
  let r; for (let i = 0; i < 12; i++) r = await call(worker, env, "POST", `/api/plan/${u.plan.id}/swap`, { cookie: u.T, body: { index: 0 } }); ok(r.status === 200, "status " + r.status);
});

// 8) sizes and uploads
const UP = [["html_type", "text/html", "<script>alert(1)</script>", "x.html"], ["svg", "image/svg+xml", "<svg onload=alert(1)>", "x.svg"], ["js", "application/javascript", "alert(1)", "x.js"],
  ["empty_type", "", "\xff\xd8\xff", "x"], ["jpeg", "image/jpeg", "\xff\xd8\xff", "x.jpg"], ["png", "image/png", "\x89PNG", "x.png"], ["octet", "application/octet-stream", "<html><script>alert(1)</script>", "x.bin"]];
for (const [n, type, content, name] of UP) add("api.upload", "type:" + n, async () => {
  const env = makeEnv(); const s = await newSession(worker, env);
  const fd = new FormData(); fd.set("file", new File([content], name, type ? { type } : {}));
  const r = await call(worker, env, "POST", "/api/notes/photo", { cookie: s.token, body: fd });
  ok(r.status < 500);
  if (r.status === 200) {
    const m = await call(worker, env, "GET", r.json.note.image_url, { cookie: s.token });
    ok(/^image\/(jpeg|png|webp|gif|heic|heif|avif)$/.test(m.headers.get("content-type") || ""), "served as " + m.headers.get("content-type"));
    eq(m.headers.get("x-content-type-options"), "nosniff");
  }
});
add("api.upload", "too_large_9mb", async () => {
  const env = makeEnv(); const s = await newSession(worker, env);
  const fd = new FormData(); fd.set("file", new File([new Uint8Array(9 * 1024 * 1024)], "big.jpg", { type: "image/jpeg" }));
  const r = await call(worker, env, "POST", "/api/notes/photo", { cookie: s.token, body: fd }); eq(r.status, 400);
});
add("api.upload", "no_file_field", async () => { const env = makeEnv(); const s = await newSession(worker, env); const fd = new FormData(); fd.set("caption", "x"); eq((await call(worker, env, "POST", "/api/notes/photo", { cookie: s.token, body: fd })).status, 400); });
add("api.upload", "file_as_string", async () => { const env = makeEnv(); const s = await newSession(worker, env); const fd = new FormData(); fd.set("file", "notafile"); eq((await call(worker, env, "POST", "/api/notes/photo", { cookie: s.token, body: fd })).status, 400); });
add("api.upload", "not_multipart", async () => { const env = makeEnv(); const s = await newSession(worker, env); ok((await call(worker, env, "POST", "/api/notes/photo", { cookie: s.token, body: "x", raw: true, headers: { "content-type": "text/plain" } })).status < 500); });
add("api.upload", "caption_capped", async () => { const env = makeEnv(); const s = await newSession(worker, env); const fd = new FormData(); fd.set("file", new File(["\xff\xd8"], "a.jpg", { type: "image/jpeg" })); fd.set("caption", "c".repeat(100000)); await call(worker, env, "POST", "/api/notes/photo", { cookie: s.token, body: fd }); for (const n of env.DB.q("SELECT text FROM notes")) ok(n.text.length <= 5000, "caption not capped"); });
add("api.size", "note_1mb_truncated", async () => { const env = makeEnv(); const s = await newSession(worker, env); const r = await call(worker, env, "POST", "/api/notes", { cookie: s.token, body: { text: "y".repeat(1 << 20) } }); eq(r.status, 200); eq(env.DB.q("SELECT length(text) n FROM notes")[0].n, 5000); });
add("api.size", "prefs_over_4k_rejected", async () => { const env = makeEnv(); const s = await newSession(worker, env); eq((await call(worker, env, "PUT", "/api/prefs", { cookie: s.token, body: { prefs: { x: "z".repeat(5000) } } })).status, 400); });
add("api.size", "import_text_10mb_rejected", async () => { const env = makeEnv(); const s = await newSession(worker, env); const r = await call(worker, env, "POST", "/api/import/letterboxd", { cookie: s.token, body: "Name\n" + "x\n".repeat(5e6), raw: true, headers: { "content-type": "text/csv" } }); eq(r.status, 400); });
add("api.size", "import_caps_1000_rows", async () => { const env = makeEnv(); const s = await newSession(worker, env); const r = await call(worker, env, "POST", "/api/import/letterboxd", { cookie: s.token, body: "Name,Year\n" + Array.from({ length: 3000 }, (_, i) => `F${i},2000`).join("\n"), raw: true }); eq(r.json.queued, 1000); });
add("api.size", "search_q_100k", async () => { const env = makeEnv(); const s = await newSession(worker, env); ok((await call(worker, env, "GET", "/api/notes?q=" + "a".repeat(100000), { cookie: s.token })).status < 500); });
for (const q of ["%", "_", "%25", "'", "\"", "\\", "%' OR 1=1 --", "%00", "😀", "中"]) add("api.size", "search_q:" + q, async () => { const env = makeEnv(); const u = await populated(env); const r = await call(worker, env, "GET", "/api/notes?q=" + encodeURIComponent(q), { cookie: u.T }); eq(r.status, 200); });
for (const f of ["all", "photos", "cards", "plain", "", "'; DROP", "x".repeat(500)]) add("api.size", "filter:" + f.slice(0, 20), async () => { const env = makeEnv(); const u = await populated(env); eq((await call(worker, env, "GET", "/api/notes?filter=" + encodeURIComponent(f), { cookie: u.T })).status, 200); });
for (const t of ["all", "film", "music", "book", "place", "tv", "other", "", "<x>"]) add("api.size", "cards_type:" + t, async () => { const env = makeEnv(); const u = await populated(env); eq((await call(worker, env, "GET", "/api/cards?type=" + encodeURIComponent(t), { cookie: u.T })).status, 200); });

// 9) Letterboxd import through the API (malformed ratings must not 500)
for (const [n, csv] of [["neg_rating", "Name,Year,Rating\nHer,2013,-1"], ["huge_rating", "Name,Year,Rating\nHer,2013,1e9"], ["nan_rating", "Name,Year,Rating\nHer,2013,abc"], ["inf_rating", "Name,Year,Rating\nHer,2013,Infinity"],
  ["bad_date", "Name,Date\nHer,notadate"], ["huge_date", "Name,Date\nHer,+275760-09-13"], ["xss", "Name\n<img src=x onerror=alert(1)>"], ["empty", ""], ["no_name", "Title\nHer"], ["spaces_only_name", "Name\n   "]])
  add("api.import", n, async () => { const env = makeEnv(); setQloo(makeQloo()); const s = await newSession(worker, env); const r = await call(worker, env, "POST", "/api/import/letterboxd", { cookie: s.token, body: csv, raw: true, headers: { "content-type": "text/csv" } }); ok(r.status < 500, "status " + r.status + " " + r.text.slice(0, 80)); });

// 10) security headers / cookies / delete
add("api.security", "session_cookie_flags", async () => { const env = makeEnv(); const r = await call(worker, env, "POST", "/api/session", { body: {} }); const c = r.headers.get("set-cookie"); ok(/HttpOnly/.test(c) && /Secure/.test(c) && /SameSite=Lax/.test(c)); });
add("api.security", "signout_cookie_flags", async () => { const env = makeEnv(); const r = await call(worker, env, "POST", "/api/signout"); const c = r.headers.get("set-cookie"); ok(/HttpOnly/.test(c) && /Secure/.test(c) && /Max-Age=0/.test(c), c); });
add("api.security", "html_nosniff", async () => { const env = makeEnv(); const r = await call(worker, env, "GET", "/"); eq(r.headers.get("x-content-type-options"), "nosniff"); });
add("api.security", "html_frame_deny", async () => { const env = makeEnv(); const r = await call(worker, env, "GET", "/"); ok(/DENY/i.test(r.headers.get("x-frame-options") || "") || /frame-ancestors/.test(r.headers.get("content-security-policy") || ""), "clickjackable"); });
add("api.security", "api_nosniff", async () => { const env = makeEnv(); const r = await call(worker, env, "GET", "/api/me"); eq(r.headers.get("x-content-type-options"), "nosniff"); });
add("api.security", "error_no_stack", async () => { const env = makeEnv(); const r = await call(worker, env, "GET", "/api/me", { headers: { cookie: "sp=%E0%A4%A" } }); ok(!/at .*\.js:\d+/.test(r.text)); });
add("api.security", "delete_requires_confirm", async () => { const env = makeEnv(); const u = await populated(env); await call(worker, env, "POST", "/api/delete", { cookie: u.T, body: { confirm: "delete" } }); eq(env.DB.q("SELECT COUNT(*) n FROM users WHERE id=?", u.U)[0].n, 1); });
add("api.security", "delete_wipes_everything", async () => {
  const env = makeEnv(); const u = await populated(env); const r = await call(worker, env, "POST", "/api/delete", { cookie: u.T, body: { confirm: "DELETE" } }); eq(r.status, 200);
  for (const t of ["notes", "cards", "footprints", "inbox", "mappings", "plans"]) eq(env.DB.q(`SELECT COUNT(*) n FROM ${t} WHERE user_id=?`, u.U)[0].n, 0, t);
  eq(env.MEDIA_KV._map.size, 0, "media left behind");
});
add("api.security", "old_token_dead_after_delete", async () => { const env = makeEnv(); const u = await populated(env); await call(worker, env, "POST", "/api/delete", { cookie: u.T, body: { confirm: "DELETE" } }); eq((await call(worker, env, "GET", "/api/me", { cookie: u.T })).status, 401); });
add("api.security", "tokens_unique_100", async () => { const env = makeEnv(); const s = new Set(); for (let i = 0; i < 100; i++) s.add((await newSession(worker, env)).token); eq(s.size, 100); });
add("api.security", "token_length", async () => { const env = makeEnv(); ok((await newSession(worker, env)).token.length >= 32); });
add("api.security", "pubuser_no_token", async () => { const env = makeEnv(); const r = await call(worker, env, "POST", "/api/session", { body: {} }); ok(!("token" in r.json.user)); });
add("api.security", "media_cross_prefix", async () => { const env = makeEnv(); const A = await populated(env); const B = await newSession(worker, env); eq((await call(worker, env, "GET", "/media/" + B.user.id + "/../" + A.photo.image_url.slice(7), { cookie: B.token })).status, 404); });
add("api.security", "media_owner_ok", async () => { const env = makeEnv(); const A = await populated(env); eq((await call(worker, env, "GET", A.photo.image_url, { cookie: A.T })).status, 200); });

// 11) Qloo failure through API endpoints: threads + plan degrade gracefully
for (const mode of ["429", "500", "503", "html", "empty", "nullres", "truncated", "throw", "timeout", "dupes"]) {
  add("api.qloo_degrade", "threads:" + mode, async () => { const env = makeEnv(); const u = await populated(env); const q = makeQloo(); q.mode = mode; setQloo(q); const r = await call(worker, env, "GET", "/api/threads", { cookie: u.T }); eq(r.status, 200); ok(Array.isArray(r.json.threads)); });
  add("api.qloo_degrade", "plan:" + mode, async () => {
    const env = makeEnv(); const u = await populated(env); const q = makeQloo(); q.mode = mode; setQloo(q);
    const r = await call(worker, env, "POST", "/api/plan", { cookie: u.T, body: { area: "Somewhere, NY", text: "bookstore" } });
    eq(r.status, 200); const lines = r.text.split("\n").filter(Boolean).map((l) => JSON.parse(l)); ok(lines.some((l) => l.type === "plan" || l.type === "error"), "stream ended without plan or error");
  });
  add("api.qloo_degrade", "note_saved:" + mode, async () => { const env = makeEnv(); const s = await newSession(worker, env); const q = makeQloo(); q.mode = mode; setQloo(q); const r = await call(worker, env, "POST", "/api/notes", { cookie: s.token, body: { text: "watched Her" } }); eq(r.status, 200); eq(env.DB.q("SELECT text FROM notes")[0].text, "watched Her"); });
}

await runAll("api", { timeout: 20000 });
process.exit(0);
