// Shared authorization helpers for server functions.
// Central place for admin / super_admin / creator role checks so quiz + question
// endpoints can be widened to creators without duplicating logic.

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

export async function canCreate(supabase: any, userId: string): Promise<{ ok: boolean; reason?: string; roles: string[]; perms?: any }> {
  const roles = await getActorRoles(supabase, userId);
  if (roles.includes("admin") || roles.includes("super_admin")) return { ok: true, roles };
  const { data: perms } = await supabase.from("creator_permissions").select("*").eq("user_id", userId).maybeSingle();
  if (roles.includes("creator") || perms) return { ok: true, roles, perms };
  return { ok: false, reason: "Not a creator yet.", roles };
}

export async function assertCanEditQuiz(supabase: any, userId: string, quizId: string) {
  const roles = await getActorRoles(supabase, userId);
  if (roles.includes("admin") || roles.includes("super_admin")) return;
  const { data: quiz } = await supabase.from("quizzes").select("created_by").eq("id", quizId).maybeSingle();
  if (!quiz) throw new Error("Quiz not found");
  if (quiz.created_by !== userId) throw new Error("Forbidden: not your quiz");
}

export async function assertAdminLegacy(supabase: any, userId: string) {
  const roles = await getActorRoles(supabase, userId);
  if (!roles.includes("admin") && !roles.includes("super_admin")) throw new Error("Forbidden: admin only");
}
