import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const DEFAULT_NAV_ITEMS = ["explore", "create", "wallet", "messages", "profile"] as const;

export const NAV_ITEM_IDS = [
  "explore",
  "create",
  "wallet",
  "messages",
  "profile",
  "exams",
  "notifications",
  "support",
  "admin", "ads",
] as const;

export type NavItemId = (typeof NAV_ITEM_IDS)[number];

const itemsSchema = z
  .array(z.enum(NAV_ITEM_IDS))
  .min(2)
  .max(5);

export const getMyNavPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data } = await db
      .from("user_nav_prefs")
      .select("items")
      .eq("user_id", context.userId)
      .maybeSingle();
    const items = Array.isArray(data?.items) ? data.items : null;
    return { items: items && items.length >= 2 ? items : [...DEFAULT_NAV_ITEMS] };
  });

export const saveMyNavPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ items: itemsSchema }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    await db
      .from("user_nav_prefs")
      .upsert(
        { user_id: context.userId, items: data.items, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    return { ok: true };
  });
