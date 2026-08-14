import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * All AI traffic in this app goes through OpenRouter. (The Lovable AI gateway
 * has been removed so the project runs unchanged outside Lovable, e.g. Vercel.)
 */
export const DEFAULT_CHAT_MODEL = "openai/gpt-4o-mini";

export function createAiProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://hanilearnqz.lovable.app",
      "X-Title": "HaniLearn-QZ",
    },
  });
}
