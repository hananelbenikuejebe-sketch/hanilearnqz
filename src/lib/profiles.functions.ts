import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Public profile view — safe fields only. */
export const getPublicProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const [{ data: profile }, { data: quizzes }, { data: attempts }, { count: followers }, { count: following }, { data: iFollow }, { data: roles }, { data: permissions }] = await Promise.all([
      db.from("profiles").select("id, full_name, handle, avatar_url, bio, is_guest, created_at").eq("id", data.user_id).maybeSingle(),
      db.from("quizzes")
        .select("id, title, category, difficulty, is_published, visibility, created_at, banner_path")
        .eq("created_by", data.user_id).eq("is_published", true).eq("visibility", "public")
        .order("created_at", { ascending: false }),
      db.from("attempts").select("quiz_id, quizzes(id, title)").eq("student_id", data.user_id).order("submitted_at", { ascending: false }).limit(20),
      db.from("user_follows").select("follower_id", { count: "exact", head: true }).eq("following_id", data.user_id),
      db.from("user_follows").select("following_id", { count: "exact", head: true }).eq("follower_id", data.user_id),
      db.from("user_follows").select("follower_id").eq("follower_id", context.userId).eq("following_id", data.user_id).maybeSingle(),
      db.from("user_roles").select("role").eq("user_id", data.user_id),
      db.from("creator_permissions").select("user_id").eq("user_id", data.user_id).maybeSingle(),
    ]);
    if (!profile) throw new Error("Profile not found");
    return {
      profile,
      quizzes: quizzes ?? [],
      attempts_count: (attempts ?? []).length,
      unique_quizzes_taken: new Set((attempts ?? []).map((a: any) => a.quiz_id)).size,
      followers: followers ?? 0,
      following: following ?? 0,
      i_follow: !!iFollow,
      is_self: context.userId === data.user_id,
      badges: [
        permissions ? "Pro creator" : null,
        (roles ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin") ? "Platform admin" : null,
        (quizzes ?? []).length > 0 ? "Quiz creator" : null,
        (quizzes ?? []).length >= 10 ? "10 quiz milestone" : null,
        (attempts ?? []).length > 0 ? "Quiz learner" : null,
        new Set((attempts ?? []).map((a: any) => a.quiz_id)).size >= 10 ? "10 quizzes taken" : null,
      ].filter(Boolean),
    };
  });

export const getFollowingIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("user_follows").select("following_id").eq("follower_id", context.userId);
    if (error) throw error;
    return (data ?? []).map((r: any) => r.following_id);
  });

export const searchProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().max(120).default("") }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const term = data.q.trim();
    if (term.length < 1) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const pattern = `%${term.replace(/[%_]/g, "")}%`;
    const { data: rows } = await db.from("profiles")
      .select("id, full_name, handle, avatar_url, is_guest")
      .or(`full_name.ilike.${pattern},handle.ilike.${pattern},email.ilike.${pattern}`)
      .limit(20);
    return rows ?? [];
  });

export const toggleFollow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    if (data.user_id === context.userId) throw new Error("You cannot follow yourself.");
    const { data: existing } = await context.supabase
      .from("user_follows").select("follower_id")
      .eq("follower_id", context.userId).eq("following_id", data.user_id).maybeSingle();
    if (existing) {
      await context.supabase.from("user_follows").delete()
        .eq("follower_id", context.userId).eq("following_id", data.user_id);
      return { following: false };
    }
    await context.supabase.from("user_follows").insert({ follower_id: context.userId, following_id: data.user_id });
    return { following: true };
  });
