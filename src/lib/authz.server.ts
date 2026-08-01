// Shared authorization helpers for server functions.
// Centralises admin / super_admin / creator role + ownership checks.

export type Actor = "student" | "creator" | "admin" | "super_admin";

export async function getActorRoles(supabase: any, userId: string): Promise<string[]> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.role);
}

export async function isSuperAdmin(supabase: any, userId: string): Promise<boolean> {
  const roles = await getActorRoles(supabase, userId);
  return roles.includes("super_admin") || roles.includes("admin");
}

export async function getCreatorPerms(supabase: any, userId: string) {
  const { data } = await supabase.from("creator_permissions").select("*").eq("user_id", userId).maybeSingle();
  return data;
}

export async function canCreate(supabase: any, userId: string): Promise<{ ok: boolean; reason?: string; roles: string[]; perms?: any }> {
  const roles = await getActorRoles(supabase, userId);
  if (roles.includes("admin") || roles.includes("super_admin")) return { ok: true, roles };
  const perms = await getCreatorPerms(supabase, userId);
  if (roles.includes("creator") || perms) return { ok: true, roles, perms };
  return { ok: false, reason: "You need creator access. Ask an admin to grant it.", roles };
}

/** Ownership gate for editing a specific quiz. Even super_admins may NOT edit
 * another creator's quiz — this guards writes only. Read/review paths use
 * `isSuperAdmin` separately. */
export async function assertCanEditQuiz(_supabase: any, userId: string, quizId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: quiz } = await (supabaseAdmin as any).from("quizzes").select("created_by").eq("id", quizId).maybeSingle();
  if (!quiz) throw new Error("Quiz not found");
  if (quiz.created_by !== userId) throw new Error("Forbidden: only the quiz owner can edit this quiz.");
  return { admin: false, ownerId: quiz.created_by };
}

/** Admin/super-admin only. */
export async function assertAdmin(supabase: any, userId: string) {
  const roles = await getActorRoles(supabase, userId);
  if (!roles.includes("admin") && !roles.includes("super_admin")) throw new Error("Forbidden: admin only");
}

/** Assert AI feature availability for a user. Admins always allowed. */
export async function assertAiAllowed(supabase: any, userId: string) {
  const roles = await getActorRoles(supabase, userId);
  if (roles.includes("admin") || roles.includes("super_admin")) return;
  const perms = await getCreatorPerms(supabase, userId);
  if (!perms?.ai_enabled) throw new Error("AI features are disabled for your account. Ask an admin to enable them.");
}

/** Assert analytics allowed. */
export async function assertAnalyticsAllowed(supabase: any, userId: string) {
  const roles = await getActorRoles(supabase, userId);
  if (roles.includes("admin") || roles.includes("super_admin")) return;
  const perms = await getCreatorPerms(supabase, userId);
  if (perms && perms.analytics_enabled === false) throw new Error("Analytics are disabled for your account.");
}

/** Log an AI usage entry (best-effort, never throws). */
export async function logAiUsage(supabase: any, userId: string, entry: {
  feature: string; model?: string; input_tokens?: number; output_tokens?: number;
  credits_cost?: number; quiz_id?: string | null; meta?: any;
}) {
  try {
    await supabase.from("ai_usage_log").insert({
      user_id: userId,
      feature: entry.feature,
      model: entry.model ?? null,
      input_tokens: entry.input_tokens ?? 0,
      output_tokens: entry.output_tokens ?? 0,
      credits_cost: entry.credits_cost ?? 0,
      quiz_id: entry.quiz_id ?? null,
      meta: entry.meta ?? {},
    });
  } catch { /* non-fatal */ }
}

// ================== Wallet-aware per-feature AI access ==================
export type AiFeature = "ai_result" | "ai_essay" | "ai_parser" | "ai_generate" | "ai_review" | "ai_proof";

