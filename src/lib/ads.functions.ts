import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/authz.server";

export const PLACEMENTS = ["explore", "quiz_end", "switch", "wallet", "notifications", "messages", "popup"] as const;

const placementEnum = z.enum(PLACEMENTS);

/** Upload an ad creative image to the public "ad-creatives" bucket. Admin only. */
export const uploadAdImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      filename: z.string().max(160),
      content_type: z.string().max(80),
      base64: z.string().min(10),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const buf = Buffer.from(data.base64, "base64");
    const ext = data.filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `ads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await (supabaseAdmin as any).storage
      .from("ad-creatives")
      .upload(path, buf, { contentType: data.content_type, upsert: true });
    if (upErr) throw upErr;
    const { data: pub } = (supabaseAdmin as any).storage.from("ad-creatives").getPublicUrl(path);
    return { path, url: pub?.publicUrl ?? null };
  });


/** Active ads matching a placement whose schedule window includes now. */
export const listActiveAds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ placement: placementEnum }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const now = new Date().toISOString();
    const { data: ads, error } = await db
      .from("ads")
      .select("*")
      .eq("active", true)
      .contains("placements", [data.placement])
      .or(`start_at.is.null,start_at.lte.${now}`)
      .or(`end_at.is.null,end_at.gte.${now}`)
      .order("weight", { ascending: false });
    if (error) throw error;
    return (ads ?? []).filter((a: any) => {
      if (a.start_at && new Date(a.start_at).getTime() > Date.now()) return false;
      if (a.end_at && new Date(a.end_at).getTime() < Date.now()) return false;
      return true;
    });
  });

/** Best-effort ad event recording; never throws to the caller. */
export const recordAdEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    ad_id: z.string().uuid(),
    kind: z.enum(["impression", "click"]),
    placement: z.string().max(40).optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const db = supabaseAdmin as any;
      await db.from("ad_events").insert({
        ad_id: data.ad_id, user_id: context.userId, kind: data.kind, placement: data.placement ?? null,
      });
      const { data: ad } = await db.from("ads").select("impressions, clicks").eq("id", data.ad_id).maybeSingle();
      if (ad) {
        const col = data.kind === "impression" ? "impressions" : "clicks";
        await db.from("ads").update({ [col]: Number(ad[col] ?? 0) + 1 }).eq("id", data.ad_id);
      }
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

/** All ads with 7-day event counts and CTR, for the admin panel. */
export const adminListAds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: ads, error }, { data: events }] = await Promise.all([
      db.from("ads").select("*").order("created_at", { ascending: false }),
      db.from("ad_events").select("ad_id, kind, created_at").gte("created_at", since),
    ]);
    if (error) throw error;
    const counts: Record<string, { impressions_7d: number; clicks_7d: number }> = {};
    for (const e of events ?? []) {
      counts[e.ad_id] ??= { impressions_7d: 0, clicks_7d: 0 };
      if (e.kind === "impression") counts[e.ad_id].impressions_7d += 1;
      else counts[e.ad_id].clicks_7d += 1;
    }
    return (ads ?? []).map((a: any) => {
      const c = counts[a.id] ?? { impressions_7d: 0, clicks_7d: 0 };
      const ctr = c.impressions_7d > 0 ? (c.clicks_7d / c.impressions_7d) * 100 : 0;
      return { ...a, ...c, ctr_7d: Math.round(ctr * 100) / 100 };
    });
  });

const adInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(120),
  body: z.string().max(500).optional().nullable(),
  image_url: z.string().max(2000).optional().nullable(),
  cta_label: z.string().max(40).optional().nullable(),
  cta_url: z.string().max(2000).optional().nullable(),
  placements: z.array(placementEnum).min(1),
  active: z.boolean().default(true),
  auto_show: z.boolean().default(true),
  weight: z.number().int().min(1).max(100).default(10),
  every_n: z.number().int().min(2).max(30).default(6),
  frequency_minutes: z.number().int().min(1).max(1440).default(5),
  start_at: z.string().optional().nullable(),
  end_at: z.string().optional().nullable(),
});

/** Create or update an ad. */
export const adminUpsertAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => adInput.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { id, ...rest } = data;
    if (id) {
      const { data: row, error } = await db.from("ads").update(rest).eq("id", id).select().single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await db.from("ads").insert({ ...rest, created_by: context.userId }).select().single();
    if (error) throw error;
    return row;
  });

/** Delete an ad. */
export const adminDeleteAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { error } = await db.from("ads").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
