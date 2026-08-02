/**
 * Manual payment receipt verification.
 *
 * Step 1 is a deterministic algorithm over the claim the user typed plus file
 * sanity checks — it costs nothing. Step 2 (AI vision) only runs when the
 * algorithm is inconclusive, so AI credit use stays minimal.
 */

export type ProofClaim = {
  amount_kobo: number;
  paid_at: string;          // ISO date
  sender_name: string;
  bank_ref?: string | null;
  bank_name?: string | null;
};

export type VerifySettings = {
  proof_laxity: string;
  proof_min_confidence: number;
  proof_max_age_days: number;
  proof_auto_approve: boolean;
  proof_use_ai: boolean;
  pay_account_number?: string;
  pay_account_name?: string;
};

export type AlgoResult = { score: number; reasons: string[]; hard_fail: boolean; conclusive: boolean };

function similarity(a: string, b: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]+/g, " ").split(/\s+/).filter(Boolean);
  const A = norm(a); const B = norm(b);
  if (!A.length || !B.length) return 0;
  const hits = A.filter((t) => B.includes(t)).length;
  return hits / Math.max(A.length, B.length);
}

export function algorithmicVerify(input: {
  claim: ProofClaim;
  expected_kobo: number;
  settings: VerifySettings;
  profile_name?: string | null;
  duplicate_ref: boolean;
  file: { size?: number | null; mime?: string | null };
}): AlgoResult {
  const { claim, expected_kobo, settings } = input;
  const reasons: string[] = [];
  // Everything below is SELF-REPORTED by the payer, so it can only ever build a
  // weak case. The offline pass exists to reject obvious junk, never to approve
  // on its own — approval requires the receipt image to be read (AI) or a human.
  let score = 10;
  let hard_fail = false;

  // Amount
  const diff = claim.amount_kobo - expected_kobo;
  if (diff === 0) { score += 12; reasons.push("Claimed amount matches exactly"); }
  else if (diff > 0) { score += 10; reasons.push("Claimed an overpayment"); }
  else if (Math.abs(diff) <= Math.max(100, expected_kobo * 0.01)) { score += 6; reasons.push("Claimed amount within tolerance"); }
  else { score -= 45; hard_fail = true; reasons.push("Claimed amount is less than the required amount"); }

  // Date window
  const paid = Date.parse(claim.paid_at);
  if (!Number.isFinite(paid)) { score -= 15; reasons.push("Unreadable payment date"); }
  else {
    const ageDays = (Date.now() - paid) / 86_400_000;
    if (ageDays < -1) { score -= 30; hard_fail = true; reasons.push("Payment date is in the future"); }
    else if (ageDays <= settings.proof_max_age_days) { score += 8; reasons.push("Payment date is recent"); }
    else { score -= 15; reasons.push(`Receipt is older than ${settings.proof_max_age_days} days`); }
  }

  // Reference
  if (input.duplicate_ref) { score -= 60; hard_fail = true; reasons.push("This transaction reference was already used"); }
  else if (claim.bank_ref && claim.bank_ref.trim().length >= 4) { score += 6; reasons.push("Transaction reference supplied"); }
  else { score -= 5; reasons.push("No transaction reference supplied"); }

  // Sender name
  if (claim.sender_name.trim().length >= 3) {
    score += 4;
    const sim = similarity(claim.sender_name, input.profile_name ?? "");
    if (sim >= 0.5) { score += 6; reasons.push("Sender name matches the account holder"); }
  } else { score -= 10; reasons.push("Sender name missing"); }

  // File sanity
  const mime = (input.file.mime ?? "").toLowerCase();
  if (/^image\/|pdf/.test(mime)) score += 4;
  else { score -= 20; hard_fail = true; reasons.push("Attachment is not an image or PDF"); }
  const size = Number(input.file.size ?? 0);
  if (size > 15_000) score += 4;
  else if (size > 0 && size < 4_000) { score -= 25; hard_fail = true; reasons.push("Receipt file is suspiciously small"); }

  // Laxity nudges the offline pass only slightly.
  if (settings.proof_laxity === "lax") score += 6;
  else if (settings.proof_laxity === "strict") score -= 8;

  // Hard ceiling: self-reported evidence alone tops out well below any sane
  // approval threshold. Only aiVerifyReceipt or an admin can lift it.
  score = Math.max(0, Math.min(45, Math.round(score)));
  return { score, reasons, hard_fail, conclusive: hard_fail };
}


