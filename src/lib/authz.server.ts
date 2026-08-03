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

/** Platform-wide free-tier configuration (admin editable). */
export async function getPlatformSettings() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any).from("payment_settings").select("*").eq("id", "default").maybeSingle();
  return data ?? {};
}

export type EffectivePerms = {
  tier: "admin" | "paid" | "free";
  ai_enabled: boolean;
  ai_oversight_allowed: boolean;
  analytics_enabled: boolean;
  can_publish: boolean;
  max_quizzes: number | null;
  max_questions_per_quiz: number | null;
  offline_parse_limit: number | null;
};

/**
 * Everyone can create. Paid creators get a `creator_permissions` row; everyone
 * else falls back to the admin-configured free tier so nothing is hard-locked.
 */
export async function getEffectivePerms(supabase: any, userId: string): Promise<EffectivePerms> {
  const roles = await getActorRoles(supabase, userId);
  if (roles.includes("admin") || roles.includes("super_admin")) {
    return {
      tier: "admin", ai_enabled: true, ai_oversight_allowed: true, analytics_enabled: true,
      can_publish: true, max_quizzes: null, max_questions_per_quiz: null, offline_parse_limit: null,
    };
  }
  const [perms, settings] = await Promise.all([getCreatorPerms(supabase, userId), getPlatformSettings()]);
  if (perms) {
    return {
      tier: "paid",
      ai_enabled: perms.ai_enabled !== false,
      ai_oversight_allowed: perms.ai_enabled !== false,
      analytics_enabled: perms.analytics_enabled !== false,
      can_publish: perms.can_publish !== false,
      max_quizzes: perms.max_quizzes ?? null,
      max_questions_per_quiz: null,
      offline_parse_limit: null,
    };
  }
  return {
    tier: "free",
    ai_enabled: settings.free_ai_parse === true,
    ai_oversight_allowed: settings.free_ai_parse === true,
    analytics_enabled: true,
    can_publish: settings.free_tier_enabled !== false,
    max_quizzes: Number(settings.free_max_quizzes_per_month ?? 3),
    max_questions_per_quiz: Number(settings.free_max_questions_per_quiz ?? 20),
    offline_parse_limit: Number(settings.free_offline_parse_limit ?? 20),
  };
}

export async function canCreate(supabase: any, userId: string): Promise<{ ok: boolean; reason?: string; roles: string[]; perms?: any; effective?: EffectivePerms }> {
  const roles = await getActorRoles(supabase, userId);
  const effective = await getEffectivePerms(supabase, userId);
  if (effective.tier === "admin") return { ok: true, roles, effective };
  const perms = await getCreatorPerms(supabase, userId);
  if (perms) return { ok: true, roles, perms, effective };
  const settings = await getPlatformSettings();
  if (settings.free_tier_enabled === false) {
    return { ok: false, reason: "Creating is temporarily invite-only. Contact support for access.", roles, effective };
  }
  // Free tier: open to everyone.
  return { ok: true, roles, perms: null, effective };
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
  const effective = await getEffectivePerms(supabase, userId);
  if (!effective.ai_enabled) throw new Error("AI tools are a Pro Creator feature on your account. Upgrade or ask an admin to enable them.");
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

  const effective = await getEffectivePerms(supabase, userId);
  if (!effective.ai_enabled) {
    const err: any = new Error("AI tools are locked on your current tier. Upgrade to Pro Creator or ask an admin to enable them.");
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
