import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, getCreatorPerms, logAiUsage } from "./authz.server";


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
      .from("questions").select("id, type, text, points, sample_answer, options(id, is_correct, text)").eq("quiz_id", data.quiz_id);
    const qs = (questions ?? []) as any[];

    let objectiveCorrect = 0;
    let objectiveGradable = 0;
    let openAwardedTotal = 0;
    let openMaxTotal = 0;
    let openMarkedCount = 0;
    let aiSkippedReason: string | null = null;

    // AI grading gate: honour the quiz creator's ai_enabled permission.
    let aiAllowed = false;
    if (quiz.created_by) {
      try {
        const perms = await getCreatorPerms(context.supabase, quiz.created_by);
        // Admins auto-have AI; creators only if ai_enabled.
        aiAllowed = perms ? !!perms.ai_enabled : true;
      } catch { aiAllowed = false; }
    }
    const aiKey = process.env.LOVABLE_API_KEY;
    if (!aiKey) { aiAllowed = false; aiSkippedReason = "AI is not configured yet."; }

    const perQuestionAi: Record<string, any> = {};

    for (const q of qs) {
      if (q.type === "mcq" || q.type === "tf") {
        objectiveGradable++;
        const correctIds = (q.options ?? []).filter((o: any) => o.is_correct).map((o: any) => o.id).sort();
        const ans = data.answers[q.id];
        const ansArr = Array.isArray(ans) ? [...ans].sort() : ans ? [ans] : [];
        if (correctIds.length === ansArr.length && correctIds.every((c: string, i: number) => c === ansArr[i])) objectiveCorrect++;
      } else if (q.type === "short" || q.type === "essay") {
        const maxPts = Number(q.points ?? 10);
        openMaxTotal += maxPts;
        const studentAns = String(data.answers[q.id] ?? "").trim();
        if (!studentAns) continue;
        if (aiAllowed) {
          try {
            const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Lovable-API-Key": aiKey! },
              body: JSON.stringify({
                model: "google/gemini-3-flash-preview",
                messages: [
                  { role: "system", content: "You are a strict but fair exam marker. Return ONLY JSON: {\"score\":number,\"feedback\":\"...\"}. Score is 0..max_points." },
                  { role: "user", content: `Question: ${q.text}\nModel answer: ${q.sample_answer ?? "(not provided — grade on question intent)"}\nStudent answer: ${studentAns}\nmax_points: ${maxPts}` },
                ],
                temperature: 0,
              }),
            });
            if (!res.ok) throw new Error(`AI marker HTTP ${res.status}`);
            const json = await res.json();
            const text = json.choices?.[0]?.message?.content ?? "{}";
            const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
            const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
            const parsed = start !== -1 && end > start ? JSON.parse(cleaned.slice(start, end + 1)) : { score: 0, feedback: "" };
            const score = Math.max(0, Math.min(maxPts, Number(parsed.score) || 0));
            openAwardedTotal += score;
            openMarkedCount++;
            perQuestionAi[q.id] = { score, max: maxPts, feedback: String(parsed.feedback ?? "") };
            await logAiUsage(context.supabase, context.userId, {
              feature: "essay_grade", model: "google/gemini-3-flash-preview",
              input_tokens: json.usage?.prompt_tokens ?? 0, output_tokens: json.usage?.completion_tokens ?? 0,
              credits_cost: Number(json.usage?.total_tokens ?? 0) / 1000 * 0.02, quiz_id: data.quiz_id,
            });
          } catch (e: any) {
            perQuestionAi[q.id] = { score: 0, max: maxPts, feedback: `AI marker unavailable: ${e?.message ?? "error"}. Scored 0 pending manual review.` };
            aiSkippedReason = aiSkippedReason ?? "AI marker failed for one or more essay answers; they were scored 0.";
          }
        } else {
          perQuestionAi[q.id] = { score: 0, max: maxPts, feedback: aiSkippedReason ?? "AI marking is disabled for this quiz — scored 0. A creator can grade manually." };
        }
      }
    }
    const total = qs.length;
    // Composite score: objective percent + open-question percent, weighted by question count.
    const objectivePct = objectiveGradable > 0 ? (objectiveCorrect / objectiveGradable) * 100 : 0;
    const openPct = openMaxTotal > 0 ? (openAwardedTotal / openMaxTotal) * 100 : 0;
    const openCount = qs.filter((q) => q.type === "short" || q.type === "essay").length;
    let score_pct = 0;
    if (objectiveGradable + openCount > 0) {
      score_pct = ((objectivePct * objectiveGradable) + (openPct * openCount)) / (objectiveGradable + openCount);
    }
    score_pct = Math.round(score_pct * 100) / 100;
    const correct = objectiveCorrect;
    const gradable = objectiveGradable + openCount;

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
        awarded: openAwardedTotal,
        ai_feedback: { per_question: perQuestionAi, ai_used: aiAllowed, note: aiSkippedReason },
      } as any)
      .select().single();
    if (error) throw error;
    return {
      id: attempt.id, score_pct, correct_count: correct, total: gradable, total_questions: total,
      objective_pct: Math.round(objectivePct * 100) / 100,
      open_pct: Math.round(openPct * 100) / 100,
      open_marked: openMarkedCount, open_count: openCount,
      ai_used: aiAllowed, ai_note: aiSkippedReason,
    };
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: quiz } = await db.from("quizzes").select("created_by").eq("id", data.quiz_id).maybeSingle();
    const { data: roleRows } = await db.from("user_roles").select("role").eq("user_id", context.userId);
    const isAdminUser = (roleRows ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin");
    if (!isAdminUser && quiz?.created_by !== context.userId) throw new Error("Forbidden: you can only see results for your own quizzes");
    const { data: attempts } = await db
      .from("attempts").select("*").eq("quiz_id", data.quiz_id).order("submitted_at", { ascending: false });
    const studentIds = Array.from(new Set((attempts ?? []).map((a: any) => a.student_id)));
    const { data: profiles } = studentIds.length
      ? await db.from("profiles").select("id, full_name, email").in("id", studentIds)
      : { data: [] as any[] };
    const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    return (attempts ?? []).map((a: any) => ({ ...a, student: profMap.get(a.student_id) ?? null }));
  });

export const listMyAttempts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("attempts").select("*, quizzes(title, category)").eq("student_id", context.userId)
      .order("submitted_at", { ascending: false });
    return data ?? [];
  });
