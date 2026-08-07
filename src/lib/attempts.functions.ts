import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAiBalance, billAiUsage, priceForFeature } from "./authz.server";
import { aiChat, parseJsonLoose, isAiConfigured } from "./ai-provider.server";
import {
  pointsFor, isOpen, isObjective, gradeObjective, gradeShortDeterministically,
  mapWithConcurrency, withTimeout,
} from "./grading.server";

const QUESTION_SELECT = "id, position, type, text, points, sample_answer, explanation, section_id, options(id, position, text, is_correct)";

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
      .from("questions").select(QUESTION_SELECT).eq("quiz_id", data.quiz_id);
    const qs = (questions ?? []) as any[];
    // Only open questions with no deterministic answer key actually need AI.
    const open = qs.filter((q) => isOpen(q));
    const needAi = open.filter((q) => gradeShortDeterministically(q, "placeholder-probe") === null);
    const totalMarks = qs.reduce((s, q) => s + pointsFor(q), 0);
    const { data: settings } = await db.from("payment_settings").select("*").eq("id", "default").maybeSingle();
    const unit = priceForFeature("ai_essay", settings);
    const balance = await getAiBalance(db, context.userId);
    const estimate = unit * needAi.length;
    const configured = isAiConfigured();
    return {
      open_count: open.length,
      ai_marked_count: needAi.length,
      total_marks: totalMarks,
      objective_count: qs.length - open.length,
      ai_configured: configured,
      unit_cost_kobo: unit,
      estimated_cost_kobo: estimate,
      ai_credit_kobo: balance,
      can_grade_all: configured && (unit === 0 || balance >= estimate),
      gradable_count: unit === 0 ? needAi.length : Math.min(needAi.length, Math.floor(balance / Math.max(1, unit))),
    };
  });

type PerQuestion = Record<string, any>;

function summarise(qs: any[], per: PerQuestion) {
  let pointsAwarded = 0;
  let pointsMax = 0;
  let objectiveCorrect = 0;
  let objectiveGradable = 0;
  let openAwarded = 0;
  let openMax = 0;
  let openMarked = 0;
  let ungradable = 0;
  for (const q of qs) {
    const row = per[q.id];
    if (!row) continue;
    if (row.status === "ungradable") { ungradable++; continue; }
    pointsMax += Number(row.max) || 0;
    pointsAwarded += Number(row.score) || 0;
    if (isObjective(q)) {
      objectiveGradable++;
      if (row.status === "correct") objectiveCorrect++;
    } else {
      openMax += Number(row.max) || 0;
      openAwarded += Number(row.score) || 0;
      if (row.marked_by === "ai") openMarked++;
    }
  }
  const score_pct = pointsMax > 0 ? Math.round((pointsAwarded / pointsMax) * 10000) / 100 : 0;
  return {
    points_awarded: Math.round(pointsAwarded * 100) / 100,
    points_max: Math.round(pointsMax * 100) / 100,
    score_pct,
    objective_correct: objectiveCorrect,
    objective_gradable: objectiveGradable,
    open_awarded: Math.round(openAwarded * 100) / 100,
    open_max: Math.round(openMax * 100) / 100,
    open_marked: openMarked,
    ungradable,
  };
}

const MARKER_SYSTEM_PROMPT = `You are a fair, experienced human teacher marking student answers. You are generous
and pragmatic, not pedantic. Rules you must follow:
- Award FULL marks when the answer is semantically correct, even if phrasing, spelling, case,
  punctuation, word order or grammar differ from the model answer — unless the question is
  specifically testing grammar or spelling.
- Accept synonyms, abbreviations, common misspellings, and numerically equivalent answers
  (e.g. "12" = "twelve", "5kg" = "5 kilograms").
- Trivial factual answers (a name, an age, a date, a one-word fact) should be marked fully
  correct if they match the expected fact, however briefly phrased.
- If a model/sample answer is provided, treat it as the reference for what counts as correct,
  but do not require an exact wording match to it.
- For multi-part or longer answers, award PARTIAL credit proportional to how much of the
  expected content is present — do not give all-or-nothing marks except on truly single-fact
  questions.
- Never penalise grammar, spelling or phrasing unless the question is explicitly about grammar
  or spelling.
- If you are unsure whether the answer is right, resolve the doubt in the student's favour.
- Output ONLY strict JSON, no prose, no markdown fences: {"awarded": number, "max": number, "reason": "one short sentence explaining the mark"}.
  "awarded" must be between 0 and "max" (inclusive) and may use halves.`;

