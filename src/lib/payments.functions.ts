import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSuperAdmin } from "./authz.server";

export const getPaymentSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("payment_settings").select("*").eq("id", "default").maybeSingle();
    if (error) throw error;
    return data;
  });

export const updatePaymentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    creator_access_price_kobo: z.number().int().min(0).optional(),
    creator_access_duration_days: z.number().int().min(1).max(365).optional(),
    creator_access_quiz_cap: z.number().int().min(1).max(10000).optional(),
    creator_access_includes_ai: z.boolean().optional(),
    creator_plan_prices: z.record(z.string(), z.number().int().min(0)).optional(),
    ai_result_price_kobo: z.number().int().min(0).optional(),
    ai_essay_price_kobo: z.number().int().min(0).optional(),
    ai_parser_rate_per_1k_input_kobo: z.number().int().min(0).optional(),
    ai_parser_rate_per_1k_output_kobo: z.number().int().min(0).optional(),
    ai_credit_min_topup_kobo: z.number().int().min(100).optional(),
    ai_credit_expiry_days: z.number().int().min(1).max(365).optional(),
    feature_locks: z.record(z.string(), z.boolean()).optional(),
    affiliate_pct: z.number().int().min(0).max(80).optional(),
    withdrawal_min_kobo: z.number().int().min(0).optional(),
    withdrawal_whatsapp: z.string().max(30).optional(),
    quiz_platform_fee_pct: z.number().int().min(0).max(90).optional(),
    topup_fee_pct: z.number().min(0).max(20).optional(),
    withdrawal_fee_pct: z.number().min(0).max(20).optional(),
    // free tier
    free_tier_enabled: z.boolean().optional(),
    free_max_questions_per_quiz: z.number().int().min(1).max(500).optional(),
    free_max_quizzes_per_month: z.number().int().min(0).max(1000).optional(),
    free_offline_parse_limit: z.number().int().min(1).max(500).optional(),
    free_ai_parse: z.boolean().optional(),
    free_monthly_ai_credit_kobo: z.number().int().min(0).max(1_000_000).optional(),
    // manual payment + receipt verification
    proof_auto_approve: z.boolean().optional(),
    proof_min_confidence: z.number().int().min(0).max(100).optional(),
    proof_laxity: z.enum(["lax", "normal", "strict"]).optional(),
    proof_max_age_days: z.number().int().min(1).max(60).optional(),
    proof_use_ai: z.boolean().optional(),
    pay_bank_name: z.string().max(80).optional(),
    pay_account_number: z.string().max(30).optional(),
    pay_account_name: z.string().max(120).optional(),
    support_whatsapp: z.string().max(30).optional(),
    ai_generate_price_kobo: z.number().int().min(0).optional(),
    ai_review_price_kobo: z.number().int().min(0).optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("payment_settings").update(data).eq("id", "default");
    if (error) throw error;
    return { ok: true };
  });

function requestOrigin() {
  try { return new URL(getRequest().url).origin; } catch { return "https://hanilearnqz.lovable.app"; }
}

function makeRef(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Kick off Monnify checkout for a purpose. Amount for creator_access is fixed from settings; ai_credit is user-chosen. */
export const initiatePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    purpose: z.enum(["creator_access", "ai_credit", "wallet_topup"]),
    amount_kobo: z.number().int().min(10000).optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { initTransaction } = await import("./monnify.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const { data: settings } = await db.from("payment_settings").select("*").eq("id", "default").single();
    if (!settings) throw new Error("Payment settings missing");

    // Resolve amount
    let amountKobo: number;
    if (data.purpose === "creator_access") {
      amountKobo = settings.creator_access_price_kobo;
    } else if (data.purpose === "wallet_topup") {
      if (!data.amount_kobo) throw new Error("Amount required for wallet top-up");
      if (data.amount_kobo < 10000) throw new Error("Minimum wallet top-up is ₦100");
      amountKobo = data.amount_kobo;
    } else {
      if (!data.amount_kobo) throw new Error("Amount required for AI credit top-up");
      if (data.amount_kobo < settings.ai_credit_min_topup_kobo) {
        throw new Error(`Minimum AI credit top-up is ₦${(settings.ai_credit_min_topup_kobo/100).toFixed(0)}`);
      }
      amountKobo = data.amount_kobo;
    }

    // Get user profile for email/name
    const { data: profile } = await db.from("profiles").select("full_name, email").eq("id", context.userId).maybeSingle();
    const email = profile?.email ?? `${context.userId}@user.hanilearnqz.local`;
    const name = profile?.full_name ?? "HaniLearn User";

    // Existing affiliate attribution for this user (if any)
    const { data: attr } = await db.from("affiliate_attributions").select("affiliate_user_id").eq("referred_user_id", context.userId).maybeSingle();

    const reference = makeRef(data.purpose === "creator_access" ? "CA" : data.purpose === "wallet_topup" ? "WT" : "AI");
    const origin = requestOrigin();
    const narration = data.purpose === "creator_access"
      ? `Creator access — 1 month (${settings.creator_access_quiz_cap} quiz cap)`
      : data.purpose === "wallet_topup"
      ? `Wallet top-up`
      : `AI credit top-up`;

    const init = await initTransaction({
      amount: amountKobo / 100,
      reference,
      narration,
      customerName: name,
      customerEmail: email,
      redirectUrl: `${origin}/wallet?ref=${encodeURIComponent(reference)}`,
    });

    await db.from("payment_intents").insert({
      user_id: context.userId,
      payment_reference: reference,
      purpose: data.purpose,
      amount_kobo: amountKobo,
      monnify_tx_ref: init.transactionReference,
      affiliate_user_id: attr?.affiliate_user_id ?? null,
      meta: { name, email },
    });

    return { checkoutUrl: init.checkoutUrl, reference };
  });

