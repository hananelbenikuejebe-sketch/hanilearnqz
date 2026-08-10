import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/authz.server";
import { computeAdPrice, qualifiesForFreeTier, type AdPricingSettings } from "@/lib/ad-pricing";

export const PLACEMENTS = ["explore", "quiz_end", "switch", "wallet", "notifications", "messages", "popup"] as const;

const placementEnum = z.enum(PLACEMENTS);

async function loadAdPricingSettings(db: any): Promise<AdPricingSettings> {
  const { data } = await db.from("payment_settings").select("*").eq("id", "default").maybeSingle();
  return (data ?? {}) as AdPricingSettings;
}

/** Upload an ad creative image to the public "ad-creatives" bucket. Any signed-in user (creators need it too). */
export const uploadAdImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      filename: z.string().max(160),
      content_type: z.string().max(80),
      base64: z.string().min(10),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const buf = Buffer.from(data.base64, "base64");
    const ext = data.filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `ads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await (supabaseAdmin as any).storage
      .from("ad-creatives")
      .upload(path, buf, { contentType: data.content_type, upsert: true });
    if (upErr) throw upErr;
    // Bucket is private (workspace policy blocks public buckets), so hand back a
    // long-lived signed URL instead of a public one.
    const { data: signed } = await (supabaseAdmin as any).storage
      .from("ad-creatives")
      .createSignedUrl(path, 60 * 60 * 24 * 3650);
    return { path, url: signed?.signedUrl ?? null };
  });


/**
 * Best-effort tailoring: boosts ads whose title/body match the viewer's
 * interest profile (from src/lib/behavior.server.ts, owned by another
 * agent). Imported lazily and guarded so a missing/broken helper never
 * breaks ad serving — falls back to the existing weighted-random ordering.
 */
async function tailorAdsForUser(ads: any[], userId: string): Promise<any[]> {
  if (!ads.length) return ads;
  try {
    const mod: any = await import("@/lib/behavior.server").catch(() => null);
    const getUserInterestProfile = mod?.getUserInterestProfile;
    if (typeof getUserInterestProfile !== "function") return ads;
    const profile = await getUserInterestProfile(userId);
    const raw = profile?.categories ?? profile?.interests ?? profile;
    const interests: string[] = Array.isArray(raw)
      ? raw.map(String)
      : raw && typeof raw === "object"
        ? Object.keys(raw)
        : [];
    if (!interests.length) return ads;
    const lowerInterests = interests.map((s) => s.toLowerCase());
    return ads
      .map((a) => {
        const text = `${a.title ?? ""} ${a.body ?? ""}`.toLowerCase();
        const matched = lowerInterests.some((i) => i && text.includes(i));
        // Boost matched ads so tailored content wins the weighted pick more
        // often, without ever excluding non-matching ads entirely.
        return { ...a, weight: matched ? Math.round(Number(a.weight ?? 10) * 1.8) : Number(a.weight ?? 10) };
      })
      .sort((x, y) => Number(y.weight ?? 0) - Number(x.weight ?? 0));
  } catch {
    return ads;
  }
}

/** Active, approved ads matching a placement whose schedule window includes now. */
export const listActiveAds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ placement: placementEnum }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const now = new Date().toISOString();
    const { data: ads, error } = await db
      .from("ads")
      .select("*")
      .eq("active", true)
      .eq("status", "approved")
      .contains("placements", [data.placement])
      .or(`start_at.is.null,start_at.lte.${now}`)
      .or(`end_at.is.null,end_at.gte.${now}`)
      .order("weight", { ascending: false });
    if (error) throw error;
    const eligible = (ads ?? []).filter((a: any) => {
      if (a.start_at && new Date(a.start_at).getTime() > Date.now()) return false;
      if (a.end_at && new Date(a.end_at).getTime() < Date.now()) return false;
      return true;
    });
    return tailorAdsForUser(eligible, context.userId);
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

/** Pending ads awaiting admin approval, with owner names. */
export const adminListPendingAds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: ads, error } = await db.from("ads").select("*").eq("status", "pending").order("created_at", { ascending: true });
    if (error) throw error;
    const userIds = Array.from(new Set((ads ?? []).map((a: any) => a.created_by).filter(Boolean)));
    const { data: profiles } = userIds.length
      ? await db.from("profiles").select("id, full_name, email").in("id", userIds)
      : { data: [] };
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    return (ads ?? []).map((a: any) => ({ ...a, owner: profileMap.get(a.created_by) ?? null }));
  });

/** Approve or reject a pending (or any) ad. */
export const adminReviewAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    action: z.enum(["approve", "reject"]),
    review_note: z.string().max(400).optional().nullable(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const update = data.action === "approve"
      ? { status: "approved", active: true, review_note: data.review_note ?? null }
      : { status: "rejected", active: false, review_note: data.review_note ?? null };
    const { data: row, error } = await db.from("ads").update(update).eq("id", data.id).select().single();
    if (error) throw error;
    return row;
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
  days: z.number().int().min(1).max(365).default(1),
  start_at: z.string().optional().nullable(),
  end_at: z.string().optional().nullable(),
});

/** Create or update an ad. Admin only — admin-created ads are auto-approved and free (no price). */
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
    const { data: row, error } = await db.from("ads").insert({
      ...rest, created_by: context.userId, status: "approved", price_kobo: 0, is_free: true,
    }).select().single();
    if (error) throw error;
    return row;
  });

/** Delete an ad. Admin only. */
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

/* --------------------------- self-serve (creators) --------------------------- */

const creatorAdInput = z.object({
  title: z.string().min(1).max(120),
  body: z.string().max(500).optional().nullable(),
  image_url: z.string().max(2000).optional().nullable(),
  cta_label: z.string().max(40).optional().nullable(),
  cta_url: z.string().max(2000).optional().nullable(),
  placements: z.array(placementEnum).min(1),
  weight: z.number().int().min(1).max(100).default(10),
  every_n: z.number().int().min(2).max(30).default(6),
  frequency_minutes: z.number().int().min(1).max(1440).default(30),
  days: z.number().int().min(1).max(365).default(1),
  start_at: z.string().optional().nullable(),
  end_at: z.string().optional().nullable(),
  use_free_tier: z.boolean().default(false),
});

async function countFreeAdsThisMonth(db: any, userId: string): Promise<number> {
  const start = new Date();
  start.setDate(1); start.setHours(0, 0, 0, 0);
  const { count } = await db.from("ads").select("id", { count: "exact", head: true })
    .eq("created_by", userId).eq("is_free", true).gte("created_at", start.toISOString());
  return count ?? 0;
}

/** Live price preview for the creator ad-submission form, before anything is saved. */
export const previewAdPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    days: z.number().int().min(1).max(365),
    placementsCount: z.number().int().min(1).max(20),
    weight: z.number().int().min(1).max(100),
    frequencyMinutes: z.number().int().min(1).max(1440),
    use_free_tier: z.boolean().default(false),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const settings = await loadAdPricingSettings(db);
    const freeUsed = await countFreeAdsThisMonth(db, context.userId);
    const eligibleForFree = qualifiesForFreeTier(
      { days: data.days, placementsCount: data.placementsCount }, settings, freeUsed,
    );
    if (data.use_free_tier && eligibleForFree) {
      return { price_kobo: 0, breakdown: [{ label: "Free tier (admin-sponsored)", amount_kobo: 0 }], is_free: true, eligible_for_free: true };
    }
    const result = computeAdPrice(data, settings);
    return { ...result, is_free: false, eligible_for_free: eligibleForFree };
  });

/**
 * Creator self-serve ad submission. Always lands as status='pending',
 * active=false — an admin must approve it (adminReviewAd) before it shows
 * anywhere. If priced (not free tier), the client must separately direct the
 * user to /wallet to upload a payment receipt for the returned price; see
 * src/lib/ads-settle.server.ts for the settlement contract the payments
 * agent should wire up (activatePaidAd / getAdPriceForPayment).
 */
export const submitAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => creatorAdInput.parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const settings = await loadAdPricingSettings(db);
    const freeUsed = await countFreeAdsThisMonth(db, context.userId);
    const eligibleForFree = qualifiesForFreeTier(
      { days: data.days, placementsCount: data.placements.length }, settings, freeUsed,
    );
    const wantsFree = data.use_free_tier && eligibleForFree;

    let price_kobo = 0;
    let is_free = false;
    if (wantsFree) {
      is_free = true;
      price_kobo = 0;
    } else {
      const priced = computeAdPrice({
        days: data.days, placementsCount: data.placements.length, weight: data.weight, frequencyMinutes: data.frequency_minutes,
      }, settings);
      price_kobo = priced.price_kobo;
    }

    const { use_free_tier, ...rest } = data;
    const { data: row, error } = await db.from("ads").insert({
      ...rest,
      created_by: context.userId,
      status: "pending",
      active: false,
      auto_show: true,
      is_free,
      price_kobo,
      paid_at: is_free ? new Date().toISOString() : null,
    }).select().single();
    if (error) throw error;
    return row;
  });

/** A creator's own ad submissions, with status/price visibility. */
export const listMyAds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data, error } = await db.from("ads").select("*").eq("created_by", context.userId).order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });
