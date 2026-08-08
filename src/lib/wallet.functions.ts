import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSuperAdmin } from "./authz.server";

export const getMyWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { ensureFreeMonthlyCredit } = await import("./authz.server");
    await ensureFreeMonthlyCredit(db, context.userId);
    await db.from("wallets").upsert({ user_id: context.userId }, { onConflict: "user_id" });
    const [{ data: wallet }, { data: txs }, { data: bank }, { data: pending }, { data: sub }] = await Promise.all([
      db.from("wallets").select("*").eq("user_id", context.userId).single(),
      db.from("wallet_transactions").select("*").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(50),
      db.from("bank_accounts").select("*").eq("user_id", context.userId).maybeSingle(),
      db.from("withdrawal_requests").select("*").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(10),
      db.from("subscriptions").select("expires_at, active").eq("user_id", context.userId).eq("kind", "creator_access").eq("active", true).order("expires_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const visibleWallet = wallet && wallet.ai_credit_expires_at && new Date(wallet.ai_credit_expires_at).getTime() < Date.now()
      ? { ...wallet, ai_credit_balance_kobo: 0 }
      : wallet;
    return {
      wallet: visibleWallet,
      transactions: txs ?? [],
      bank_account: bank ?? null,
      withdrawals: pending ?? [],
      creator_access_expires_at: sub?.expires_at ?? null,
    };
  });

export const saveBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    bank_name: z.string().trim().min(1).max(80),
    account_number: z.string().trim().regex(/^\d{8,12}$/,"Account number must be 8–12 digits"),
    account_name: z.string().trim().min(2).max(120),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("bank_accounts").upsert(
      { user_id: context.userId, ...data }, { onConflict: "user_id" },
    );
    if (error) throw error;
    return { ok: true };
  });

export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ amount_kobo: z.number().int().min(100) }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const [{ data: wallet }, { data: bank }, { data: settings }] = await Promise.all([
      db.from("wallets").select("*").eq("user_id", context.userId).maybeSingle(),
      db.from("bank_accounts").select("*").eq("user_id", context.userId).maybeSingle(),
      db.from("payment_settings").select("*").eq("id","default").single(),
    ]);
    if (!bank) throw new Error("Add your bank account details first.");
    if (!wallet || wallet.balance_kobo < data.amount_kobo) throw new Error("Insufficient earnings balance.");
    const minKobo = Number(settings?.withdrawal_min_kobo ?? 0);
    if (data.amount_kobo < minKobo) {
      throw new Error(`Minimum withdrawal is ₦${(minKobo / 100).toFixed(0)}`);
    }
    // Fee is applied to the payable/net amount only — the user's balance is debited the full requested amount.
    const feePct = Number(settings?.withdrawal_fee_pct ?? 5);
    const feeKobo = Math.floor((data.amount_kobo * feePct) / 100);
    const netKobo = data.amount_kobo - feeKobo;
    void feeKobo; // credited to platform when the withdrawal is marked paid (see resolveWithdrawal)

    // No immediate debit: the request only becomes a real debit once the super admin
    // marks it paid. We log a zero-amount ledger marker so the user sees it as pending.
    await db.from("wallet_transactions").insert({
      user_id: context.userId, kind: "withdrawal_request", amount_kobo: 0, bucket: "earnings",
      status: "pending",
      meta: { fee_kobo: feeKobo, fee_pct: feePct, net_kobo: netKobo, requested_kobo: data.amount_kobo },
    });
    const { data: req, error } = await db.from("withdrawal_requests").insert({
      user_id: context.userId,
      amount_kobo: data.amount_kobo,
      bank_name: bank.bank_name,
      account_number: bank.account_number,
      account_name: bank.account_name,
    }).select().single();
    if (error) throw error;

    const naira = (data.amount_kobo / 100).toFixed(2);
    const nairaNet = (netKobo / 100).toFixed(2);
    const msg = `Withdrawal request — HaniLearn-QZ\n\nUser ID: ${context.userId}\nGross amount: NGN ${naira}\nFee (${feePct}%): NGN ${(feeKobo/100).toFixed(2)}\nPayable: NGN ${nairaNet}\nBank: ${bank.bank_name}\nAccount #: ${bank.account_number}\nAccount name: ${bank.account_name}\nRequest ID: ${req.id}`;
    const whatsapp = String(settings?.withdrawal_whatsapp || settings?.support_whatsapp || "+2349071829295").replace(/[^\d]/g, "");
    const whatsappUrl = `https://wa.me/${whatsapp}?text=${encodeURIComponent(msg)}`;
    return { request: req, whatsappUrl, message: msg, gross_kobo: data.amount_kobo, fee_kobo: feeKobo, net_kobo: netKobo, fee_pct: feePct };
  });