/** After redirect back from Monnify, client polls this to confirm & credit. */
export const verifyAndSettle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ reference: z.string().min(3).max(80) }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: intent } = await db.from("payment_intents").select("*").eq("payment_reference", data.reference).maybeSingle();
    if (!intent) throw new Error("Payment not found");
    if (intent.user_id !== context.userId && !(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Forbidden");
    if (intent.status === "paid") return { status: "paid", intent };

    const { verifyTransaction } = await import("./monnify.server");
    const verified = await verifyTransaction(data.reference);
    const paymentStatus = String(verified?.paymentStatus ?? "").toUpperCase();
    if (paymentStatus !== "PAID") return { status: "pending", intent };

    const paidAmountKobo = Math.round(Number(verified.amountPaid ?? 0) * 100);
    if (paidAmountKobo + 100 < intent.amount_kobo) {
      // Underpaid; do not credit. Mark failed.
      await db.from("payment_intents").update({ status: "failed", meta: { ...(intent.meta ?? {}), underpaid: paidAmountKobo } }).eq("id", intent.id);
      throw new Error("Amount underpaid. Contact support with your reference.");
    }
    return await settleIntent(db, intent, paidAmountKobo);
  });

/** Reusable creator-access grant: inserts subscription row + ensures creator role/permissions. */
export async function grantCreatorAccess(db: any, settings: any, userId: string, months: number, infinite: boolean, noteSuffix: string, sourceIntentId?: string) {
  const days = settings.creator_access_duration_days * months;
  const expires = infinite
    ? new Date("2999-12-31T00:00:00.000Z").toISOString()
    : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  await db.from("subscriptions").insert({
    user_id: userId, kind: "creator_access", expires_at: expires,
    source_payment_intent: sourceIntentId ?? null,
  });
  await db.from("user_roles").upsert({ user_id: userId, role: "creator" }, { onConflict: "user_id,role" });
  await db.from("creator_permissions").upsert({
    user_id: userId,
    ai_enabled: settings.creator_access_includes_ai,
    analytics_enabled: true,
    can_publish: true,
    max_quizzes: settings.creator_access_quiz_cap,
    notes: `Auto-granted via ${noteSuffix}`,
  }, { onConflict: "user_id" });
}