/** AI vision read of the receipt. Returns null when AI is unavailable. */
export async function aiVerifyReceipt(args: {
  signedUrl: string;
  expected_kobo: number;
  claim: ProofClaim;
  settings: VerifySettings;
}) {
  const key = process.env['LOVABLE_API_KEY'];
  if (!key) return null;
  const { generateText } = await import("ai");
  const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
  const gateway = createLovableAiGatewayProvider(key);
  const model = "google/gemini-3-flash-preview";

  const system = `You verify Nigerian bank transfer receipts. Be helpful and slightly lenient: a genuine receipt with poor image quality should still pass. Return ONLY JSON:
{"is_receipt":true,"amount_naira":0,"date":"YYYY-MM-DD","recipient_account":"","recipient_name":"","sender_name":"","reference":"","tampering_risk":0,"confidence":0,"notes":""}
tampering_risk and confidence are 0-100.`;

  const prompt = `Expected amount: NGN ${(args.expected_kobo / 100).toFixed(2)}
Expected recipient account: ${args.settings.pay_account_number ?? "(unknown)"} / ${args.settings.pay_account_name ?? "(unknown)"}
User claims: amount NGN ${(args.claim.amount_kobo / 100).toFixed(2)}, date ${args.claim.paid_at}, sender ${args.claim.sender_name}, ref ${args.claim.bank_ref ?? "-"}
Check the attached receipt image and report what you can actually read.`;

  const result = await generateText({
    model: gateway(model),
    system,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image", image: new URL(args.signedUrl) },
      ],
    }] as any,
    temperature: 0,
    maxOutputTokens: 500,
  });

  const usage = (result as any).usage ?? {};
  let parsed: any = null;
  try {
    const cleaned = result.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const s = cleaned.indexOf("{"); const e = cleaned.lastIndexOf("}");
    if (s !== -1 && e > s) parsed = JSON.parse(cleaned.slice(s, e + 1));
  } catch { parsed = null; }
  if (!parsed) return { model, usage, extracted: null, score: null as number | null, reasons: ["AI could not read the receipt"] };

  const reasons: string[] = [];
  let score = Number(parsed.confidence ?? 50);
  if (parsed.is_receipt === false) { score -= 45; reasons.push("AI does not recognise this as a bank receipt"); }
  const amountNaira = Number(parsed.amount_naira ?? 0);
  if (amountNaira > 0) {
    const delta = amountNaira * 100 - args.expected_kobo;
    if (Math.abs(delta) <= Math.max(100, args.expected_kobo * 0.01)) { score += 20; reasons.push("AI read a matching amount"); }
    else if (delta > 0) { score += 10; reasons.push("AI read a higher amount"); }
    else { score -= 35; reasons.push("AI read a lower amount than required"); }
  }
  const risk = Number(parsed.tampering_risk ?? 0);
  if (risk >= 70) { score -= 40; reasons.push("AI flagged possible tampering"); }
  else if (risk <= 25) { score += 8; }
  const acct = String(args.settings.pay_account_number ?? "").replace(/\D/g, "");
  const readAcct = String(parsed.recipient_account ?? "").replace(/\D/g, "");
  if (acct && readAcct && readAcct.endsWith(acct.slice(-4))) { score += 12; reasons.push("Recipient account matches"); }
  if (args.settings.proof_laxity === "lax") score += 8;
  if (args.settings.proof_laxity === "strict") score -= 8;

  return {
    model,
    usage,
    extracted: parsed,
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
  };
}
