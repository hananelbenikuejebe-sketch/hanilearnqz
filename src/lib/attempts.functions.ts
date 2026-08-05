import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, getAiBalance, billAiUsage, priceForFeature } from "./authz.server";
import { aiChat, parseJsonLoose, isAiConfigured } from "./ai-provider.server";

const DEFAULT_OBJECTIVE_POINTS = 1;
const DEFAULT_OPEN_POINTS = 10;

const pointsFor = (q: any) => {
  const p = Number(q.points);
  if (Number.isFinite(p) && p > 0) return p;
  return q.type === "short" || q.type === "essay" ? DEFAULT_OPEN_POINTS : DEFAULT_OBJECTIVE_POINTS;
};

/**
 * Tells the client, before submitting, whether AI marking will run for the
 * open-ended questions and what it will cost the taker.
 */
export const getGradingPreflight = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ quiz_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: questions } = await db
      .from("questions").select("id, type, points").eq("quiz_id", data.quiz_id);
    const qs = (questions ?? []) as any[];
    const open = qs.filter((q) => q.type === "short" || q.type === "essay");
    const totalMarks = qs.reduce((s, q) => s + pointsFor(q), 0);
    const { data: settings } = await db.from("payment_settings").select("*").eq("id", "default").maybeSingle();
    const unit = priceForFeature("ai_essay", settings);
    const balance = await getAiBalance(db, context.userId);
    const estimate = unit * open.length;
    const configured = isAiConfigured();
    return {
      open_count: open.length,
      total_marks: totalMarks,
      objective_count: qs.length - open.length,
      ai_configured: configured,
      unit_cost_kobo: unit,
      estimated_cost_kobo: estimate,
      ai_credit_kobo: balance,
      can_grade_all: configured && (unit === 0 || balance >= estimate),
      gradable_count: unit === 0 ? open.length : Math.min(open.length, Math.floor(balance / Math.max(1, unit))),
    };
  });

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
      .from("questions")
      .select("id, type, text, points, sample_answer, section_id, options(id, is_correct, text)")
      .eq("quiz_id", data.quiz_id);
    const qs = (questions ?? []) as any[];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: settings } = await db.from("payment_settings").select("*").eq("id", "default").maybeSingle();
    const essayUnitCost = priceForFeature("ai_essay", settings);

    let objectiveCorrect = 0;
    let objectiveGradable = 0;
    let pointsAwarded = 0;
    let pointsMax = 0;
    let openAwardedTotal = 0;
    let openMaxTotal = 0;
    let openMarkedCount = 0;
    let aiSkippedReason: string | null = null;

    // AI marking is paid for by the person taking the quiz, out of their AI credit.
    // Hard lock: once the balance can no longer cover a marking call, remaining
    // open questions score 0 (the taker is warned before submitting).
    let aiBudget = await getAiBalance(db, context.userId);
    let aiAvailable = isAiConfigured();
    if (!aiAvailable) aiSkippedReason = "AI marking is not configured — open-ended answers were scored 0.";

    const perQuestionAi: Record<string, any> = {};

    for (const q of qs) {
      const maxPts = pointsFor(q);
      pointsMax += maxPts;

      if (q.type === "mcq" || q.type === "tf") {
        objectiveGradable++;
        const correctIds = (q.options ?? []).filter((o: any) => o.is_correct).map((o: any) => o.id).sort();
        const ans = data.answers[q.id];
        const ansArr = Array.isArray(ans) ? [...ans].sort() : ans ? [ans] : [];
        const right = correctIds.length === ansArr.length && correctIds.every((c: string, i: number) => c === ansArr[i]);
        if (right) { objectiveCorrect++; pointsAwarded += maxPts; }
      } else if (q.type === "short" || q.type === "essay") {
        openMaxTotal += maxPts;
        const studentAns = String(data.answers[q.id] ?? "").trim();
        if (!studentAns) {
          perQuestionAi[q.id] = { score: 0, max: maxPts, feedback: "No answer submitted." };
          continue;
        }
        const canAfford = essayUnitCost === 0 || aiBudget >= essayUnitCost;
        if (aiAvailable && canAfford) {
          try {
            const r = await aiChat("heavy", [
              { role: "system", content: 'You are a strict but fair exam marker. Return ONLY JSON: {"score":number,"feedback":"one short paragraph"}. score is between 0 and max_points and may use halves.' },
              { role: "user", content: `Question: ${q.text}\nModel answer: ${q.sample_answer ?? "(not provided — grade on question intent)"}\nStudent answer: ${studentAns}\nmax_points: ${maxPts}` },
            ], { temperature: 0, max_tokens: 500, json: true });
            const parsed = parseJsonLoose<{ score?: number; feedback?: string }>(r.text, {});
            const score = Math.max(0, Math.min(maxPts, Number(parsed.score) || 0));
            openAwardedTotal += score;
            pointsAwarded += score;
            openMarkedCount++;
            perQuestionAi[q.id] = { score, max: maxPts, feedback: String(parsed.feedback ?? ""), provider: r.provider, model: r.model };
            const billed = await billAiUsage(context.userId, "ai_essay", {
              input_tokens: r.input_tokens, output_tokens: r.output_tokens,
              quiz_id: data.quiz_id, model: r.model, provider: r.provider,
              meta: { question_id: q.id, fell_back: r.fellBack },
            });
            aiBudget = Math.max(0, aiBudget - (billed.debited_kobo ?? 0));
          } catch (e: any) {
            perQuestionAi[q.id] = { score: 0, max: maxPts, feedback: `AI marker unavailable: ${e?.message ?? "error"}. Scored 0 pending manual review.` };
            aiSkippedReason = aiSkippedReason ?? "The AI marker failed on one or more answers; they were scored 0 and can be reviewed manually.";
          }
        } else {
          perQuestionAi[q.id] = {
            score: 0, max: maxPts,
            feedback: aiAvailable
              ? "Not marked — you ran out of AI credit, so this answer scored 0. Top up your AI credit and retake to have it marked."
              : "AI marking unavailable — scored 0.",
          };
          if (aiAvailable) aiSkippedReason = "You ran out of AI credit, so some open-ended answers were scored 0.";
        }
      } else {
        // Unknown type — treat as objective miss so totals stay honest.
        objectiveGradable++;
      }
    }

    const total = qs.length;
    const openCount = qs.filter((q) => q.type === "short" || q.type === "essay").length;
    const score_pct = pointsMax > 0 ? Math.round((pointsAwarded / pointsMax) * 10000) / 100 : 0;
    const objectivePct = objectiveGradable > 0 ? (objectiveCorrect / objectiveGradable) * 100 : 0;
    const openPct = openMaxTotal > 0 ? (openAwardedTotal / openMaxTotal) * 100 : 0;
    const gradable = objectiveGradable + openCount;

    const { data: attempt, error } = await context.supabase
      .from("attempts")
      .insert({
        student_id: context.userId,
        quiz_id: data.quiz_id,
        score_pct,
        correct_count: objectiveCorrect,
        total: gradable,
        time_taken_sec: data.time_taken_sec,
        answers: data.answers,
        submitted_at: new Date().toISOString(),
        awarded: openAwardedTotal,
        points_awarded: Math.round(pointsAwarded * 100) / 100,
        points_max: Math.round(pointsMax * 100) / 100,
        ai_feedback: { per_question: perQuestionAi, ai_used: openMarkedCount > 0, note: aiSkippedReason },
      } as any)
      .select().single();
    if (error) throw error;
    return {
      id: attempt.id, score_pct,
      points_awarded: Math.round(pointsAwarded * 100) / 100,
      points_max: Math.round(pointsMax * 100) / 100,
      correct_count: objectiveCorrect, total: gradable, total_questions: total,
      objective_pct: Math.round(objectivePct * 100) / 100,
      open_pct: Math.round(openPct * 100) / 100,
      open_marked: openMarkedCount, open_count: openCount,
      ai_used: openMarkedCount > 0, ai_note: aiSkippedReason,
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
