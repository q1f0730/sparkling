// Small helpers around Workers AI. The model writes copy and picks among Qloo candidates;
// it never supplies an entity of its own.
const JSON_MODELS = ["@cf/meta/llama-4-scout-17b-16e-instruct", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"];

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

export async function llmJSON(env, system, user, schema, maxTokens = 700) {
  let lastErr;
  if (Date.now() < aiDownUntil) throw new Error("ai paused (quota)");
  for (const model of JSON_MODELS) {
    try {
      const r = await env.AI.run(model, {
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: schema ? { type: "json_schema", json_schema: schema } : undefined,
        max_tokens: maxTokens,
        temperature: 0.1,
      });
      const out = parseLoose(r?.response);
      if (out) return out;
      lastErr = new Error("unparseable");
    } catch (e) { lastErr = e; if (isQuota(e)) { aiDownUntil = Date.now() + 300000; break; } }
  }
  throw lastErr || new Error("llm failed");
}

export async function llmText(env, system, user, maxTokens = 200) {
  const r = await env.AI.run(JSON_MODELS[0], {
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    max_tokens: maxTokens, temperature: 0.4,
  });
  return String(r?.response || "").trim();
}
