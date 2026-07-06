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
export type AiFeature = "ai_result" | "ai_essay" | "ai_parser";

/** Gate before doing an AI call. Throws with a user-friendly message if blocked. */
export async function checkAiAccess(supabase: any, userId: string, feature: AiFeature) {
  const roles = await getActorRoles(supabase, userId);
  if (roles.includes("admin") || roles.includes("super_admin")) return { free: true as const };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data: settings } = await db.from("payment_settings").select("*").eq("id", "default").maybeSingle();
  if (settings?.feature_locks?.[feature]) throw new Error("This AI feature is currently disabled by the platform admin.");
  const perms = await getCreatorPerms(supabase, userId);
  if (perms?.ai_enabled) return { free: true as const }; // admin-grandfathered creators
  const { data: wallet } = await db.from("wallets").select("ai_credit_balance_kobo, ai_credit_expires_at").eq("user_id", userId).maybeSingle();
  const expired = wallet?.ai_credit_expires_at && new Date(wallet.ai_credit_expires_at).getTime() < Date.now();
  const bal = expired ? 0 : (wallet?.ai_credit_balance_kobo ?? 0);
  if (bal <= 0) {
    const err: any = new Error("You have no AI credits left. Top up in your wallet to use this feature.");
    err.code = "AI_CREDIT_REQUIRED";
    throw err;
  }
  return { free: false as const };
}

/** Debit AI credit after usage (metered for parser, flat for result/essay). Always logs usage. */
export async function billAiUsage(userId: string, feature: AiFeature, opts: {
  input_tokens?: number; output_tokens?: number; quiz_id?: string | null; model?: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const roles = await getActorRoles(db, userId);
  const isAdmin = roles.includes("admin") || roles.includes("super_admin");
  const perms = isAdmin ? null : await getCreatorPerms(db, userId);
  const { data: settings } = await db.from("payment_settings").select("*").eq("id", "default").maybeSingle();

  let cost = 0;
  if (!isAdmin && !perms?.ai_enabled && settings) {
    if (feature === "ai_result") cost = settings.ai_result_price_kobo ?? 0;
    else if (feature === "ai_essay") cost = settings.ai_essay_price_kobo ?? 0;
    else if (feature === "ai_parser") {
      const inK = (opts.input_tokens ?? 0) / 1000;
      const outK = (opts.output_tokens ?? 0) / 1000;
      cost = Math.ceil(inK * (settings.ai_parser_rate_per_1k_input_kobo ?? 0) + outK * (settings.ai_parser_rate_per_1k_output_kobo ?? 0));
    }
  }
  if (cost > 0) {
    const { data: wallet } = await db.from("wallets").select("ai_credit_balance_kobo").eq("user_id", userId).maybeSingle();
    const newBal = Math.max(0, (wallet?.ai_credit_balance_kobo ?? 0) - cost);
    await db.from("wallets").upsert({ user_id: userId, ai_credit_balance_kobo: newBal }, { onConflict: "user_id" });
    await db.from("wallet_transactions").insert({
      user_id: userId, kind: "ai_usage", amount_kobo: -cost, bucket: "ai_credit",
      meta: { feature, model: opts.model ?? null, input_tokens: opts.input_tokens ?? 0, output_tokens: opts.output_tokens ?? 0 },
    });
  }
  try {
    await db.from("ai_usage_log").insert({
      user_id: userId, feature, model: opts.model ?? null,
      input_tokens: opts.input_tokens ?? 0, output_tokens: opts.output_tokens ?? 0,
      credits_cost: cost, quiz_id: opts.quiz_id ?? null, meta: {},
    });
  } catch { /* non-fatal */ }
  return { debited_kobo: cost };
}
