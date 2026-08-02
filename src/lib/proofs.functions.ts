import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSuperAdmin } from "./authz.server";

/** Public-ish (auth) payment instructions + support contact. */
export const getPaymentInstructions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("payment_settings").select("*").eq("id", "default").maybeSingle();
    const s: any = data ?? {};
    return {
      bank_name: s.pay_bank_name ?? "",
      account_number: s.pay_account_number ?? "",
      account_name: s.pay_account_name ?? "",
      support_whatsapp: s.support_whatsapp ?? "+2349071829295",
      creator_access_price_kobo: s.creator_access_price_kobo ?? 0,
      creator_access_duration_days: s.creator_access_duration_days ?? 30,
      ai_credit_min_topup_kobo: s.ai_credit_min_topup_kobo ?? 10000,
    };
  });

const SubmitInput = z.object({
  purpose: z.enum(["creator_access", "ai_credit", "quiz_purchase"]),
  amount_kobo: z.number().int().min(100).max(50_000_000).optional(),
  quiz_id: z.string().uuid().optional(),
  file_path: z.string().min(4).max(400),
  file_size: z.number().int().min(0).max(30_000_000).optional(),
  file_mime: z.string().max(80).optional(),
  sender_name: z.string().trim().min(2).max(120),
  paid_at: z.string().min(6).max(40),
  bank_ref: z.string().trim().max(80).optional(),
  bank_name: z.string().trim().max(80).optional(),
});

/**
 * Upload-and-verify pipeline. The user only ever sees "approved" or
 * "we're checking" — admin confirmation happens in the background.
 */