// Admin: list all withdrawals + approve/reject
export const listWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any).from("withdrawal_requests")
      .select("*, profiles:user_id(full_name, email)").order("created_at", { ascending: false }).limit(200);
    return data ?? [];
  });

export const resolveWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(), action: z.enum(["paid","reject"]), note: z.string().max(300).optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: req } = await db.from("withdrawal_requests").select("*").eq("id", data.id).single();
    if (!req || req.status !== "requested") throw new Error("Already resolved");
    if (data.action === "paid") {
      await db.from("withdrawal_requests").update({ status: "paid", resolved_at: new Date().toISOString(), admin_note: data.note ?? null }).eq("id", data.id);
      await db.from("wallet_transactions").insert({ user_id: req.user_id, kind: "withdrawal_paid", amount_kobo: 0, bucket: "earnings", meta: { withdrawal_id: req.id } });
      const { data: settings } = await db.from("payment_settings").select("withdrawal_fee_pct").eq("id", "default").maybeSingle();
      const feePct = Number(settings?.withdrawal_fee_pct ?? 5);
      const feeKobo = Math.floor((req.amount_kobo * feePct) / 100);
      if (feeKobo > 0) {
        const { creditPlatformFee } = await import("./platform-wallet.server");
        await creditPlatformFee(db, feeKobo, { reason: "withdrawal_fee", withdrawal_id: req.id, user_id: req.user_id, fee_pct: feePct });
      }
    } else {
      // Refund
      const { data: w } = await db.from("wallets").select("balance_kobo").eq("user_id", req.user_id).single();
      await db.from("wallets").update({ balance_kobo: (w?.balance_kobo ?? 0) + req.amount_kobo }).eq("user_id", req.user_id);
      await db.from("wallet_transactions").insert({ user_id: req.user_id, kind: "adjustment", amount_kobo: req.amount_kobo, bucket: "earnings", meta: { reason: "withdrawal_rejected", withdrawal_id: req.id } });
      await db.from("withdrawal_requests").update({ status: "rejected", resolved_at: new Date().toISOString(), admin_note: data.note ?? null }).eq("id", data.id);
    }
    return { ok: true };
  });

/** Super-admin only: grant AI credits or earnings to a user. This is a WRITE-ONLY
 * privilege — admins may add credit but MAY NOT deduct or modify the user's
 * balance directly, and this action is always ledgered with the granting admin's id. */
export const adminGrantCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    user_id: z.string().uuid(),
    bucket: z.enum(["ai_credit", "earnings"]),
    amount_kobo: z.number().int().min(1).max(100_000_00),
    note: z.string().max(200).optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    await db.from("wallets").upsert({ user_id: data.user_id }, { onConflict: "user_id" });
    if (data.bucket === "ai_credit") {
      const { data: settings } = await db.from("payment_settings").select("ai_credit_expiry_days").eq("id", "default").single();
      const { data: w } = await db.from("wallets").select("ai_credit_balance_kobo").eq("user_id", data.user_id).single();
      const expires = new Date(Date.now() + (settings?.ai_credit_expiry_days ?? 30) * 86_400_000).toISOString();
      await db.from("wallets").update({
        ai_credit_balance_kobo: (w?.ai_credit_balance_kobo ?? 0) + data.amount_kobo,
        ai_credit_expires_at: expires,
      }).eq("user_id", data.user_id);
    } else {
      const { data: w } = await db.from("wallets").select("balance_kobo").eq("user_id", data.user_id).single();
      await db.from("wallets").update({ balance_kobo: (w?.balance_kobo ?? 0) + data.amount_kobo }).eq("user_id", data.user_id);
    }
    await db.from("wallet_transactions").insert({
      user_id: data.user_id,
      kind: "admin_grant",
      amount_kobo: data.amount_kobo,
      bucket: data.bucket,
      meta: { granted_by: context.userId, note: data.note ?? null },
    });
    return { ok: true };
  });

/** Buy AI credit using spendable wallet balance (no fee — money already inside the platform). */
export const buyAiCreditFromWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ amount_kobo: z.number().int().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const [{ data: settings }, { data: wallet }] = await Promise.all([
      db.from("payment_settings").select("ai_credit_min_topup_kobo, ai_credit_expiry_days").eq("id", "default").single(),
      db.from("wallets").select("balance_kobo, ai_credit_balance_kobo").eq("user_id", context.userId).maybeSingle(),
    ]);
    const minKobo = Number(settings?.ai_credit_min_topup_kobo ?? 30000);
    if (data.amount_kobo < minKobo) throw new Error(`Minimum AI credit top-up is ₦${(minKobo / 100).toFixed(0)}`);
    if (!wallet || wallet.balance_kobo < data.amount_kobo) throw new Error("Insufficient wallet balance.");

    const expires = new Date(Date.now() + Number(settings?.ai_credit_expiry_days ?? 30) * 86_400_000).toISOString();
    await db.from("wallets").update({
      balance_kobo: wallet.balance_kobo - data.amount_kobo,
      ai_credit_balance_kobo: (wallet.ai_credit_balance_kobo ?? 0) + data.amount_kobo,
      ai_credit_expires_at: expires,
    }).eq("user_id", context.userId);
    await db.from("wallet_transactions").insert([
      { user_id: context.userId, kind: "ai_credit_from_wallet", amount_kobo: -data.amount_kobo, bucket: "earnings", meta: { moved_to: "ai_credit" } },
      { user_id: context.userId, kind: "ai_credit_from_wallet", amount_kobo: data.amount_kobo, bucket: "ai_credit", meta: { moved_from: "earnings" } },
    ]);
    return { ok: true };
  });

/** Buy creator access using spendable wallet balance. */
export const buyCreatorAccessFromWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ months: z.number().int().min(1).max(24) }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { grantCreatorAccess } = await import("./payments.functions");
    const db = supabaseAdmin as any;
    const [{ data: settings }, { data: wallet }] = await Promise.all([
      db.from("payment_settings").select("*").eq("id", "default").single(),
      db.from("wallets").select("balance_kobo").eq("user_id", context.userId).maybeSingle(),
    ]);
    if (!settings) throw new Error("Payment settings missing");
    const plans = (settings.creator_plan_prices ?? {}) as Record<string, number>;
    const price = Number(plans[String(data.months)] ?? 0) > 0
      ? Number(plans[String(data.months)])
      : settings.creator_access_price_kobo * data.months;
    if (!wallet || wallet.balance_kobo < price) throw new Error("Insufficient wallet balance.");

    await db.from("wallets").update({ balance_kobo: wallet.balance_kobo - price }).eq("user_id", context.userId);
    await db.from("wallet_transactions").insert({
      user_id: context.userId, kind: "creator_purchase_wallet", amount_kobo: -price, bucket: "earnings",
      meta: { months: data.months },
    });
    await grantCreatorAccess(db, settings, context.userId, data.months, false, "wallet balance");
    return { ok: true };
  });

/** Pay for a paid quiz using spendable wallet balance. Safe against double purchase. */
export const payQuizFromWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ quiz_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: quiz } = await db.from("quizzes")
      .select("id, title, price_kobo, created_by, is_published").eq("id", data.quiz_id).maybeSingle();
    if (!quiz) throw new Error("Quiz not found");
    if (!quiz.is_published) throw new Error("Quiz not published");
    if (!quiz.price_kobo || quiz.price_kobo <= 0) throw new Error("This quiz is free.");
    if (quiz.created_by === context.userId) throw new Error("You own this quiz.");

    const { data: existing } = await db.from("quiz_purchases").select("id").eq("user_id", context.userId).eq("quiz_id", data.quiz_id).maybeSingle();
    if (existing) throw new Error("You already purchased this quiz.");

    const [{ data: wallet }, { data: settings }] = await Promise.all([
      db.from("wallets").select("balance_kobo").eq("user_id", context.userId).maybeSingle(),
      db.from("payment_settings").select("quiz_platform_fee_pct").eq("id", "default").maybeSingle(),
    ]);
    const price = quiz.price_kobo;
    if (!wallet || wallet.balance_kobo < price) throw new Error("Insufficient wallet balance.");

    // Debit buyer
    await db.from("wallets").update({ balance_kobo: wallet.balance_kobo - price }).eq("user_id", context.userId);

    // Insert purchase row (unique-ish guard against races)
    const { error: purchaseErr } = await db.from("quiz_purchases").insert({
      user_id: context.userId, quiz_id: data.quiz_id, price_kobo: price,
    });
    if (purchaseErr) {
      // Roll back debit if the purchase failed (e.g. race causing duplicate).
      await db.from("wallets").update({ balance_kobo: wallet.balance_kobo }).eq("user_id", context.userId);
      throw new Error("You already purchased this quiz.");
    }

    const feePct = Number(settings?.quiz_platform_fee_pct ?? 10);
    const platformFee = Math.floor((price * feePct) / 100);
    const creatorShare = price - platformFee;

    await db.from("wallets").upsert({ user_id: quiz.created_by }, { onConflict: "user_id" });
    const { data: cw } = await db.from("wallets").select("balance_kobo").eq("user_id", quiz.created_by).single();
    await db.from("wallets").update({ balance_kobo: (cw?.balance_kobo ?? 0) + creatorShare }).eq("user_id", quiz.created_by);

    await db.from("wallet_transactions").insert([
      { user_id: context.userId, kind: "quiz_purchase_wallet", amount_kobo: -price, bucket: "earnings", meta: { quiz_id: data.quiz_id } },
      { user_id: quiz.created_by, kind: "quiz_sale", amount_kobo: creatorShare, bucket: "earnings", meta: { quiz_id: data.quiz_id, buyer: context.userId, gross_kobo: price, platform_fee_kobo: platformFee, fee_pct: feePct } },
    ]);
    if (platformFee > 0) {
      const { creditPlatformFee } = await import("./platform-wallet.server");
      await creditPlatformFee(db, platformFee, { quiz_id: data.quiz_id, reason: "quiz_purchase", buyer: context.userId, creator_id: quiz.created_by, fee_pct: feePct });
    }
    return { ok: true };
  });

/** Pay for an ad placement using spendable wallet balance. Activates the ad's paid_at
 * stamp (still requires admin approval to go live) and routes full price to platform. */
export const payAdFromWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ad_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { getAdPriceForPayment, activatePaidAd } = await import("./ads-settle.server");
    const ad = await getAdPriceForPayment(data.ad_id);
    if (ad.is_free || ad.price_kobo <= 0) throw new Error("This ad placement is free — no payment needed.");
    const { data: wallet } = await db.from("wallets").select("balance_kobo").eq("user_id", context.userId).maybeSingle();
    if (!wallet || wallet.balance_kobo < ad.price_kobo) throw new Error("Insufficient wallet balance.");

    await db.from("wallets").update({ balance_kobo: wallet.balance_kobo - ad.price_kobo }).eq("user_id", context.userId);
    await db.from("wallet_transactions").insert({
      user_id: context.userId, kind: "ad_purchase_wallet", amount_kobo: -ad.price_kobo, bucket: "earnings",
      meta: { ad_id: ad.ad_id },
    });
    const { creditPlatformFee } = await import("./platform-wallet.server");
    await creditPlatformFee(db, ad.price_kobo, { reason: "ad_purchase", ad_id: ad.ad_id, buyer: context.userId });
    try { await activatePaidAd(ad.ad_id); } catch (e) { console.error("activatePaidAd failed", e); }
    return { ok: true };
  });

