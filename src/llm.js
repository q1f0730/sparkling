// Small helpers around Workers AI. The model writes copy and picks among Qloo candidates;
// it never supplies an entity of its own.
// 70B fp8-fast first: measured 10-23 at 1.4-5.5 s per call vs 7.7-9.9 s for llama-4-scout, with cleaner extraction
// (fills music_work, no "radio"/"laundromat" mentions). Scout stays as the fallback.
const JSON_MODELS = ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-4-scout-17b-16e-instruct"];

function parseLoose(t) {
  if (t && typeof t === "object") return t;
  if (!t) return null;
  const s = String(t);
  try { return JSON.parse(s); } catch (_) {}
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (_) {} }
  return null;
}

// Circuit breaker: after a quota/capacity error skip the model for 5 minutes so callers fall back to rules at once.
let aiDownUntil = 0;
const isQuota = (e) => /quota|neurons|limit|4006|capacity|429/i.test(String(e && e.message));

// Prod cost guard: with env.LLM_D1_CACHE === "1" identical calls are served from the D1 llm_cache table
// (key "lc:v1:" + SHA-256 of kind, model list, system, user, schema and maxTokens) for
// (+env.LLM_D1_CACHE_TTL_H || 24) hours. Successful results only; D1 errors are ignored.
const cacheOn = (env) => !!env && env.LLM_D1_CACHE === "1" && !!env.DB;
const cacheTtlMs = (env) => (+env.LLM_D1_CACHE_TTL_H || 24) * 3600000;
async function cacheKey(kind, system, user, schema, maxTokens) {
  const hex = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",
    new TextEncoder().encode(JSON.stringify([kind, JSON_MODELS, system, user, schema || null, maxTokens])))), (b) => b.toString(16).padStart(2, "0")).join("");
  return "lc:v1:" + hex;
}
async function cacheGet(env, key) {
  try {
    const row = await env.DB.prepare("SELECT value, created_at FROM llm_cache WHERE key=?").bind(key).first();
    if (row && typeof row.value === "string" && Date.now() - Number(row.created_at) < cacheTtlMs(env)) return { hit: true, value: JSON.parse(row.value) };
  } catch (_) {}
  return { hit: false };
}
async function cachePut(env, key, value) {
  try { await env.DB.prepare("INSERT OR REPLACE INTO llm_cache (key,value,created_at) VALUES (?,?,?)").bind(key, JSON.stringify(value), Date.now()).run(); } catch (_) {}
}

// Daily caps: one D1 counter row per UTC day and kind (env.QLOO_DAILY_CAP / env.LLM_DAILY_CAP).
// No cap set means free; a DB error fails open so a broken counter never breaks the product.
export async function spend(env, kind) {
  const cap = +(kind === "qloo" ? env.QLOO_DAILY_CAP : env.LLM_DAILY_CAP);
  if (!(cap > 0)) return;
  const key = "cap:" + kind + ":" + new Date().toISOString().slice(0, 10);
  let n = null;
  try {
    const row = await env.DB.prepare("INSERT INTO quota (key,n,created_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET n=n+1 RETURNING n").bind(key, Date.now()).first();
    n = row ? Number(row.n) : null;
  } catch (_) { return; }
  if (n != null && n > cap) throw Object.assign(new Error("daily " + kind + " cap reached"), { cap: kind, state: "busy" });
}

export async function llmJSON(env, system, user, schema, maxTokens = 700) {
  const cache = cacheOn(env);
  const key = cache ? await cacheKey("json", system, user, schema, maxTokens) : null;
  if (cache) { const c = await cacheGet(env, key); if (c.hit) return c.value; }
  let lastErr;
  if (Date.now() < aiDownUntil) throw new Error("ai paused (quota)");
  for (const model of JSON_MODELS) {
    await spend(env, "llm");
    try {
      const r = await env.AI.run(model, {
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: schema ? { type: "json_schema", json_schema: schema } : undefined,
        max_tokens: maxTokens,
        temperature: 0.1,
      });
      const out = parseLoose(r?.response);
      if (out) { if (cache) await cachePut(env, key, out); return out; }
      lastErr = new Error("unparseable");
    } catch (e) { lastErr = e; if (isQuota(e)) { aiDownUntil = Date.now() + 300000; break; } }
  }
  throw lastErr || new Error("llm failed");
}

export async function llmText(env, system, user, maxTokens = 200) {
  const cache = cacheOn(env);
  const key = cache ? await cacheKey("text", system, user, null, maxTokens) : null;
  if (cache) { const c = await cacheGet(env, key); if (c.hit) return c.value; }
  await spend(env, "llm");
  const r = await env.AI.run(JSON_MODELS[0], {
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    max_tokens: maxTokens, temperature: 0.4,
  });
  const out = String(r?.response || "").trim();
  if (cache) await cachePut(env, key, out);
  return out;
}
