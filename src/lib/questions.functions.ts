import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCanEditQuiz, getEffectivePerms } from "./authz.server";

async function assertCanEditQuestion(supabase: any, userId: string, questionId: string) {
  const { data: q } = await supabase.from("questions").select("quiz_id").eq("id", questionId).maybeSingle();
  if (!q) throw new Error("Question not found");
  await assertCanEditQuiz(supabase, userId, q.quiz_id);
}

const OptionSchema = z.object({
  text: z.string().min(1).max(2000),
  is_correct: z.boolean(),
});

const QuestionInput = z.object({
  quiz_id: z.string().uuid(),
  type: z.enum(["mcq", "tf", "short", "essay"]),
  text: z.string().min(1).max(8000),
  explanation: z.string().max(4000).optional().nullable(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  tags: z.array(z.string().max(50)).max(20).default([]),
  options: z.array(OptionSchema).max(10).default([]),
  ai_confidence: z.number().min(0).max(100).optional().nullable(),
  needs_review: z.boolean().optional(),
  review_reason: z.string().max(500).optional().nullable(),
  raw_import_text: z.string().max(12000).optional().nullable(),
  sample_answer: z.string().max(4000).optional().nullable(),
  points: z.number().min(0).max(1000).optional().nullable(),
  subsection: z.string().max(80).optional().nullable(),
});

export const createQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => QuestionInput.parse(d))
  .handler(async ({ context, data }) => {
    await assertCanEditQuiz(context.supabase, context.userId, data.quiz_id);
    const effective = await getEffectivePerms(context.supabase, context.userId);
    if (effective.max_questions_per_quiz != null) {
      const { count } = await context.supabase.from("questions").select("id", { count: "exact", head: true }).eq("quiz_id", data.quiz_id);
      if ((count ?? 0) >= effective.max_questions_per_quiz) throw new Error(`Free tier allows ${effective.max_questions_per_quiz} questions per quiz. Upgrade to add more.`);
    }
    const { data: maxRow } = await context.supabase
      .from("questions")
      .select("position")
      .eq("quiz_id", data.quiz_id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const position = (maxRow?.position ?? -1) + 1;
    const { data: q, error } = await context.supabase
      .from("questions")
      .insert({
        quiz_id: data.quiz_id,
        type: data.type,
        text: data.text,
        explanation: data.explanation,
        difficulty: data.difficulty,
        tags: data.tags,
        ai_confidence: data.ai_confidence ?? null,
        needs_review: data.needs_review ?? false,
        review_reason: data.review_reason ?? null,
        raw_import_text: data.raw_import_text ?? null,
        sample_answer: data.sample_answer ?? null,
        points: data.points ?? null,
        subsection: data.subsection ?? null,
        position,
      } as any)
      .select()
      .single();
    if (error) throw error;
    if (data.options.length) {
      await context.supabase.from("options").insert(
        data.options.map((o, i) => ({ question_id: q.id, position: i, text: o.text, is_correct: o.is_correct })),
      );
    }
    return q;
  });

export const updateQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      patch: z.object({
        type: z.enum(["mcq", "tf", "short", "essay"]).optional(),
        text: z.string().min(1).max(8000).optional(),
        explanation: z.string().max(4000).nullable().optional(),
        difficulty: z.enum(["easy", "medium", "hard"]).optional(),
        tags: z.array(z.string().max(50)).max(20).optional(),
        ai_confidence: z.number().min(0).max(100).nullable().optional(),
        needs_review: z.boolean().optional(),
        review_reason: z.string().max(500).nullable().optional(),
        raw_import_text: z.string().max(12000).nullable().optional(),
        sample_answer: z.string().max(4000).nullable().optional(),
        points: z.number().min(0).max(1000).nullable().optional(),
        subsection: z.string().max(80).nullable().optional(),
      }),
      options: z.array(OptionSchema).max(10).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertCanEditQuestion(context.supabase, context.userId, data.id);
    const { error } = await context.supabase.from("questions").update(data.patch as any).eq("id", data.id);
    if (error) throw error;
    if (data.options) {
      await context.supabase.from("options").delete().eq("question_id", data.id);
      if (data.options.length) {
        await context.supabase.from("options").insert(
          data.options.map((o, i) => ({ question_id: data.id, position: i, text: o.text, is_correct: o.is_correct })),
        );
      }
    }
    return { ok: true };
  });

