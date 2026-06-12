import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function isAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

const QuizIdInput = z.object({ quiz_id: z.string().uuid() });

export const getQuizSocialSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => QuizIdInput.parse(d))
  .handler(async ({ context, data }) => {
    const admin = await isAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const adminDb = supabaseAdmin as any;
    const { data: quiz, error: quizError } = await adminDb
      .from("quizzes")
      .select("id, title, is_published, allow_comments, allow_likes, allow_sharing, show_leaderboard")
      .eq("id", data.quiz_id)
      .maybeSingle();
    if (quizError) throw quizError;
    if (!quiz || (!quiz.is_published && !admin)) throw new Error("Quiz not available");

    const [{ count: likes }, { count: shares }, { data: mine }, { data: comments }, { data: attempts }] = await Promise.all([
      adminDb.from("quiz_likes").select("id", { count: "exact", head: true }).eq("quiz_id", data.quiz_id),
      adminDb.from("quiz_shares").select("id", { count: "exact", head: true }).eq("quiz_id", data.quiz_id),
      adminDb.from("quiz_likes").select("id").eq("quiz_id", data.quiz_id).eq("user_id", context.userId).maybeSingle(),
      adminDb.from("quiz_comments").select("id, user_id, body, is_hidden, created_at, updated_at").eq("quiz_id", data.quiz_id).order("created_at", { ascending: false }).limit(50),
      adminDb.from("attempts").select("id, student_id, score_pct, correct_count, total, time_taken_sec, submitted_at").eq("quiz_id", data.quiz_id).order("score_pct", { ascending: false }).order("time_taken_sec", { ascending: true }).limit(500),
    ]);

    const visibleComments = (comments ?? []).filter((c: any) => admin || !c.is_hidden || c.user_id === context.userId);
    const profileIds = Array.from(new Set([...visibleComments.map((c: any) => c.user_id), ...(attempts ?? []).map((a: any) => a.student_id)]));
    const { data: profiles } = profileIds.length
      ? await adminDb.from("profiles").select("id, full_name").in("id", profileIds)
      : { data: [] as any[] };
    const profileMap = new Map<string, { id: string; full_name: string | null }>((profiles ?? []).map((p: any) => [p.id, p]));

    const bestByStudent = new Map<string, any>();
    for (const a of attempts ?? []) {
      const prev = bestByStudent.get(a.student_id);
      if (!prev || Number(a.score_pct) > Number(prev.score_pct) || (Number(a.score_pct) === Number(prev.score_pct) && a.time_taken_sec < prev.time_taken_sec)) {
        bestByStudent.set(a.student_id, a);
      }
    }
    const leaderboard = [...bestByStudent.values()]
      .sort((a: any, b: any) => Number(b.score_pct) - Number(a.score_pct) || a.time_taken_sec - b.time_taken_sec)
      .slice(0, 10)
      .map((a: any, index: number) => ({
        rank: index + 1,
        student_id: a.student_id,
        name: profileMap.get(a.student_id)?.full_name ?? "Student",
        score_pct: Number(a.score_pct),
        correct_count: a.correct_count,
        total: a.total,
        time_taken_sec: a.time_taken_sec,
        submitted_at: a.submitted_at,
        is_me: a.student_id === context.userId,
      }));

    return {
      settings: {
        allow_comments: !!quiz.allow_comments,
        allow_likes: !!quiz.allow_likes,
        allow_sharing: !!quiz.allow_sharing,
        show_leaderboard: !!quiz.show_leaderboard,
      },
      counts: { likes: likes ?? 0, shares: shares ?? 0, comments: visibleComments.filter((c: any) => !c.is_hidden).length },
      liked_by_me: !!mine,
      comments: visibleComments.map((c: any) => ({ ...c, author_name: profileMap.get(c.user_id)?.full_name ?? "Student", is_mine: c.user_id === context.userId })),
      leaderboard,
      is_admin: admin,
    };
  });

export const toggleQuizLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => QuizIdInput.parse(d))
  .handler(async ({ context, data }) => {
    const db = context.supabase as any;
    const { data: existing } = await db
      .from("quiz_likes")
      .select("id")
      .eq("quiz_id", data.quiz_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing) {
      const { error } = await db.from("quiz_likes").delete().eq("id", existing.id);
      if (error) throw error;
      return { liked: false };
    }
    const { error } = await db.from("quiz_likes").insert({ quiz_id: data.quiz_id, user_id: context.userId });
    if (error) throw error;
    return { liked: true };
  });

export const addQuizComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ quiz_id: z.string().uuid(), body: z.string().trim().min(1).max(1000) }).parse(d))
  .handler(async ({ context, data }) => {
    const db = context.supabase as any;
    const { data: row, error } = await db
      .from("quiz_comments")
      .insert({ quiz_id: data.quiz_id, user_id: context.userId, body: data.body })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteQuizComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const db = context.supabase as any;
    const { error } = await db.from("quiz_comments").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const hideQuizComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), hidden: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    if (!(await isAdmin(context.supabase, context.userId))) throw new Error("Forbidden: admin only");
    const db = context.supabase as any;
    const { error } = await db.from("quiz_comments").update({ is_hidden: data.hidden }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const recordQuizShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ quiz_id: z.string().uuid(), channel: z.string().max(40).default("copy_link") }).parse(d))
  .handler(async ({ context, data }) => {
    const db = context.supabase as any;
    const { error } = await db.from("quiz_shares").insert({ quiz_id: data.quiz_id, user_id: context.userId, channel: data.channel });
    if (error) throw error;
    return { ok: true };
  });