/** Idempotent settlement: only credits once. Reused by webhook + client verify. */
export async function settleIntent(db: any, intent: any, paidAmountKobo: number) {
  // Re-check inside the function to remain idempotent under concurrent calls.
  const { data: fresh } = await db.from("payment_intents").select("*").eq("id", intent.id).single();
  if (fresh.status === "paid") return { status: "paid", intent: fresh };

  const { data: settings } = await db.from("payment_settings").select("*").eq("id", "default").single();

  // 1) Mark paid
  await db.from("payment_intents").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", intent.id);

  // 2) Ensure wallet row
  await db.from("wallets").upsert({ user_id: intent.user_id }, { onConflict: "user_id" });

  // 3) Ledger the top-up (wallet_topup ledgered inside its own branch below, net of fee)
  const isAdPurpose = intent.purpose === "ad_placement" || intent.purpose === "ad_boost";
  if (intent.purpose !== "wallet_topup") {
    await db.from("wallet_transactions").insert({
      user_id: intent.user_id,
      kind: intent.purpose === "creator_access" ? "creator_purchase"
        : intent.purpose === "quiz_purchase" ? "quiz_purchase"
        : isAdPurpose ? "ad_purchase"
        : "ai_credit_topup",
      amount_kobo: paidAmountKobo,
      bucket: intent.purpose === "creator_access" ? "purchase" : intent.purpose === "quiz_purchase" ? "purchase" : isAdPurpose ? "purchase" : "ai_credit",
      monnify_ref: intent.payment_reference,
      meta: { intent_id: intent.id },
    });
  }

  // 4) Grant the thing
  if (intent.purpose === "creator_access") {
    const months = Math.max(1, Number((intent.meta ?? {}).months ?? 1));
    const infinite = !!(intent.meta ?? {}).infinite;
    await grantCreatorAccess(db, settings, intent.user_id, months, infinite, `payment ${intent.payment_reference}`, intent.id);
  } else if (intent.purpose === "quiz_purchase") {
    const meta = intent.meta ?? {};
    const quizId = meta.quiz_id;
    const creatorId = meta.creator_id;
    if (quizId && creatorId) {
      const { data: alreadyBought } = await db.from("quiz_purchases").select("id").eq("user_id", intent.user_id).eq("quiz_id", quizId).maybeSingle();
      if (!alreadyBought) {
        await db.from("quiz_purchases").insert({
          user_id: intent.user_id, quiz_id: quizId,
          payment_intent_id: intent.id, price_kobo: paidAmountKobo,
        });
      }
      // Platform fee, remainder credited to creator's earnings wallet.
      const feePct = settings.quiz_platform_fee_pct ?? 10;
      const platformFee = Math.floor((paidAmountKobo * feePct) / 100);
      const creatorShare = paidAmountKobo - platformFee;
      if (creatorShare > 0) {
        await db.from("wallets").upsert({ user_id: creatorId }, { onConflict: "user_id" });
        const { data: cw } = await db.from("wallets").select("balance_kobo").eq("user_id", creatorId).single();
        await db.from("wallets").update({ balance_kobo: (cw?.balance_kobo ?? 0) + creatorShare }).eq("user_id", creatorId);
        await db.from("wallet_transactions").insert({
          user_id: creatorId, kind: "quiz_sale", amount_kobo: creatorShare, bucket: "earnings",
          monnify_ref: intent.payment_reference,
          meta: { quiz_id: quizId, buyer: intent.user_id, gross_kobo: paidAmountKobo, platform_fee_kobo: platformFee, fee_pct: feePct },
        });
      }
      if (platformFee > 0) {
        const { creditPlatformFee } = await import("./platform-wallet.server");
        await creditPlatformFee(db, platformFee, { reason: "quiz_platform_fee", quiz_id: quizId, buyer: intent.user_id, creator_id: creatorId, intent_id: intent.id, fee_pct: feePct });
      }
    }
  } else if (intent.purpose === "wallet_topup") {
    const feePct = Number(settings.topup_fee_pct ?? 5);
    const fee = Math.floor((paidAmountKobo * feePct) / 100);
    const net = paidAmountKobo - fee;
    const { data: w } = await db.from("wallets").select("balance_kobo").eq("user_id", intent.user_id).single();
    await db.from("wallets").update({ balance_kobo: (w?.balance_kobo ?? 0) + net }).eq("user_id", intent.user_id);
    await db.from("wallet_transactions").insert({
      user_id: intent.user_id, kind: "wallet_topup", amount_kobo: net, bucket: "earnings",
      monnify_ref: intent.payment_reference,
      meta: { intent_id: intent.id, gross_kobo: paidAmountKobo, fee_kobo: fee, fee_pct: feePct },
    });
    if (fee > 0) {
      const { creditPlatformFee } = await import("./platform-wallet.server");
      await creditPlatformFee(db, fee, { reason: "topup_fee", intent_id: intent.id, user_id: intent.user_id, fee_pct: feePct });
    }
  } else if (isAdPurpose) {
    // Ad purchases: the full price is platform revenue; the ad itself is
    // stamped paid (still needs admin approval before it goes live).
    const adId = (intent.meta ?? {}).ad_id;
    if (adId) {
      try {
        const { activatePaidAd } = await import("@/lib/ads-settle.server");
        await activatePaidAd(adId);
      } catch (e) {
        console.error("activatePaidAd failed (module may not be ready yet)", e);
      }
    }
    const { creditPlatformFee } = await import("./platform-wallet.server");
    await creditPlatformFee(db, paidAmountKobo, { reason: "ad_purchase", ad_id: adId, buyer: intent.user_id, intent_id: intent.id });
  } else {
    // AI credit top-up: extend expiry to X days from now; add to balance.
    const expires = new Date(Date.now() + settings.ai_credit_expiry_days * 24 * 60 * 60 * 1000).toISOString();
    const { data: w } = await db.from("wallets").select("ai_credit_balance_kobo").eq("user_id", intent.user_id).single();
    await db.from("wallets").update({
      ai_credit_balance_kobo: (w?.ai_credit_balance_kobo ?? 0) + paidAmountKobo,
      ai_credit_expires_at: expires,
    }).eq("user_id", intent.user_id);
  }

  // 5) Affiliate commission (only on real purchases, never on wallet top-ups per policy)
  // Quiz purchases exclude affiliate commission — the creator is already paid.
  if (intent.affiliate_user_id && settings.affiliate_pct > 0 && intent.purpose !== "quiz_purchase" && intent.purpose !== "wallet_topup" && !isAdPurpose) {
    const commission = Math.floor((paidAmountKobo * settings.affiliate_pct) / 100);
    if (commission > 0) {
      await db.from("wallets").upsert({ user_id: intent.affiliate_user_id }, { onConflict: "user_id" });
      const { data: aw } = await db.from("wallets").select("balance_kobo").eq("user_id", intent.affiliate_user_id).single();
      await db.from("wallets").update({ balance_kobo: (aw?.balance_kobo ?? 0) + commission }).eq("user_id", intent.affiliate_user_id);
      await db.from("wallet_transactions").insert({
        user_id: intent.affiliate_user_id,
        kind: "affiliate_earn",
        amount_kobo: commission,
        bucket: "earnings",
        monnify_ref: intent.payment_reference,
        meta: { from_user: intent.user_id, purpose: intent.purpose, pct: settings.affiliate_pct },
      });
    }
  }

  const { data: finalIntent } = await db.from("payment_intents").select("*").eq("id", intent.id).single();
  return { status: "paid", intent: finalIntent };
}

