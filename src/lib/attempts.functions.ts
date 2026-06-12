import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Forbidden: admin only");
}

export const submitAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      quiz_id: z.string().uuid(),
      time_taken_sec: z.number().int().min(0).max(86400),
      answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: quiz } = await context.supabase
      .from("quizzes").select("*").eq("id", data.quiz_id).eq("is_published", true).maybeSingle();
    if (!quiz) throw new Error("Quiz not available");

    if (!quiz.allow_retakes) {
      const { count } = await context.supabase
        .from("attempts").select("id", { count: "exact", head: true })
        .eq("quiz_id", data.quiz_id).eq("student_id", context.userId);
      if ((count ?? 0) > 0) throw new Error("Retakes are not allowed for this quiz");
    } else if (quiz.max_attempts) {
      const { count } = await context.supabase
        .from("attempts").select("id", { count: "exact", head: true })
        .eq("quiz_id", data.quiz_id).eq("student_id", context.userId);
      if ((count ?? 0) >= quiz.max_attempts) throw new Error("Max attempts reached");
    }

    const { data: questions } = await context.supabase
      .from("questions").select("id, type, options(id, is_correct)").eq("quiz_id", data.quiz_id);
    let correct = 0;
    let gradable = 0;
    for (const q of questions ?? []) {
      if (q.type === "mcq" || q.type === "tf") {
        gradable++;
        const correctIds = (q.options ?? []).filter((o: any) => o.is_correct).map((o: any) => o.id).sort();
        const ans = data.answers[q.id];
        const ansArr = Array.isArray(ans) ? [...ans].sort() : ans ? [ans] : [];
        if (correctIds.length === ansArr.length && correctIds.every((c, i) => c === ansArr[i])) correct++;
      }
    }
    const total = (questions ?? []).length;
    const score_pct = gradable > 0 ? Math.round((correct / gradable) * 10000) / 100 : 0;
    const { data: attempt, error } = await context.supabase
      .from("attempts")
      .insert({
        student_id: context.userId,
        quiz_id: data.quiz_id,
        score_pct,
        correct_count: correct,
        total: gradable,
        time_taken_sec: data.time_taken_sec,
        answers: data.answers,
        submitted_at: new Date().toISOString(),
      })
      .select().single();
    if (error) throw error;
    return { id: attempt.id, score_pct, correct_count: correct, total: gradable, total_questions: total };
  });

export const getAttemptDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: attempt, error } = await context.supabase
      .from("attempts").select("*").eq("id", data.id).single();
    if (error) throw error;
    const isOwner = attempt.student_id === context.userId;
    const { data: isAdmin } = await context.supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!isOwner && !isAdmin) throw new Error("Forbidden");

    const { data: quiz } = await context.supabase.from("quizzes").select("*").eq("id", attempt.quiz_id).single();
    const { data: questions } = await context.supabase
      .from("questions").select("*, options(*)").eq("quiz_id", attempt.quiz_id).order("position");
    return { attempt, quiz, questions: questions ?? [] };
  });

export const listAttemptsForQuiz = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { quiz_id: string }) => z.object({ quiz_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: attempts } = await context.supabase
      .from("attempts").select("*").eq("quiz_id", data.quiz_id).order("submitted_at", { ascending: false });
    const studentIds = Array.from(new Set((attempts ?? []).map((a) => a.student_id)));
    const { data: profiles } = studentIds.length
      ? await context.supabase.from("profiles").select("id, full_name, email").in("id", studentIds)
      : { data: [] as any[] };
    const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    return (attempts ?? []).map((a) => ({ ...a, student: profMap.get(a.student_id) ?? null }));
  });

export const listMyAttempts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("attempts").select("*, quizzes(title, category)").eq("student_id", context.userId)
      .order("submitted_at", { ascending: false });
    return data ?? [];
  });
