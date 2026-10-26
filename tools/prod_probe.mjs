#!/usr/bin/env node
// tools/prod_probe.mjs — the judge path's API smoke test.
//
// Usage: node tools/prod_probe.mjs <base-url> [--lang en|zh] [--max-ms N] [--json FILE]
//
// Steps, in this order: session (POST /api/session {mode:"sample"}, keep the sp cookie), ready (poll
// GET /api/me until pending == 0, at most 60 s), notes, cards, card (GET /api/cards/<id of "In the Mood
// for Love", else the first card>), inbox, threads, letter (both with ?lang=zh in zh), jot (POST
// /api/notes {text:"rewatched In the Mood for Love — the corridor, the score"}), plan_out (POST
// /api/plan {mood:"familiar",period:"all",mode:"out",when:"Saturday afternoon",area:"Greenpoint",
// budget:40,lang}; read the ndjson, take the {type:"plan"} line), plain_out (POST
// /api/plan/<id>/plain {}), plan_in (POST /api/plan {mood:"familiar",period:"all",mode:"in",
// text:"I want to watch a film",lang}), plain_in.
//
// One line per step "<step> <status> <ms>ms"; then a markdown table "| step | status | ms |".
// Exit 0 only if every step is 2xx, plan_out has plan.stops (>=1), plan_in has plan.picks (>=1), each
// plain has stops/picks (>=1) or a busy_notice, no {type:"error"} line, and — when --max-ms is given —
// every step except session and ready took <= N ms. Else exit 1.
// --json writes {base, lang, ok, steps:[{step, status, ms, ok}]}. Each request times out after 60 s.
// Node built-ins only, global fetch.

import fs from "node:fs";
import path from "node:path";

const STEPS = [
  "session", "ready", "notes", "cards", "card", "inbox", "threads", "letter",
  "jot", "plan_out", "plain_out", "plan_in", "plain_in",
];
const REQ_TIMEOUT_MS = 60000;
const READY_BUDGET_MS = 60000;
const USAGE = "usage: node tools/prod_probe.mjs <base-url> [--lang en|zh] [--max-ms N] [--json FILE]";

let cookie = "";

function die(msg) {
  console.error("prod_probe: " + msg);
  console.error(USAGE);
  process.exit(2);
}

function parseArgs(argv) {
  let base = "";
  let lang = "en";
  let maxMs = null;
  let jsonFile = "";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--lang") {
      const v = argv[++i];
      if (v !== "en" && v !== "zh") die("--lang must be en or zh");
      lang = v;
    } else if (a === "--max-ms") {
      const v = argv[++i];
      if (v === undefined || v === "" || !isFinite(Number(v)) || Number(v) < 0) die("--max-ms needs a number of milliseconds");
      maxMs = Number(v);
    } else if (a === "--json") {
      const v = argv[++i];
      if (!v) die("--json needs a file path");
      jsonFile = v;
    } else if (a.startsWith("--")) {
      die("unknown option " + a);
    } else if (!base) {
      base = a;
    } else {
      die("unexpected argument " + a);
    }
  }
  if (!base) die("missing <base-url>");
  return { base: base.replace(/\/+$/, ""), lang, maxMs, jsonFile };
}

const is2xx = (s) => s >= 200 && s < 300;

async function request(url, { method = "GET", body, timeoutMs = REQ_TIMEOUT_MS } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  const init = { method, headers };
  if (body !== undefined) init.body = body;
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    init.signal = AbortSignal.timeout(Math.max(1, Math.round(timeoutMs)));
  }
  const t0 = Date.now();
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    return { status: res.status, headers: res.headers, text, ms: Date.now() - t0 };
  } catch (e) {
    return { status: 0, headers: null, text: "", ms: Date.now() - t0, error: String((e && e.message) || e) };
  }
}

function postJson(url, obj) {
  return request(url, { method: "POST", body: JSON.stringify(obj) });
}

function pickSpCookie(headers) {
  if (!headers) return "";
  let all = [];
  try {
    if (typeof headers.getSetCookie === "function") all = headers.getSetCookie() || [];
  } catch (_) {}
  if (!all.length) {
    const v = headers.get("set-cookie");
    if (v) all = [v];
  }
  for (const one of all) {
    const m = /(?:^|[;,])\s*sp=([^;,\s]+)/.exec(String(one || ""));
    if (m) return "sp=" + m[1];
  }
  return "";
}

function json(text) {
  try { return JSON.parse(text); } catch (_) { return null; }
}

function parseNdjson(text) {
  const out = { plan: null, error: null };
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const msg = json(line);
    if (!msg || typeof msg !== "object") continue;
    if (msg.type === "plan" && msg.plan) out.plan = msg.plan;
    else if (msg.type === "error") out.error = msg;
  }
  return out;
}

function firstCard(text) {
  const d = json(text);
  const cards = d && Array.isArray(d.cards) ? d.cards.filter((c) => c && c.id) : [];
  return cards.find((c) => /in the mood for love/i.test(String(c.name || ""))) || cards[0] || null;
}