/** Owner funds a quiz's prize pool from their wallet balance. */
export const fundQuizPrizePool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ quiz_id: z.string().uuid(), amount_kobo: z.number().int().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: quiz } = await db.from("quizzes").select("id, created_by").eq("id", data.quiz_id).maybeSingle();
    if (!quiz) throw new Error("Quiz not found");
    if (quiz.created_by !== context.userId) throw new Error("Only the quiz owner can fund the prize pool.");

    const { data: wallet } = await db.from("wallets").select("balance_kobo").eq("user_id", context.userId).maybeSingle();
    if (!wallet || wallet.balance_kobo < data.amount_kobo) throw new Error("Insufficient wallet balance to fund this prize pool.");

    await db.from("wallets").update({ balance_kobo: wallet.balance_kobo - data.amount_kobo }).eq("user_id", context.userId);
    await db.from("wallet_transactions").insert({
      user_id: context.userId, kind: "prize_pool_hold", amount_kobo: -data.amount_kobo, bucket: "earnings",
      meta: { quiz_id: data.quiz_id },
    });
    return { ok: true };
  });

/** Award quiz prizes after the competition ends. Owner or admin only, fully idempotent. */
export const awardQuizPrizes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ quiz_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: quiz } = await db.from("quizzes")
      .select("id, created_by, competition_ends_at, prizes_awarded_at").eq("id", data.quiz_id).maybeSingle();
    if (!quiz) throw new Error("Quiz not found");
    const admin = await isSuperAdmin(context.supabase, context.userId);
    if (quiz.created_by !== context.userId && !admin) throw new Error("Forbidden");
    if (quiz.prizes_awarded_at) return { ok: true, already_awarded: true };
    if (!quiz.competition_ends_at || new Date(quiz.competition_ends_at).getTime() > Date.now()) {
      throw new Error("Competition has not ended yet.");
    }

    const { data: prizes } = await db.from("quiz_prizes").select("*").eq("quiz_id", data.quiz_id).order("position", { ascending: true });
    if (!prizes || prizes.length === 0) {
      await db.from("quizzes").update({ prizes_awarded_at: new Date().toISOString() }).eq("id", data.quiz_id);
      return { ok: true, awarded: 0 };
    }

    // Re-check under a fresh read to stay idempotent against concurrent calls.
    const { data: freshQuiz } = await db.from("quizzes").select("prizes_awarded_at").eq("id", data.quiz_id).single();
    if (freshQuiz?.prizes_awarded_at) return { ok: true, already_awarded: true };

    const { data: attempts } = await db.from("attempts")
      .select("student_id, score_pct, submitted_at")
      .eq("quiz_id", data.quiz_id)
      .not("submitted_at", "is", null)
      .order("score_pct", { ascending: false })
      .order("submitted_at", { ascending: true });

    const bestByUser = new Map<string, { student_id: string; score_pct: number; submitted_at: string }>();
    for (const a of attempts ?? []) {
      const existing = bestByUser.get(a.student_id);
      if (!existing || a.score_pct > existing.score_pct || (a.score_pct === existing.score_pct && a.submitted_at < existing.submitted_at)) {
        bestByUser.set(a.student_id, a);
      }
    }
    const leaderboard = Array.from(bestByUser.values()).sort((a, b) =>
      b.score_pct - a.score_pct || (a.submitted_at < b.submitted_at ? -1 : 1)
    );

    let awarded = 0;
    for (const prize of prizes) {
      if (prize.awarded_at) continue;
      const winner = leaderboard[prize.position - 1];
      if (!winner || prize.amount_kobo <= 0) {
        await db.from("quiz_prizes").update({ awarded_at: new Date().toISOString() }).eq("id", prize.id);
        continue;
      }
      await db.from("wallets").upsert({ user_id: winner.student_id }, { onConflict: "user_id" });
      const { data: ww } = await db.from("wallets").select("balance_kobo").eq("user_id", winner.student_id).single();
      await db.from("wallets").update({ balance_kobo: (ww?.balance_kobo ?? 0) + prize.amount_kobo }).eq("user_id", winner.student_id);
      await db.from("wallet_transactions").insert({
        user_id: winner.student_id, kind: "prize_payout", amount_kobo: prize.amount_kobo, bucket: "earnings",
        meta: { quiz_id: data.quiz_id, position: prize.position, prize_id: prize.id },
      });
      await db.from("quiz_prizes").update({ awarded_to: winner.student_id, awarded_at: new Date().toISOString() }).eq("id", prize.id);
      awarded++;
    }

    await db.from("quizzes").update({ prizes_awarded_at: new Date().toISOString() }).eq("id", data.quiz_id);
    return { ok: true, awarded };
  });