export const deleteQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertCanEditQuestion(context.supabase, context.userId, data.id);
    const { error } = await context.supabase.from("questions").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const bulkDeleteQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).parse(d))
  .handler(async ({ context, data }) => {
    // Verify caller can edit every quiz referenced by these questions.
    const { data: rows } = await context.supabase.from("questions").select("quiz_id").in("id", data.ids);
    const quizIds = Array.from(new Set((rows ?? []).map((r: any) => r.quiz_id)));
    for (const qid of quizIds) await assertCanEditQuiz(context.supabase, context.userId, qid as string);
    const { error } = await context.supabase.from("questions").delete().in("id", data.ids);
    if (error) throw error;
    return { ok: true, count: data.ids.length };
  });

export const distributeQuizPoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ quiz_id: z.string().uuid(), total: z.number().min(0).max(10000) }).parse(d))
  .handler(async ({ context, data }) => {
    await assertCanEditQuiz(context.supabase, context.userId, data.quiz_id);
    const { data: qs } = await context.supabase.from("questions").select("id").eq("quiz_id", data.quiz_id);
    const n = qs?.length ?? 0;
    if (n === 0) return { ok: true, per_question: 0 };
    const per = Math.round((data.total / n) * 100) / 100;
    for (const q of qs!) {
      await context.supabase.from("questions").update({ points: per } as any).eq("id", q.id);
    }
    await context.supabase.from("quizzes").update({ total_score: data.total } as any).eq("id", data.quiz_id);
    return { ok: true, per_question: per };
  });

export const reorderQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ quiz_id: z.string().uuid(), order: z.array(z.string().uuid()) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertCanEditQuiz(context.supabase, context.userId, data.quiz_id);
    for (let i = 0; i < data.order.length; i++) {
      await context.supabase.from("questions").update({ position: i }).eq("id", data.order[i]).eq("quiz_id", data.quiz_id);
    }
    return { ok: true };
  });

export const duplicateQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertCanEditQuestion(context.supabase, context.userId, data.id);
    const { data: q } = await context.supabase.from("questions").select("*, options(*)").eq("id", data.id).single();
    if (!q) throw new Error("Question not found");
    const { id: _, created_at: _c, options, position, ...rest } = q as any;
    const { data: maxRow } = await context.supabase
      .from("questions").select("position").eq("quiz_id", rest.quiz_id)
      .order("position", { ascending: false }).limit(1).maybeSingle();
    const newPos = (maxRow?.position ?? -1) + 1;
    const { data: nq, error } = await context.supabase
      .from("questions").insert({ ...rest, position: newPos }).select().single();
    if (error) throw error;
    if (options?.length) {
      await context.supabase.from("options").insert(
        options.map((o: any) => ({ question_id: nq.id, position: o.position, text: o.text, is_correct: o.is_correct })),
      );
    }
    return nq;
  });

export const bulkInsertQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      quiz_id: z.string().uuid(),
      questions: z.array(QuestionInput.omit({ quiz_id: true })).min(1).max(200),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertCanEditQuiz(context.supabase, context.userId, data.quiz_id);
    const { data: maxRow } = await context.supabase
      .from("questions").select("position").eq("quiz_id", data.quiz_id)
      .order("position", { ascending: false }).limit(1).maybeSingle();
    let pos = (maxRow?.position ?? -1) + 1;
    for (const q of data.questions) {
      const { data: created, error } = await context.supabase
        .from("questions")
        .insert({
          quiz_id: data.quiz_id, position: pos++, type: q.type, text: q.text,
          explanation: q.explanation, difficulty: q.difficulty, tags: q.tags,
          ai_confidence: q.ai_confidence ?? null, needs_review: q.needs_review ?? false,
          review_reason: q.review_reason ?? null, raw_import_text: q.raw_import_text ?? null,
          sample_answer: q.sample_answer ?? null,
        })
        .select().single();
      if (error) throw error;
      if (q.options.length) {
        await context.supabase.from("options").insert(
          q.options.map((o, i) => ({ question_id: created.id, position: i, text: o.text, is_correct: o.is_correct })),
        );
      }
    }
    return { ok: true, count: data.questions.length };
  });
