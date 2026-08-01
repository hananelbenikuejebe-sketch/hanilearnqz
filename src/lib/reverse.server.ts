/**
 * Reversal of a settled payment. Used when an admin declines a manual payment
 * that was auto-approved. Everything the settlement granted is undone and
 * ledgered, so wallets stay truthful on all ends.
 */
export async function reverseIntent(db: any, intentId: string, reason: string) {
  const { data: intent } = await db.from("payment_intents").select("*").eq("id", intentId).maybeSingle();
  if (!intent) throw new Error("Payment not found");
  if (intent.status === "reversed") return { status: "reversed" };

  const amount = Number(intent.amount_kobo ?? 0);
  const ref = intent.payment_reference;

  if (intent.purpose === "creator_access") {
    await db.from("subscriptions").update({ active: false }).eq("source_payment_intent", intent.id);
    const { data: stillActive } = await db.from("subscriptions").select("id")
      .eq("user_id", intent.user_id).eq("kind", "creator_access").eq("active", true)
      .gt("expires_at", new Date().toISOString()).maybeSingle();
    if (!stillActive) {
      await db.from("user_roles").delete().eq("user_id", intent.user_id).eq("role", "creator");
      const { data: settings } = await db.from("payment_settings").select("free_max_quizzes_per_month").eq("id", "default").maybeSingle();
      await db.from("creator_permissions").update({
        ai_enabled: false,
        can_publish: false,
        max_quizzes: settings?.free_max_quizzes_per_month ?? 3,
        notes: `Reversed: ${reason}`,
      }).eq("user_id", intent.user_id);
    }
  } else if (intent.purpose === "quiz_purchase") {
    const quizId = intent.meta?.quiz_id;
    const creatorId = intent.meta?.creator_id;
    if (quizId) await db.from("quiz_purchases").delete().eq("payment_intent_id", intent.id);
    if (creatorId) {
      const { data: sale } = await db.from("wallet_transactions").select("amount_kobo")
        .eq("user_id", creatorId).eq("kind", "quiz_sale").eq("monnify_ref", ref).maybeSingle();
      const share = Number(sale?.amount_kobo ?? 0);
      if (share > 0) {
        const { data: cw } = await db.from("wallets").select("balance_kobo").eq("user_id", creatorId).maybeSingle();
        await db.from("wallets").update({ balance_kobo: Math.max(0, Number(cw?.balance_kobo ?? 0) - share) }).eq("user_id", creatorId);
        await db.from("wallet_transactions").insert({
          user_id: creatorId, kind: "adjustment", amount_kobo: -share, bucket: "earnings",
          monnify_ref: ref, meta: { reason: "payment_reversed", quiz_id: quizId },
        });
      }
    }
  } else {
    // AI credit top-up reversal
    const { data: w } = await db.from("wallets").select("ai_credit_balance_kobo").eq("user_id", intent.user_id).maybeSingle();
    await db.from("wallets").update({
      ai_credit_balance_kobo: Math.max(0, Number(w?.ai_credit_balance_kobo ?? 0) - amount),
    }).eq("user_id", intent.user_id);
  }

  // Affiliate commission reversal
  if (intent.affiliate_user_id) {
    const { data: comm } = await db.from("wallet_transactions").select("amount_kobo")
      .eq("user_id", intent.affiliate_user_id).eq("kind", "affiliate_earn").eq("monnify_ref", ref).maybeSingle();
    const c = Number(comm?.amount_kobo ?? 0);
    if (c > 0) {
      const { data: aw } = await db.from("wallets").select("balance_kobo").eq("user_id", intent.affiliate_user_id).maybeSingle();
      await db.from("wallets").update({ balance_kobo: Math.max(0, Number(aw?.balance_kobo ?? 0) - c) }).eq("user_id", intent.affiliate_user_id);
      await db.from("wallet_transactions").insert({
        user_id: intent.affiliate_user_id, kind: "adjustment", amount_kobo: -c, bucket: "earnings",
        monnify_ref: ref, meta: { reason: "payment_reversed" },
      });
    }
  }

  await db.from("wallet_transactions").insert({
    user_id: intent.user_id,
    kind: "payment_reversed",
    amount_kobo: -amount,
    bucket: intent.purpose === "ai_credit" ? "ai_credit" : "purchase",
    monnify_ref: ref,
    meta: { reason, intent_id: intent.id },
  });
  await db.from("payment_intents").update({ status: "reversed", meta: { ...(intent.meta ?? {}), reversal_reason: reason } }).eq("id", intent.id);
  return { status: "reversed" };
}