async function markOpenWithAi(q: any, studentAns: string, maxPts: number) {
  const r = await withTimeout(
    aiChat("heavy", [
      { role: "system", content: MARKER_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Question: ${q.text}\nSample/model answer (reference only, not required verbatim): ${q.sample_answer ?? "(not provided — grade on question intent)"}\nStudent answer: ${studentAns}\nmax: ${maxPts}`,
      },
    ], { temperature: 0, max_tokens: 400, json: true }),
    45000,
  );
  const parsed = parseJsonLoose<{ awarded?: number; max?: number; reason?: string }>(r.text, {});
  const score = Math.max(0, Math.min(maxPts, Number(parsed.awarded) || 0));
  return { score, feedback: String(parsed.reason ?? ""), meta: r };
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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    // Read the answer key with the admin client so RLS can never hide `is_correct`.
    const { data: questions } = await db.from("questions").select(QUESTION_SELECT).eq("quiz_id", data.quiz_id).order("position");
    const qs = (questions ?? []) as any[];

    const per: PerQuestion = {};
    const needAi: any[] = [];

    for (const q of qs) {
      const maxPts = pointsFor(q);
      if (isObjective(q)) {
        const v = gradeObjective(q, data.answers[q.id]);
        per[q.id] = {
          kind: "objective",
          status: v.status,
          score: v.status === "correct" ? maxPts : 0,
          max: maxPts,
          selected_ids: v.selected_ids,
          correct_ids: v.correct_ids,
          marked_by: "auto",
          feedback: v.reason ?? (v.status === "correct" ? "Correct." : "Incorrect."),
        };
        continue;
      }
      if (isOpen(q)) {
        const studentAns = String(data.answers[q.id] ?? "").trim();
        const deterministic = gradeShortDeterministically(q, studentAns);
        if (!studentAns) {
          per[q.id] = { kind: "open", status: "graded", score: 0, max: maxPts, marked_by: "auto", feedback: "No answer submitted." };
          continue;
        }
        if (deterministic) {
          per[q.id] = {
            kind: "open", status: "graded", score: deterministic.score, max: maxPts,
            marked_by: "auto", feedback: deterministic.feedback,
          };
          continue;
        }
        per[q.id] = { kind: "open", status: "pending_ai", score: 0, max: maxPts, marked_by: "pending", feedback: "Marking…" };
        needAi.push(q);
        continue;
      }
      // Unknown type — never punish the student for a data problem.
      per[q.id] = { kind: "other", status: "ungradable", score: 0, max: maxPts, marked_by: "auto", feedback: "This question type could not be graded automatically." };
    }

    const totals = summarise(qs, per);
    const { data: attempt, error } = await db
      .from("attempts")
      .insert({
        student_id: context.userId,
        quiz_id: data.quiz_id,
        score_pct: totals.score_pct,
        correct_count: totals.objective_correct,
        total: totals.objective_gradable + qs.filter((q) => isOpen(q)).length,
        time_taken_sec: data.time_taken_sec,
        answers: data.answers,
        submitted_at: new Date().toISOString(),
        awarded: totals.open_awarded,
        points_awarded: totals.points_awarded,
        points_max: totals.points_max,
        ai_feedback: {
          per_question: per,
          grading_status: needAi.length ? "pending_ai" : "complete",
          pending_ai: needAi.map((q) => q.id),
          ai_used: false,
          note: null,
        },
      })
      .select().single();
    if (error) throw error;

    return {
      id: attempt.id,
      pending_ai: needAi.length,
      score_pct: totals.score_pct,
      points_awarded: totals.points_awarded,
      points_max: totals.points_max,
      correct_count: totals.objective_correct,
      total: totals.objective_gradable,
      total_questions: qs.length,
      ungradable: totals.ungradable,
    };
  });

/**
 * Second grading phase: marks the open-ended answers with AI, bills the taker's
 * AI credit and finalises the score. Called by the corrections page right after
 * submit so a long quiz can never hang the submit request itself. Idempotent.
 */
export const finalizeGrading = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ attempt_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: attempt } = await db.from("attempts").select("*").eq("id", data.attempt_id).maybeSingle();
    if (!attempt) throw new Error("Attempt not found");
    if (attempt.student_id !== context.userId) throw new Error("Forbidden");

    const feedback = (attempt.ai_feedback ?? {}) as any;
    const per: PerQuestion = { ...(feedback.per_question ?? {}) };
    const pendingIds: string[] = (feedback.pending_ai ?? []).filter((id: string) => per[id]?.status === "pending_ai");
    const { data: questions } = await db.from("questions").select(QUESTION_SELECT).eq("quiz_id", attempt.quiz_id).order("position");
    const qs = (questions ?? []) as any[];

    if (feedback.grading_status === "complete" || pendingIds.length === 0) {
      const totals = summarise(qs, per);
      return { grading_status: "complete", ...totals, note: feedback.note ?? null };
    }

    const { data: settings } = await db.from("payment_settings").select("*").eq("id", "default").maybeSingle();
    const unit = priceForFeature("ai_essay", settings);
    let budget = await getAiBalance(db, context.userId);
    const aiReady = isAiConfigured();
    let note: string | null = null;
    const answers = (attempt.answers ?? {}) as Record<string, any>;
    const byId = new Map(qs.map((q) => [q.id, q]));

    // How many can we afford up front? Mark those, hard-fail the rest with a reason.
    const affordable = !aiReady ? 0 : unit === 0 ? pendingIds.length : Math.min(pendingIds.length, Math.floor(budget / unit));
    const toMark = pendingIds.slice(0, affordable);
    const unaffordable = pendingIds.slice(affordable);

    for (const id of unaffordable) {
      per[id] = {
        ...per[id], status: "graded", score: 0, marked_by: "auto",
        feedback: aiReady
          ? "Not marked — your AI credit could not cover this answer, so it scored 0. Top up your AI credit and retake to have it marked."
          : "AI marking is unavailable right now, so this answer scored 0. It can be reviewed manually.",
      };
    }
    if (unaffordable.length) {
      note = aiReady
        ? "You ran out of AI credit, so some open-ended answers scored 0."
        : "AI marking is not configured — open-ended answers scored 0.";
    }

    await mapWithConcurrency(toMark, 5, async (id) => {
      const q = byId.get(id);
      if (!q) return;
      const maxPts = pointsFor(q);
      const studentAns = String(answers[id] ?? "").trim();
      try {
        const r = await markOpenWithAi(q, studentAns, maxPts);
        per[id] = {
          ...per[id], status: "graded", score: r.score, max: maxPts, marked_by: "ai",
          feedback: r.feedback, provider: r.meta.provider, model: r.meta.model,
        };
        const billed = await billAiUsage(context.userId, "ai_essay", {
          input_tokens: r.meta.input_tokens, output_tokens: r.meta.output_tokens,
          quiz_id: attempt.quiz_id, model: r.meta.model, provider: r.meta.provider,
          meta: { question_id: id, attempt_id: attempt.id, fell_back: r.meta.fellBack },
        });
        budget = Math.max(0, budget - (billed.debited_kobo ?? 0));
      } catch (e: any) {
        per[id] = {
          ...per[id], status: "graded", score: 0, marked_by: "auto",
          feedback: `The AI marker could not mark this answer (${e?.message ?? "error"}). It scored 0 and can be reviewed manually.`,
        };
        note = note ?? "The AI marker failed on one or more answers; they scored 0 and can be reviewed manually.";
      }
    });

    const totals = summarise(qs, per);
    await db.from("attempts").update({
      score_pct: totals.score_pct,
      correct_count: totals.objective_correct,
      awarded: totals.open_awarded,
      points_awarded: totals.points_awarded,
      points_max: totals.points_max,
      ai_feedback: {
        ...feedback,
        per_question: per,
        grading_status: "complete",
        pending_ai: [],
        ai_used: totals.open_marked > 0,
        note,
      },
    }).eq("id", attempt.id);

    return { grading_status: "complete", ...totals, note };
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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: quiz } = await db.from("quizzes").select("*").eq("id", attempt.quiz_id).maybeSingle();
    const { data: questions } = await db
      .from("questions").select(QUESTION_SELECT).eq("quiz_id", attempt.quiz_id).order("position");
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
      .from("attempts").select("*").eq("quiz_id", data.quiz_id).order("submitted_at", { ascending: false }).limit(5000);
    const studentIds = Array.from(new Set((attempts ?? []).map((a: any) => a.student_id)));
    const { data: profiles } = studentIds.length
      ? await db.from("profiles").select("id, full_name, handle, email").in("id", studentIds)
      : { data: [] as any[] };
    const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    return (attempts ?? []).map((a: any) => ({ ...a, student: profMap.get(a.student_id) ?? null }));
  });

export const listMyAttempts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("attempts").select("*, quizzes(title, category)").eq("student_id", context.userId)
      .order("submitted_at", { ascending: false }).limit(1000);
    return data ?? [];
  });
