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
    const [{ data: wallet }, { data: txs }, { data: bank }, { data: pending }] = await Promise.all([
      db.from("wallets").select("*").eq("user_id", context.userId).single(),
      db.from("wallet_transactions").select("*").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(50),
      db.from("bank_accounts").select("*").eq("user_id", context.userId).maybeSingle(),
      db.from("withdrawal_requests").select("*").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(10),
    ]);
    const visibleWallet = wallet && wallet.ai_credit_expires_at && new Date(wallet.ai_credit_expires_at).getTime() < Date.now()
      ? { ...wallet, ai_credit_balance_kobo: 0 }
      : wallet;
    return { wallet: visibleWallet, transactions: txs ?? [], bank_account: bank ?? null, withdrawals: pending ?? [] };
  });

export const saveBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    bank_name: z.string().trim().min(1).max(80),
    account_number: z.string().trim().regex(/^\d{8,12}$/,"Account number must be 8–12 digits"),
    account_name: z.string().trim().min(2).max(120),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("bank_accounts").upsert(
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
    // Debit immediately (hold funds); refund on rejection.
    await db.from("wallets").update({ balance_kobo: wallet.balance_kobo - data.amount_kobo }).eq("user_id", context.userId);
    await db.from("wallet_transactions").insert({
      user_id: context.userId, kind: "withdrawal_request", amount_kobo: -data.amount_kobo, bucket: "earnings",
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
    const msg = `Withdrawal request — HaniLearn-QZ\n\nUser ID: ${context.userId}\nAmount: NGN ${naira}\nBank: ${bank.bank_name}\nAccount #: ${bank.account_number}\nAccount name: ${bank.account_name}\nRequest ID: ${req.id}`;
    const whatsapp = String(settings?.withdrawal_whatsapp || settings?.support_whatsapp || "+2349071829295").replace(/[^\d]/g, "");
    const whatsappUrl = `https://wa.me/${whatsapp}?text=${encodeURIComponent(msg)}`;
    return { request: req, whatsappUrl, message: msg };
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