function currentPeriod() {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

/** Grant the admin-configured free monthly AI credit, once per calendar month. */
export async function ensureFreeMonthlyCredit(db: any, userId: string) {
  const period = currentPeriod();
  const { data: settings } = await db.from("payment_settings").select("free_tier_enabled, free_monthly_ai_credit_kobo, ai_credit_expiry_days").eq("id", "default").maybeSingle();
  const amount = settings?.free_tier_enabled === false ? 0 : Number(settings?.free_monthly_ai_credit_kobo ?? 0);
  if (amount <= 0) return;
  const { data: existing } = await db.from("free_credit_grants").select("user_id").eq("user_id", userId).eq("period", period).maybeSingle();
  if (existing) return;
  const { error: claimError } = await db.from("free_credit_grants").insert({ user_id: userId, period, amount_kobo: amount });
  if (claimError) return; // already claimed (race) — nothing to do
  await db.from("wallets").upsert({ user_id: userId }, { onConflict: "user_id" });
  const { data: w } = await db.from("wallets").select("ai_credit_balance_kobo, ai_credit_expires_at").eq("user_id", userId).maybeSingle();
  const now = Date.now();
  const currentExpiry = w?.ai_credit_expires_at ? new Date(w.ai_credit_expires_at).getTime() : 0;
  const expired = currentExpiry > 0 && currentExpiry < now;
  const base = expired ? 0 : Number(w?.ai_credit_balance_kobo ?? 0);
  const endOfNextMonth = new Date(now + 45 * 86_400_000).getTime();
  await db.from("wallets").update({
    ai_credit_balance_kobo: base + amount,
    ai_credit_expires_at: new Date(Math.max(currentExpiry, endOfNextMonth)).toISOString(),
  }).eq("user_id", userId);
  await db.from("wallet_transactions").insert({
    user_id: userId, kind: "free_monthly_credit", amount_kobo: amount, bucket: "ai_credit", meta: { period },
  });
}

/** Current spendable AI credit (0 when expired). */
export async function getAiBalance(db: any, userId: string) {
  const { data: wallet } = await db.from("wallets").select("ai_credit_balance_kobo, ai_credit_expires_at").eq("user_id", userId).maybeSingle();
  const expired = wallet?.ai_credit_expires_at && new Date(wallet.ai_credit_expires_at).getTime() < Date.now();
  return expired ? 0 : Number(wallet?.ai_credit_balance_kobo ?? 0);
}

/** Gate before doing an AI call. Throws with a user-friendly message if blocked. */
export async function checkAiAccess(supabase: any, userId: string, feature: AiFeature) {
  const roles = await getActorRoles(supabase, userId);
  if (roles.includes("admin") || roles.includes("super_admin")) return { free: true as const, balance_kobo: Infinity };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data: settings } = await db.from("payment_settings").select("*").eq("id", "default").maybeSingle();
  if (settings?.feature_locks?.[feature]) throw new Error("This AI feature is currently disabled by the platform admin.");

  const perms = await getCreatorPerms(supabase, userId);
  if (perms && perms.ai_enabled === false) {
    const err: any = new Error("AI features are turned off for your account. Contact support to enable them.");
    err.code = "AI_DISABLED";
    throw err;
  }

  await ensureFreeMonthlyCredit(db, userId);
  const bal = await getAiBalance(db, userId);
  if (bal <= 0) {
    const err: any = new Error("You have no AI credit left. Top up your AI credit to keep using AI features.");
    err.code = "AI_CREDIT_REQUIRED";
    throw err;
  }
  return { free: false as const, balance_kobo: bal };
}

/** Price a feature call in kobo using admin-editable rates. */
function priceFor(feature: AiFeature, settings: any, opts: { input_tokens?: number; output_tokens?: number }) {
  if (!settings) return 0;
  switch (feature) {
    case "ai_result": return Number(settings.ai_result_price_kobo ?? 0);
    case "ai_essay": return Number(settings.ai_essay_price_kobo ?? 0);
    case "ai_generate": return Number(settings.ai_generate_price_kobo ?? 0);
    case "ai_review": return Number(settings.ai_review_price_kobo ?? 0);
    case "ai_proof": return 0; // platform-side verification cost, never billed to the user
    default: {
      const inK = (opts.input_tokens ?? 0) / 1000;
      const outK = (opts.output_tokens ?? 0) / 1000;
      const cost = inK * Number(settings.ai_parser_rate_per_1k_input_kobo ?? 0)
        + outK * Number(settings.ai_parser_rate_per_1k_output_kobo ?? 0);
      return cost > 0 ? Math.max(1, Math.ceil(cost)) : 0;
    }
  }
}

/**
 * Debit AI credit after usage and always log it.
 * Admins are never billed. Every other account is billed — `creator_permissions.ai_enabled`
 * grants *permission* to use AI, it does not make AI free.
 */
export async function billAiUsage(userId: string, feature: AiFeature, opts: {
  input_tokens?: number; output_tokens?: number; quiz_id?: string | null; model?: string; meta?: any;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const roles = await getActorRoles(db, userId);
  const isAdmin = roles.includes("admin") || roles.includes("super_admin");
  const { data: settings } = await db.from("payment_settings").select("*").eq("id", "default").maybeSingle();

  const cost = isAdmin ? 0 : priceFor(feature, settings, opts);
  let remaining: number | null = null;
  if (cost > 0) {
    await db.from("wallets").upsert({ user_id: userId }, { onConflict: "user_id" });
    const current = await getAiBalance(db, userId);
    remaining = Math.max(0, current - cost);
    await db.from("wallets").update({ ai_credit_balance_kobo: remaining }).eq("user_id", userId);
    await db.from("wallet_transactions").insert({
      user_id: userId, kind: "ai_usage", amount_kobo: -cost, bucket: "ai_credit",
      meta: { feature, model: opts.model ?? null, input_tokens: opts.input_tokens ?? 0, output_tokens: opts.output_tokens ?? 0 },
    });
  }
  try {
    await db.from("ai_usage_log").insert({
      user_id: userId, feature, model: opts.model ?? null,
      input_tokens: opts.input_tokens ?? 0, output_tokens: opts.output_tokens ?? 0,
      credits_cost: cost, quiz_id: opts.quiz_id ?? null, meta: opts.meta ?? {},
    });
  } catch { /* non-fatal */ }
  return { debited_kobo: cost, balance_kobo: remaining };
}
