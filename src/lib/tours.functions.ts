import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** List tour_keys the current user has completed. */
export const listCompletedTours = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("user_tour_progress")
      .select("tour_key")
      .eq("user_id", context.userId);
    return { tourKeys: (data ?? []).map((r: { tour_key: string }) => r.tour_key) };
  });

/** Mark a tour complete (idempotent) for the current user. */
export const markTourComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tourKey: z.string().min(1).max(60) }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any)
      .from("user_tour_progress")
      .upsert({ user_id: context.userId, tour_key: data.tourKey }, { onConflict: "user_id,tour_key" });
    return { ok: true };
  });

/**
 * Generate a short ambient tip line via light AI for a given page context, with a
 * static fallback so the UI never depends on this succeeding. Result is meant to be
 * cached client-side by the caller (e.g. per pathname per session).
 */
export const generateAmbientTip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ pageContext: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }) => {
    try {
      const { aiChat } = await import("@/lib/ai-provider.server");
      const r = await aiChat(
        "light",
        [
          {
            role: "system",
            content:
              "You write a single short, friendly, encouraging tip (max 22 words) for a quiz app UI, for the given page. " +
              "Where natural, nudge the user to buy AI credit, go Pro, price a quiz, or run an ad — but don't force it every time. No emojis, no quotes.",
          },
          { role: "user", content: `Page: ${data.pageContext}` },
        ],
        { temperature: 0.8, max_tokens: 60 },
      );
      const text = r.text?.trim().replace(/^"|"$/g, "");
      if (text && text.length > 3) return { tip: text };
    } catch {
      // fall through to static fallback
    }
    return { tip: null };
  });
