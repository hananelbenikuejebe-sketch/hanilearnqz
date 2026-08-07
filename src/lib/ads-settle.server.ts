// Server-only helpers for settling paid ad submissions.
//
// CONTRACT FOR THE PAYMENTS/PROOFS AGENT:
// When a payment_proofs row with purpose === "ad_placement" (meta.ad_id
// pointing at the `ads` row) is confirmed/approved — whether by auto-approve
// or by an admin clicking "confirm" in the proofs review UI — call:
//
//     import { activatePaidAd } from "@/lib/ads-settle.server";
//     await activatePaidAd(adId);
//
// This stamps `paid_at` on the ad and leaves it at status='pending' (ads
// always need a human approval pass regardless of payment, per the ads
// admin workflow). It does NOT set active=true — that only happens when an
// admin approves the ad in /admin/ads via `adminReviewAd`.
//
// `getAdPriceForPayment(adId)` returns the amount (in kobo) the proof should
// be checked against, plus the ad title, for building the payment_proofs
// `amount_kobo` / description fields.

export async function getAdPriceForPayment(adId: string): Promise<{ ad_id: string; title: string; price_kobo: number; is_free: boolean; created_by: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data: ad, error } = await db.from("ads").select("id, title, price_kobo, is_free, created_by").eq("id", adId).maybeSingle();
  if (error) throw error;
  if (!ad) throw new Error("Ad not found");
  return { ad_id: ad.id, title: ad.title, price_kobo: Number(ad.price_kobo ?? 0), is_free: !!ad.is_free, created_by: ad.created_by };
}

export async function activatePaidAd(adId: string): Promise<{ ok: true }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data: ad, error: findError } = await db.from("ads").select("id, status").eq("id", adId).maybeSingle();
  if (findError) throw findError;
  if (!ad) throw new Error("Ad not found");
  const { error } = await db.from("ads").update({
    paid_at: new Date().toISOString(),
    status: ad.status === "rejected" ? "pending" : ad.status,
  }).eq("id", adId);
  if (error) throw error;
  return { ok: true };
}
