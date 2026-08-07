// Pure, framework-agnostic pricing helper for ads. Importable from both
// server functions and client UI so the creator can see a live breakdown
// before submitting, and the server can independently verify the price.

export type AdPricingSettings = {
  ad_base_day_kobo: number;
  ad_extra_placement_pct: number;
  ad_weight_pct_per_10: number;
  ad_frequency_pct: number;
  ad_free_tier_enabled?: boolean;
  ad_free_days?: number;
  ad_free_placements?: number;
  ad_free_monthly_limit?: number;
};

export type AdPricingInput = {
  days: number;
  placementsCount: number;
  weight: number;
  frequencyMinutes: number;
};

export type AdPriceBreakdownItem = { label: string; amount_kobo: number };

export type AdPriceResult = {
  price_kobo: number;
  breakdown: AdPriceBreakdownItem[];
};

/**
 * price = base_day * days
 *   + extra-placement surcharge (each placement beyond the first adds
 *     ad_extra_placement_pct% of the base for that day count)
 *   + weight surcharge (each 10 weight points above 10 adds
 *     ad_weight_pct_per_10% of the base)
 *   + frequency surcharge (frequency below 60 minutes adds up to
 *     ad_frequency_pct%, scaled linearly by how aggressive it is —
 *     a 1-minute frequency is the most aggressive/expensive, 60+ minutes
 *     adds nothing)
 */
export function computeAdPrice(input: AdPricingInput, settings: AdPricingSettings): AdPriceResult {
  const days = Math.max(1, Math.floor(input.days || 1));
  const placements = Math.max(1, Math.floor(input.placementsCount || 1));
  const weight = Math.max(1, Math.floor(input.weight || 10));
  const frequency = Math.max(1, Math.floor(input.frequencyMinutes || 60));

  const base = Math.round(Number(settings.ad_base_day_kobo ?? 20000) * days);
  const breakdown: AdPriceBreakdownItem[] = [
    { label: `Base rate (₦${(Number(settings.ad_base_day_kobo ?? 20000) / 100).toFixed(0)}/day × ${days} day${days === 1 ? "" : "s"})`, amount_kobo: base },
  ];

  let total = base;

  const extraPlacements = placements - 1;
  if (extraPlacements > 0) {
    const pct = Number(settings.ad_extra_placement_pct ?? 50) * extraPlacements;
    const amount = Math.round(base * (pct / 100));
    breakdown.push({ label: `Extra placements (+${extraPlacements} × ${settings.ad_extra_placement_pct ?? 50}%)`, amount_kobo: amount });
    total += amount;
  }

  const extraWeightUnits = Math.max(0, Math.floor((weight - 10) / 10));
  if (extraWeightUnits > 0) {
    const pct = Number(settings.ad_weight_pct_per_10 ?? 25) * extraWeightUnits;
    const amount = Math.round(base * (pct / 100));
    breakdown.push({ label: `Higher weight/priority (+${pct}%)`, amount_kobo: amount });
    total += amount;
  }

  if (frequency < 60) {
    // 1 minute = most aggressive (full pct), 60 minutes = no surcharge.
    const aggressiveness = Math.min(1, Math.max(0, (60 - frequency) / 59));
    const pct = Number(settings.ad_frequency_pct ?? 30) * aggressiveness;
    const amount = Math.round(base * (pct / 100));
    if (amount > 0) {
      breakdown.push({ label: `Frequent display (every ${frequency}m, +${pct.toFixed(0)}%)`, amount_kobo: amount });
      total += amount;
    }
  }

  return { price_kobo: total, breakdown };
}

/** Whether a submission qualifies for the admin-configured free tier. */
export function qualifiesForFreeTier(
  input: { days: number; placementsCount: number },
  settings: AdPricingSettings,
  freeAdsUsedThisMonth: number,
): boolean {
  if (!settings.ad_free_tier_enabled) return false;
  const limit = Number(settings.ad_free_monthly_limit ?? 1);
  if (freeAdsUsedThisMonth >= limit) return false;
  if (input.days > Number(settings.ad_free_days ?? 1)) return false;
  if (input.placementsCount > Number(settings.ad_free_placements ?? 1)) return false;
  return true;
}
