// Server-only helper: routes platform fees/revenue into the super-admin's wallet.
//
// The "platform account" is the earliest user with role 'admin' in user_roles.
// Call this instead of hand-rolling wallet credits whenever the platform takes
// a cut (top-up fee, withdrawal fee, quiz platform fee, ad purchases, etc.)
// so all platform revenue lands in one auditable place and is never silently
// dropped.

let cachedPlatformUserId: string | null = null;

async function resolvePlatformUserId(db: any): Promise<string | null> {
  if (cachedPlatformUserId) return cachedPlatformUserId;
  const { data } = await db
    .from("user_roles")
    .select("user_id, created_at")
    .eq("role", "admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data?.user_id) return null;
  cachedPlatformUserId = data.user_id;
  return data.user_id;
}

/**
 * Credits `amount_kobo` to the platform (super-admin) wallet and writes a
 * `platform_fee` wallet_transactions row. No-ops (and logs) if there is no
 * admin account yet, or if amount_kobo <= 0. Never throws — a missing
 * platform account must not break the purchase flow that earned the fee.
 */
export async function creditPlatformFee(db: any, amount_kobo: number, meta: Record<string, unknown> = {}): Promise<{ ok: boolean; platform_user_id?: string }> {
  const amt = Math.round(Number(amount_kobo) || 0);
  if (amt <= 0) return { ok: false };
  try {
    const platformUserId = await resolvePlatformUserId(db);
    if (!platformUserId) {
      console.error("creditPlatformFee: no admin account found to receive platform fee", meta);
      return { ok: false };
    }
    await db.from("wallets").upsert({ user_id: platformUserId }, { onConflict: "user_id" });
    const { data: w } = await db.from("wallets").select("balance_kobo").eq("user_id", platformUserId).single();
    await db.from("wallets").update({ balance_kobo: (w?.balance_kobo ?? 0) + amt }).eq("user_id", platformUserId);
    await db.from("wallet_transactions").insert({
      user_id: platformUserId,
      kind: "platform_fee",
      amount_kobo: amt,
      bucket: "earnings",
      meta,
    });
    return { ok: true, platform_user_id: platformUserId };
  } catch (e) {
    console.error("creditPlatformFee failed", e);
    return { ok: false };
  }
}
