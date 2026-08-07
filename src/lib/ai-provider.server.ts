/**
 * Unified AI router.
 *
 * Two providers are merged:
 *  - "openrouter"  → heavy / paid-for work (document parsing, question generation,
 *                    essay marking, generative oversight). Cheap / free models.
 *  - "lovable"     → light platform work (payment-receipt verification, coach
 *                    summaries, notifications, tour/guide copy) where reliability
 *                    matters more than cost.
 *
 * Routing is admin-editable via payment_settings.ai_heavy_provider /
 * ai_light_provider, and each provider can define its own model. More providers
 * can be added by extending PROVIDERS below.
 *
 * Reliability contract (both directions):
 *  - ~45s per-request timeout via AbortController.
 *  - One same-provider retry with backoff on 429 / 5xx / network errors.
 *  - If the configured provider still fails (or is unconfigured), transparently
 *    retry the whole call on the other provider before giving up.
 *  - Callers never see a raw "failed to fetch" — every failure is normalised
 *    into a clear, human-readable Error.
 */

export type AiProviderName = "openrouter" | "lovable";
export type AiWeight = "heavy" | "light";

export type AiMessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

export type AiMessage = { role: string; content: AiMessageContent };

export type AiCallResult = {
  text: string;
  provider: AiProviderName;
  model: string;
  input_tokens: number;
  output_tokens: number;
  fellBack: boolean;
};

const DEFAULT_OPENROUTER_MODEL = "openrouter/free";
// Verified against the live Lovable AI gateway (curl, 2024): google/gemini-3-flash-preview
// returns 200. google/gemini-2.5-flash and google/gemini-2.5-flash-lite also work and are
// used as automatic fallbacks below.
const DEFAULT_LOVABLE_MODEL = "google/gemini-3-flash-preview";
const LOVABLE_FALLBACK_MODEL = "google/gemini-2.5-flash";

const REQUEST_TIMEOUT_MS = 45_000;
const RETRY_BACKOFF_MS = 800;

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

function isRetryableStatus(status: number | undefined) {
  return status === 429 || (typeof status === "number" && status >= 500);
}

function isNetworkError(e: any) {
  const msg = String(e?.message ?? e ?? "");
  return (
    e?.name === "AbortError" ||
    /failed to fetch|fetch failed|network|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up/i.test(msg)
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function callProviderOnce(
  provider: AiProviderName,
  model: string,
  messages: AiMessage[],
  opts: { temperature?: number; max_tokens?: number; json?: boolean },
) {
  const cfg = PROVIDERS[provider];
  const key = cfg.key();
  if (!key) throw new Error(`${provider} is not configured`);
  const body: Record<string, unknown> = { model, messages, temperature: opts.temperature ?? 0 };
  if (opts.max_tokens) body['max_tokens'] = opts.max_tokens;
  if (opts.json) body['response_format'] = { type: "json_object" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(cfg.url, {
      method: "POST",
      headers: cfg.headers(key),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e: any) {
    if (e?.name === "AbortError") {
      const err: any = new Error(`${provider} request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
      err.retryable = true;
      throw err;
    }
    const err: any = new Error(`Could not reach ${provider} (network error)`);
    err.retryable = true;
    err.cause = e;
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err: any = new Error(`AI ${provider} HTTP ${res.status}${detail ? ` — ${detail.slice(0, 300)}` : ""}`);
    err.status = res.status;
    err.retryable = isRetryableStatus(res.status);
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

/** One same-provider retry (with backoff) on timeouts / network errors / 429 / 5xx. */
async function callProvider(
  provider: AiProviderName,
  model: string,
  messages: AiMessage[],
  opts: { temperature?: number; max_tokens?: number; json?: boolean },
) {
  try {
    return await callProviderOnce(provider, model, messages, opts);
  } catch (e: any) {
    if (!e?.retryable) throw e;
    await sleep(RETRY_BACKOFF_MS);
    try {
      return await callProviderOnce(provider, model, messages, opts);
    } catch (e2: any) {
      // If the primary model id itself is the problem (400s are not retryable
      // above, so this only triggers for retryable failures) try the known-good
      // fallback model for the same provider as a last resort before bubbling up.
      if (provider === "lovable" && model !== LOVABLE_FALLBACK_MODEL) {
        try {
          return await callProviderOnce(provider, LOVABLE_FALLBACK_MODEL, messages, opts);
        } catch {
          throw e2;
        }
      }
      throw e2;
    }
  }
}

/**
 * Run a chat completion on the provider configured for this weight class,
 * automatically falling back to the other provider if the first is unavailable,
 * errors, or times out.
 */
export async function aiChat(
  weight: AiWeight,
  messages: AiMessage[],
  opts: { temperature?: number; max_tokens?: number; json?: boolean; model?: string } = {},
): Promise<AiCallResult> {
  const routing = await loadRouting();
  let primary: AiProviderName = weight === "heavy" ? routing.heavy : routing.light;
  if (primary === "openrouter" && !routing.openrouterEnabled) primary = "lovable";
  const secondary: AiProviderName = primary === "openrouter" ? "lovable" : "openrouter";

  const modelFor = (p: AiProviderName) =>
    opts.model && p === primary ? opts.model : p === "openrouter" ? routing.openrouterModel : DEFAULT_LOVABLE_MODEL;

  let primaryError: any = null;
  if (PROVIDERS[primary].key() && !(primary === "openrouter" && !routing.openrouterEnabled)) {
    try {
      const r = await callProvider(primary, modelFor(primary), messages, opts);
      return { ...r, fellBack: false };
    } catch (e) {
      primaryError = e;
    }
  } else {
    primaryError = new Error(`${primary} is not configured`);
  }

  const secondaryConfigured = PROVIDERS[secondary].key() && !(secondary === "openrouter" && !routing.openrouterEnabled);
  if (!secondaryConfigured) {
    throw humaniseError(primaryError, primary);
  }
  try {
    const r = await callProvider(secondary, modelFor(secondary), messages, opts);
    return { ...r, fellBack: true };
  } catch (secondaryError) {
    throw humaniseError(secondaryError, secondary, primaryError, primary);
  }
}

function humaniseError(e: any, provider: AiProviderName, otherError?: any, otherProvider?: AiProviderName): Error {
  const base = otherError
    ? `AI request failed on both providers (${otherProvider}: ${shortMsg(otherError)}; ${provider}: ${shortMsg(e)}). Please try again shortly.`
    : `AI request failed (${provider}: ${shortMsg(e)}).`;
  return new Error(base);
}

function shortMsg(e: any) {
  const msg = String(e?.message ?? e ?? "unknown error");
  return msg.length > 200 ? `${msg.slice(0, 200)}…` : msg;
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