/** Check current creator subscription (if any). */
export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("subscriptions")
      .select("*").eq("user_id", context.userId).eq("kind", "creator_access")
      .order("expires_at", { ascending: false }).limit(1).maybeSingle();
    if (!data) return { active: false };
    const active = !!data.active && new Date(data.expires_at).getTime() > Date.now();
    return { active, expires_at: data.expires_at, starts_at: data.starts_at };
  });

/** Start a Monnify checkout to buy access to a single paid quiz. */
export const initiateQuizPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ quiz_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { initTransaction } = await import("./monnify.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const { data: quiz } = await db.from("quizzes")
      .select("id, title, price_kobo, created_by, is_published, visibility")
      .eq("id", data.quiz_id).maybeSingle();
    if (!quiz) throw new Error("Quiz not found");
    if (!quiz.is_published) throw new Error("Quiz not published");
    if (!quiz.price_kobo || quiz.price_kobo <= 0) throw new Error("This quiz is free — no purchase needed.");
    if (quiz.created_by === context.userId) throw new Error("You own this quiz.");
    const { data: existing } = await db.from("quiz_purchases")
      .select("id").eq("user_id", context.userId).eq("quiz_id", data.quiz_id).maybeSingle();
    if (existing) throw new Error("You already purchased this quiz.");

    const { data: profile } = await db.from("profiles").select("full_name, email").eq("id", context.userId).maybeSingle();
    const email = profile?.email ?? `${context.userId}@user.hanilearnqz.local`;
    const name = profile?.full_name ?? "HaniLearn User";
    const reference = makeRef("QZ");
    const origin = requestOrigin();

    const init = await initTransaction({
      amount: quiz.price_kobo / 100,
      reference,
      narration: `Quiz — ${String(quiz.title).slice(0, 50)}`,
      customerName: name,
      customerEmail: email,
      redirectUrl: `${origin}/quiz/${data.quiz_id}?ref=${encodeURIComponent(reference)}`,
    });

    await db.from("payment_intents").insert({
      user_id: context.userId,
      payment_reference: reference,
      purpose: "quiz_purchase",
      amount_kobo: quiz.price_kobo,
      monnify_tx_ref: init.transactionReference,
      meta: { name, email, quiz_id: data.quiz_id, creator_id: quiz.created_by, quiz_title: quiz.title },
    });
    return { checkoutUrl: init.checkoutUrl, reference };
  });
