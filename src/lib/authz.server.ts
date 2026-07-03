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

/** Owner-or-admin gate for editing a specific quiz. */
export async function assertCanEditQuiz(supabase: any, userId: string, quizId: string) {
  const roles = await getActorRoles(supabase, userId);
  if (roles.includes("admin") || roles.includes("super_admin")) return { admin: true, ownerId: null };
  const { data: quiz } = await supabase.from("quizzes").select("created_by").eq("id", quizId).maybeSingle();
  if (!quiz) throw new Error("Quiz not found");
  if (quiz.created_by !== userId) throw new Error("Forbidden: this quiz belongs to another creator");
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
