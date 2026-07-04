import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function origin() {
  try { return new URL(getRequest().url).origin; } catch { return "https://hanilearnqz.lovable.app"; }
}

function newCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export const getOrCreateMyAffiliate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    let { data: row } = await db.from("affiliate_codes").select("*").eq("user_id", context.userId).maybeSingle();
    if (!row) {
      for (let i = 0; i < 6 && !row; i++) {
        const code = newCode();
        const { data: inserted } = await db.from("affiliate_codes").insert({ user_id: context.userId, code }).select().maybeSingle();
        if (inserted) row = inserted;
      }
      if (!row) throw new Error("Could not allocate affiliate code, try again.");
    }
    // Stats
    const { data: attrs, count: signups } = await db.from("affiliate_attributions")
      .select("referred_user_id", { count: "exact" }).eq("affiliate_user_id", context.userId);
    const { data: earns } = await db.from("wallet_transactions").select("amount_kobo").eq("user_id", context.userId).eq("kind","affiliate_earn");
    const earned_kobo = (earns ?? []).reduce((s: number, r: any) => s + r.amount_kobo, 0);
    return {
      code: row.code,
      link: `${origin()}/auth?ref=${row.code}`,
      clicks: row.clicks,
      signups: signups ?? attrs?.length ?? 0,
      earned_kobo,
    };
  });

/** Public: called from /auth to record a click. Also stashed in localStorage on the client. */
export const trackAffiliateClick = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code: z.string().trim().min(3).max(16) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const code = data.code.toUpperCase();
    const { data: row } = await db.from("affiliate_codes").select("user_id, clicks").eq("code", code).maybeSingle();
    if (!row) return { ok: false };
    await db.from("affiliate_codes").update({ clicks: (row.clicks ?? 0) + 1 }).eq("code", code);
    return { ok: true };
  });

/** Called from signup flow: attribute the freshly signed-in user to a code. */
export const attributeAffiliate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().trim().min(3).max(16) }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const code = data.code.toUpperCase();
    const { data: row } = await db.from("affiliate_codes").select("user_id, signups").eq("code", code).maybeSingle();
    if (!row) return { ok: false };
    if (row.user_id === context.userId) return { ok: false, reason: "self" };
    // Only create if this user isn't already attributed
    const { data: existing } = await db.from("affiliate_attributions").select("referred_user_id").eq("referred_user_id", context.userId).maybeSingle();
    if (existing) return { ok: false, reason: "already_attributed" };
    await db.from("affiliate_attributions").insert({ referred_user_id: context.userId, affiliate_user_id: row.user_id, code });
    await db.from("affiliate_codes").update({ signups: (row.signups ?? 0) + 1 }).eq("code", code);
    return { ok: true };
  });