export const submitPaymentProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SubmitInput.parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { algorithmicVerify, aiVerifyReceipt } = await import("./proof-verify.server");
    const { settleIntent } = await import("./payments.functions");
    const { billAiUsage } = await import("./authz.server");

    const { data: settings } = await db.from("payment_settings").select("*").eq("id", "default").single();

    // Resolve the expected amount from server-side truth.
    let expected = 0;
    let quizId: string | null = null;
    let creatorId: string | null = null;
    let quizTitle: string | null = null;
    if (data.purpose === "creator_access") {
      expected = Number(settings.creator_access_price_kobo ?? 0);
    } else if (data.purpose === "ai_credit") {
      expected = Number(data.amount_kobo ?? 0);
      if (expected < Number(settings.ai_credit_min_topup_kobo ?? 0)) {
        throw new Error(`Minimum AI credit top-up is ₦${(Number(settings.ai_credit_min_topup_kobo) / 100).toFixed(0)}`);
      }
    } else {
      if (!data.quiz_id) throw new Error("Quiz is required");
      const { data: quiz } = await db.from("quizzes").select("id, title, price_kobo, created_by").eq("id", data.quiz_id).maybeSingle();
      if (!quiz) throw new Error("Quiz not found");
      if (!quiz.price_kobo || quiz.price_kobo <= 0) throw new Error("This quiz is free — no payment needed.");
      expected = Number(quiz.price_kobo);
      quizId = quiz.id; creatorId = quiz.created_by; quizTitle = quiz.title;
    }

    const claim = {
      amount_kobo: Number(data.amount_kobo ?? expected),
      paid_at: data.paid_at,
      sender_name: data.sender_name,
      bank_ref: data.bank_ref ?? null,
      bank_name: data.bank_name ?? null,
    };

    // Duplicate reference check across all proofs.
    let duplicate = false;
    if (claim.bank_ref) {
      const { data: dup } = await db.from("payment_proofs")
        .select("id").contains("extracted", { bank_ref: claim.bank_ref }).limit(1);
      duplicate = !!(dup && dup.length);
    }

    const { data: profile } = await db.from("profiles").select("full_name, email").eq("id", context.userId).maybeSingle();
    const { data: attr } = await db.from("affiliate_attributions").select("affiliate_user_id").eq("referred_user_id", context.userId).maybeSingle();

    // Create the intent this proof pays for.
    const reference = `MP_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { data: intent, error: intentError } = await db.from("payment_intents").insert({
      user_id: context.userId,
      payment_reference: reference,
      purpose: data.purpose,
      amount_kobo: expected,
      affiliate_user_id: attr?.affiliate_user_id ?? null,
      meta: {
        manual: true,
        name: profile?.full_name ?? null,
        email: profile?.email ?? null,
        ...(quizId ? { quiz_id: quizId, creator_id: creatorId, quiz_title: quizTitle } : {}),
      },
    }).select().single();
    if (intentError) throw intentError;

    const algo = algorithmicVerify({
      claim,
      expected_kobo: expected,
      settings,
      profile_name: profile?.full_name ?? null,
      duplicate_ref: duplicate,
      file: { size: data.file_size ?? null, mime: data.file_mime ?? null },
    });

    let finalScore = algo.score;
    const reasons = [...algo.reasons];
    let usedAi = false;
    let imageRead = false;
    let extractedAi: any = null;

    // The offline pass can only reject. Anything that isn't an outright fail goes
    // to the image reader; if the image can't be read, a human decides.
    if (!algo.hard_fail && settings.proof_use_ai) {
      try {
        const { data: signed } = await db.storage.from("payment-proofs").createSignedUrl(data.file_path, 600);
        if (!signed?.signedUrl) throw new Error("no signed url");
        const ai = await aiVerifyReceipt({ signedUrl: signed.signedUrl, expected_kobo: expected, claim, settings });
        if (ai) {
          usedAi = true;
          extractedAi = ai.extracted;
          reasons.push(...ai.reasons);
          if (typeof ai.score === "number" && ai.extracted) {
            imageRead = true;
            // The image read dominates; the self-reported claim only nudges.
            finalScore = Math.round(ai.score * 0.85 + algo.score * 0.15);
          } else {
            reasons.push("Receipt image could not be read — queued for manual review");
          }
          await billAiUsage(context.userId, "ai_proof", {
            model: ai.model,
            input_tokens: (ai.usage as any)?.inputTokens ?? 0,
            output_tokens: (ai.usage as any)?.outputTokens ?? 0,
            meta: { proof_reference: reference },
          });
        }
      } catch {
        reasons.push("Automatic image check unavailable — queued for manual review");
      }
    } else if (!settings.proof_use_ai) {
      reasons.push("Automatic image check is switched off — manual review required");
    }

    // Auto-approval REQUIRES a successful image read that scores above the bar.
    const approve = !algo.hard_fail
      && !!settings.proof_auto_approve
      && imageRead
      && finalScore >= Number(settings.proof_min_confidence ?? 55);

    const { data: proof, error: proofError } = await db.from("payment_proofs").insert({
      user_id: context.userId,
      payment_intent_id: intent.id,
      purpose: data.purpose,
      amount_kobo: claim.amount_kobo,
      quiz_id: quizId,
      file_path: data.file_path,
      status: algo.hard_fail ? "pending" : approve ? "auto_approved" : "pending",
      auto_confidence: finalScore,
      auto_reason: reasons.join("; ").slice(0, 1000),
      granted: approve,
      used_ai: usedAi,
      extracted: {
        claim,
        bank_ref: claim.bank_ref,
        ai: extractedAi,
        expected_kobo: expected,
        image_read: imageRead,
        offline_score: algo.score,
        offline_hard_fail: algo.hard_fail,
      },
    }).select().single();
    if (proofError) throw proofError;

    if (approve) {
      await settleIntent(db, intent, expected);
      return {
        status: "approved" as const,
        proof_id: proof.id,
        message: "Payment confirmed — your access has been unlocked.",
      };
    }

    return {
      status: "pending" as const,
      proof_id: proof.id,
      message: "Receipt received. We're confirming your payment — this usually takes a few minutes. Contact support if it takes longer.",
      support_whatsapp: settings.support_whatsapp ?? "+2349071829295",
    };
  });


export const getMyPaymentProofs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("payment_proofs")
      .select("id, purpose, amount_kobo, status, created_at, admin_note")
      .eq("user_id", context.userId).order("created_at", { ascending: false }).limit(20);
    return data ?? [];
  });

/* --------------------------------- admin --------------------------------- */

export const listPaymentProofs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    status: z.enum(["all", "pending", "auto_approved", "confirmed", "declined"]).default("all"),
    q: z.string().max(120).optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    let query = db.from("payment_proofs")
      .select("*, profiles:user_id(full_name, email, handle)")
      .order("created_at", { ascending: false }).limit(200);
    if (data.status !== "all") query = query.eq("status", data.status);
    const { data: rows } = await query;
    let list = rows ?? [];
    if (data.q?.trim()) {
      const needle = data.q.trim().toLowerCase();
      list = list.filter((r: any) =>
        [r.profiles?.full_name, r.profiles?.email, r.profiles?.handle, r.extracted?.claim?.sender_name, r.extracted?.bank_ref]
          .filter(Boolean).some((v: string) => String(v).toLowerCase().includes(needle)));
    }
    // Signed URLs so the admin can view each receipt.
    const withUrls = await Promise.all(list.map(async (r: any) => {
      const { data: signed } = await db.storage.from("payment-proofs").createSignedUrl(r.file_path, 3600);
      return { ...r, file_url: signed?.signedUrl ?? null };
    }));
    return withUrls;
  });

export const reviewPaymentProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    action: z.enum(["confirm", "decline"]),
    note: z.string().max(400).optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: proof } = await db.from("payment_proofs").select("*").eq("id", data.id).maybeSingle();
    if (!proof) throw new Error("Proof not found");
    if (proof.status === "confirmed" || proof.status === "declined") throw new Error("Already reviewed");

    if (data.action === "confirm") {
      if (!proof.granted && proof.payment_intent_id) {
        const { data: intent } = await db.from("payment_intents").select("*").eq("id", proof.payment_intent_id).maybeSingle();
        if (intent && intent.status !== "paid") {
          const { settleIntent } = await import("./payments.functions");
          await settleIntent(db, intent, Number(intent.amount_kobo ?? 0));
        }
      }
      await db.from("payment_proofs").update({
        status: "confirmed", granted: true, admin_note: data.note ?? null,
        reviewed_by: context.userId, reviewed_at: new Date().toISOString(),
      }).eq("id", data.id);
      return { ok: true, status: "confirmed" };
    }

    if (proof.granted && proof.payment_intent_id) {
      const { reverseIntent } = await import("./reverse.server");
      await reverseIntent(db, proof.payment_intent_id, data.note ?? "Payment declined by admin");
    }
    await db.from("payment_proofs").update({
      status: "declined", granted: false, admin_note: data.note ?? null,
      reviewed_by: context.userId, reviewed_at: new Date().toISOString(),
    }).eq("id", data.id);
    return { ok: true, status: "declined" };
  });
