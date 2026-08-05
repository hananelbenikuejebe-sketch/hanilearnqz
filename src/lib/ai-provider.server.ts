/**
 * Unified AI router.
 *
 * Two providers are merged:
 *  - "openrouter"  → heavy / paid-for work (document parsing, question generation,
 *                    essay marking, generative oversight). Cheap / free models.
 *  - "lovable"     → light platform work (payment-receipt verification, coach
 *                    summaries) where reliability matters more than cost.
 *
 * Routing is admin-editable via payment_settings.ai_heavy_provider /
 * ai_light_provider, and each provider can define its own model. More providers
 * can be added by extending PROVIDERS below.
 */

export type AiProviderName = "openrouter" | "lovable";
export type AiWeight = "heavy" | "light";

export type AiCallResult = {
  text: string;
  provider: AiProviderName;
  model: string;
  input_tokens: number;
  output_tokens: number;
  fellBack: boolean;
};

const DEFAULT_OPENROUTER_MODEL = "openrouter/free";
const DEFAULT_LOVABLE_MODEL = "google/gemini-3-flash-preview";

type ProviderConfig = {
  url: string;
  key: () => string | undefined;
  headers: (key: string) => Record<string, string>;
  defaultModel: string;
};

const PROVIDERS: Record<AiProviderName, ProviderConfig> = {
  openrouter: {
    url: "https://openrouter.ai/api/v1/chat/completions",
    key: () => process.env['OPENROUTER_API_KEY'],
    headers: (key) => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": "https://hanilearnqz.lovable.app",
      "X-Title": "HaniLearn-QZ",
    }),
    defaultModel: DEFAULT_OPENROUTER_MODEL,
  },
  lovable: {
    url: "https://ai.gateway.lovable.dev/v1/chat/completions",
    key: () => process.env['LOVABLE_API_KEY'],
    headers: (key) => ({ "Content-Type": "application/json", "Lovable-API-Key": key }),
    defaultModel: DEFAULT_LOVABLE_MODEL,
  },
};

async function loadRouting() {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("payment_settings")
      .select("ai_heavy_provider, ai_light_provider, openrouter_model, openrouter_enabled")
      .eq("id", "default")
      .maybeSingle();
    return {
      heavy: (data?.ai_heavy_provider as AiProviderName) || "openrouter",
      light: (data?.ai_light_provider as AiProviderName) || "lovable",
      openrouterModel: String(data?.openrouter_model || DEFAULT_OPENROUTER_MODEL),
      openrouterEnabled: data?.openrouter_enabled !== false,
    };
  } catch {
    return { heavy: "openrouter" as AiProviderName, light: "lovable" as AiProviderName, openrouterModel: DEFAULT_OPENROUTER_MODEL, openrouterEnabled: true };
  }
}

async function callProvider(
  provider: AiProviderName,
  model: string,
  messages: Array<{ role: string; content: string }>,
  opts: { temperature?: number; max_tokens?: number; json?: boolean },
) {
  const cfg = PROVIDERS[provider];
  const key = cfg.key();
  if (!key) throw new Error(`${provider} is not configured`);
  const body: Record<string, unknown> = { model, messages, temperature: opts.temperature ?? 0 };
  if (opts.max_tokens) body['max_tokens'] = opts.max_tokens;
  if (opts.json) body['response_format'] = { type: "json_object" };

  const res = await fetch(cfg.url, { method: "POST", headers: cfg.headers(key), body: JSON.stringify(body) });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err: any = new Error(`AI ${provider} HTTP ${res.status}${detail ? ` — ${detail.slice(0, 300)}` : ""}`);
    err.status = res.status;
    throw err;
  }
  const json: any = await res.json();
  const text = json?.choices?.[0]?.message?.content ?? "";
  return {
    text: String(text),
    provider,
    model,
    input_tokens: Number(json?.usage?.prompt_tokens ?? 0),
    output_tokens: Number(json?.usage?.completion_tokens ?? 0),
  };
}

/**
 * Run a chat completion on the provider configured for this weight class,
 * automatically falling back to the other provider if the first is unavailable.
 */
export async function aiChat(
  weight: AiWeight,
  messages: Array<{ role: string; content: string }>,
  opts: { temperature?: number; max_tokens?: number; json?: boolean; model?: string } = {},
): Promise<AiCallResult> {
  const routing = await loadRouting();
  let primary: AiProviderName = weight === "heavy" ? routing.heavy : routing.light;
  if (primary === "openrouter" && !routing.openrouterEnabled) primary = "lovable";
  const secondary: AiProviderName = primary === "openrouter" ? "lovable" : "openrouter";

  const modelFor = (p: AiProviderName) =>
    opts.model && p === primary ? opts.model : p === "openrouter" ? routing.openrouterModel : DEFAULT_LOVABLE_MODEL;

  try {
    const r = await callProvider(primary, modelFor(primary), messages, opts);
    return { ...r, fellBack: false };
  } catch (primaryError) {
    if (secondary === "openrouter" && !routing.openrouterEnabled) throw primaryError;
    if (!PROVIDERS[secondary].key()) throw primaryError;
    const r = await callProvider(secondary, modelFor(secondary), messages, opts);
    return { ...r, fellBack: true };
  }
}

/** Parse JSON out of a model response, tolerating code fences and prose. */
export function parseJsonLoose<T = any>(text: string, fallback: T): T {
  const cleaned = String(text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const tryParse = (s: string) => { try { return JSON.parse(s) as T; } catch { return null; } };
  const direct = tryParse(cleaned);
  if (direct !== null) return direct;
  for (const [open, close] of [["{", "}"], ["[", "]"]] as const) {
    const start = cleaned.indexOf(open);
    const end = cleaned.lastIndexOf(close);
    if (start !== -1 && end > start) {
      const parsed = tryParse(cleaned.slice(start, end + 1));
      if (parsed !== null) return parsed;
    }
  }
  return fallback;
}

export function isAiConfigured() {
  return Boolean(process.env['OPENROUTER_API_KEY'] || process.env['LOVABLE_API_KEY']);
}