async function stepSession(base) {
  const r = await postJson(base + "/api/session", { mode: "sample" });
  if (is2xx(r.status)) {
    const c = pickSpCookie(r.headers);
    if (c) cookie = c;
    else return { status: r.status, ms: r.ms, ok: false, reason: "no sp cookie from /api/session" };
  }
  return { status: r.status, ms: r.ms, ok: is2xx(r.status) && !!cookie, reason: r.error || "" };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function stepReady(base) {
  const start = Date.now();
  const deadline = start + READY_BUDGET_MS;
  let status = 0;
  let reason = "";
  for (;;) {
    const left = deadline - Date.now();
    if (left <= 0) { reason = "pending never reached 0 within 60 s"; break; }
    const r = await request(base + "/api/me", { timeoutMs: Math.min(REQ_TIMEOUT_MS, left) });
    status = r.status;
    if (!is2xx(r.status)) { reason = r.error || "GET /api/me " + r.status; break; }
    const d = json(r.text);
    if (d && d.pending === 0) return { status, ms: Date.now() - start, ok: true, reason: "" };
    if (Date.now() + 1000 >= deadline) { reason = "pending never reached 0 within 60 s"; break; }
    await sleep(1000);
  }
  return { status, ms: Date.now() - start, ok: false, reason };
}

async function stepSimple(base, p) {
  const r = await request(base + p);
  return { status: r.status, ms: r.ms, ok: is2xx(r.status), reason: r.error || "" };
}

async function stepPlan(base, body, want) {
  const r = await postJson(base + "/api/plan", body);
  const nd = parseNdjson(r.text);
  const plan = nd.plan;
  const list = plan && Array.isArray(plan[want]) ? plan[want] : [];
  let reason = r.error || "";
  if (!reason && nd.error) reason = "ndjson error line: " + (nd.error.state || nd.error.text || "error");
  else if (!reason && !plan) reason = "no {type:\"plan\"} line";
  else if (!reason && !list.length) reason = "plan." + want + " is empty";
  return { status: r.status, ms: r.ms, ok: is2xx(r.status) && !nd.error && !!plan && list.length >= 1, reason, plan };
}

async function stepPlain(base, planId, want) {
  if (!planId) return { status: 0, ms: 0, ok: false, reason: "no plan id from the plan step" };
  const r = await postJson(base + "/api/plan/" + encodeURIComponent(planId) + "/plain", {});
  const d = json(r.text);
  const pl = d && d.plain;
  const list = pl && Array.isArray(pl[want]) ? pl[want] : [];
  const busy = !!(pl && typeof pl.busy_notice === "string" && pl.busy_notice.trim());
  let reason = r.error || "";
  if (!reason && !pl) reason = "no plain block";
  else if (!reason && !list.length && !busy) reason = "plain." + want + " is empty and no busy_notice";
  return { status: r.status, ms: r.ms, ok: is2xx(r.status) && !!pl && (list.length >= 1 || busy), reason };
}

async function main() {
  const { base, lang, maxMs, jsonFile } = parseArgs(process.argv.slice(2));
  const results = [];
  const record = (name, r) => {
    const row = { step: name, status: r.status, ms: r.ms, ok: !!r.ok };
    results.push(row);
    console.log(name + " " + row.status + " " + row.ms + "ms");
    if (!row.ok && r.reason) console.error("! " + name + ": " + r.reason);
    return r;
  };

  record("session", await stepSession(base));
  record("ready", await stepReady(base));
  record("notes", await stepSimple(base, "/api/notes"));

  let picked = null;
  {
    const r = await request(base + "/api/cards");
    picked = is2xx(r.status) ? firstCard(r.text) : null;
    record("cards", { status: r.status, ms: r.ms, ok: is2xx(r.status) && !!picked, reason: r.error || (picked ? "" : "no cards to open") });
  }
  record("card", await (async () => {
    if (!picked) return { status: 0, ms: 0, ok: false, reason: "no card to open" };
    const r = await request(base + "/api/cards/" + encodeURIComponent(String(picked.id)));
    return { status: r.status, ms: r.ms, ok: is2xx(r.status), reason: r.error || "" };
  })());

  record("inbox", await stepSimple(base, "/api/inbox"));
  record("threads", await stepSimple(base, "/api/threads" + (lang === "zh" ? "?lang=zh" : "")));
  record("letter", await stepSimple(base, "/api/letter" + (lang === "zh" ? "?lang=zh" : "")));
  record("jot", await (async () => {
    const r = await postJson(base + "/api/notes", { text: "rewatched In the Mood for Love — the corridor, the score" });
    return { status: r.status, ms: r.ms, ok: is2xx(r.status), reason: r.error || "" };
  })());

  const out = record("plan_out", await stepPlan(base, {
    mood: "familiar", period: "all", mode: "out", when: "Saturday afternoon", area: "Greenpoint", budget: 40, lang,
  }, "stops"));
  record("plain_out", await stepPlain(base, out.plan && out.plan.id, "stops"));
  const inn = record("plan_in", await stepPlan(base, {
    mood: "familiar", period: "all", mode: "in", text: "I want to watch a film", lang,
  }, "picks"));
  record("plain_in", await stepPlain(base, inn.plan && inn.plan.id, "picks"));

  let ok = results.length === STEPS.length && results.every((r) => r.ok);
  if (ok && maxMs != null) {
    ok = results.every((r) => r.step === "session" || r.step === "ready" || r.ms <= maxMs);
  }

  console.log("");
  console.log("| step | status | ms |");
  console.log("| --- | --- | --- |");
  for (const r of results) console.log("| " + r.step + " | " + r.status + " | " + r.ms + " |");

  if (jsonFile) {
    const payload = {
      base,
      lang,
      ok,
      steps: results.map((r) => ({ step: r.step, status: r.status, ms: r.ms, ok: r.ok })),
    };
    try {
      fs.mkdirSync(path.dirname(path.resolve(jsonFile)), { recursive: true });
      fs.writeFileSync(jsonFile, JSON.stringify(payload, null, 2) + "\n");
    } catch (e) {
      console.error("prod_probe: could not write " + jsonFile + ": " + String((e && e.message) || e));
    }
  }

  process.exit(ok ? 0 : 1);
}

await main();
