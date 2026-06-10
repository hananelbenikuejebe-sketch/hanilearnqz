import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw error;
  if (!data) throw new Error("Forbidden: admin only");
}

export const listQuizzesAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: quizzes, error } = await context.supabase
      .from("quizzes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const ids = (quizzes ?? []).map((q) => q.id);
    const counts: Record<string, { questions: number; attempts: number }> = {};
    if (ids.length) {
      const { data: qs } = await context.supabase.from("questions").select("quiz_id").in("quiz_id", ids);
      const { data: as } = await context.supabase.from("attempts").select("quiz_id").in("quiz_id", ids);
      for (const id of ids) counts[id] = { questions: 0, attempts: 0 };
      (qs ?? []).forEach((r: any) => { counts[r.quiz_id].questions++; });
      (as ?? []).forEach((r: any) => { counts[r.quiz_id].attempts++; });
    }
    return (quizzes ?? []).map((q) => ({ ...q, ...counts[q.id] }));
  });

export const listPublishedQuizzes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: quizzes, error } = await context.supabase
      .from("quizzes")
      .select("*")
      .eq("is_published", true)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const ids = (quizzes ?? []).map((q) => q.id);
    const counts: Record<string, number> = {};
    if (ids.length) {
      const { data: qs } = await context.supabase.from("questions").select("quiz_id").in("quiz_id", ids);
      for (const id of ids) counts[id] = 0;
      (qs ?? []).forEach((r: any) => { counts[r.quiz_id]++; });
    }
    return (quizzes ?? []).map((q) => ({ ...q, question_count: counts[q.id] ?? 0 }));
  });

export const getQuizAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: quiz, error } = await context.supabase.from("quizzes").select("*").eq("id", data.id).single();
    if (error) throw error;
    const { data: questions } = await context.supabase
      .from("questions")
      .select("*, options(*)")
      .eq("quiz_id", data.id)
      .order("position");
    return { quiz, questions: questions ?? [] };
  });

export const getQuizForPlayer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: quiz, error } = await context.supabase
      .from("quizzes")
      .select("*")
      .eq("id", data.id)
      .eq("is_published", true)
      .maybeSingle();
    if (error) throw error;
    if (!quiz) throw new Error("Quiz not found or not published");
    const { data: questions } = await context.supabase
      .from("questions")
      .select("id, position, type, text, options(id, position, text)")
      .eq("quiz_id", data.id)
      .order("position");

    const prepared = (questions ?? []).map((q: any) => {
      const opts = (q.options ?? []).sort((a: any, b: any) => a.position - b.position);
      return { ...q, options: quiz.shuffle_options ? shuffle(opts) : opts };
    });
    const finalQuestions = quiz.randomize_questions ? shuffle(prepared) : prepared;
    return { quiz, questions: finalQuestions };
  });

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const QuizInput = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  category: z.string().min(1).max(50),
  subject: z.string().max(80).optional().nullable(),
  duration_min: z.number().int().min(5).max(600),
  difficulty: z.enum(["easy", "medium", "hard"]),
  instructions: z.string().max(4000).optional().nullable(),
  visibility: z.enum(["public", "private"]).default("public"),
  access_key: z.string().max(40).optional().nullable(),
  input_method: z.enum(["upload", "paste", "manual"]).default("manual"),
  source_type: z.string().max(40).optional().nullable(),
  parsing_settings: z.object({
    strictness: z.enum(["loose", "normal", "strict"]).default("normal"),
    auto_detect_type: z.boolean().default(true),
    confidence_threshold: z.number().int().min(30).max(95).default(80),
    default_question_type: z.enum(["mcq", "tf", "short", "essay"]).default("mcq"),
    ask_confirmation: z.boolean().default(true),
  }).default({}),
  is_published: z.boolean(),
  randomize_questions: z.boolean(),
  shuffle_options: z.boolean(),
  show_answers_after: z.boolean(),
  show_explanations: z.boolean(),
  enforce_time: z.boolean(),
  allow_retakes: z.boolean(),
  max_attempts: z.number().int().min(1).max(100).optional().nullable(),
  start_at: z.string().datetime().optional().nullable(),
  end_at: z.string().datetime().optional().nullable(),
  scheduled_at: z.string().datetime().optional().nullable(),
});

export const createQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => QuizInput.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("quizzes")
      .insert({ ...data, created_by: context.userId })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const updateQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), patch: QuizInput.partial() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("quizzes")
      .update(data.patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("quizzes").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const duplicateQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: orig } = await context.supabase.from("quizzes").select("*").eq("id", data.id).single();
    if (!orig) throw new Error("Quiz not found");
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = orig as any;
    const { data: newQuiz, error } = await context.supabase
      .from("quizzes")
      .insert({ ...rest, title: `${orig.title} (copy)`, is_published: false, created_by: context.userId })
      .select()
      .single();
    if (error) throw error;

    const { data: questions } = await context.supabase
      .from("questions")
      .select("*, options(*)")
      .eq("quiz_id", data.id)
      .order("position");
    for (const q of questions ?? []) {
      const { id: _qid, quiz_id: _qz, created_at: _qc, options, ...qrest } = q as any;
      const { data: nq } = await context.supabase
        .from("questions")
        .insert({ ...qrest, quiz_id: newQuiz.id })
        .select()
        .single();
      if (nq && options?.length) {
        await context.supabase
          .from("options")
          .insert(options.map((o: any) => ({ question_id: nq.id, position: o.position, text: o.text, is_correct: o.is_correct })));
      }
    }
    return newQuiz;
  });
