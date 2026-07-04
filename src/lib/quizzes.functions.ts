import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, assertCanEditQuiz, canCreate, getCreatorPerms, isSuperAdmin } from "./authz.server";


async function signBanner(adminDb: any, path?: string | null) {
  if (!path) return null;
  const { data } = await adminDb.storage.from("quiz-banners").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

async function socialCounts(adminDb: any, ids: string[]) {
  const base: Record<string, { likes: number; comments: number; shares: number }> = {};
  ids.forEach((id) => { base[id] = { likes: 0, comments: 0, shares: 0 }; });
  if (!ids.length) return base;
  const [{ data: likes }, { data: comments }, { data: shares }] = await Promise.all([
    adminDb.from("quiz_likes").select("quiz_id").in("quiz_id", ids),
    adminDb.from("quiz_comments").select("quiz_id, is_hidden").in("quiz_id", ids),
    adminDb.from("quiz_shares").select("quiz_id").in("quiz_id", ids),
  ]);
  (likes ?? []).forEach((r: any) => { base[r.quiz_id].likes++; });
  (comments ?? []).forEach((r: any) => { if (!r.is_hidden) base[r.quiz_id].comments++; });
  (shares ?? []).forEach((r: any) => { base[r.quiz_id].shares++; });
  return base;
}

function requestOrigin() {
  try { return new URL(getRequest().url).origin; } catch { return "https://hanilearnqz.lovable.app"; }
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const adminDb = supabaseAdmin as any;
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
    const socials = await socialCounts(adminDb, ids);
    const origin = requestOrigin();
    return Promise.all((quizzes ?? []).map(async (q: any) => ({
      ...q,
      question_count: counts[q.id] ?? 0,
      banner_url: await signBanner(adminDb, q.banner_path),
      share_url: `${origin}/share/quiz/${q.id}`,
      social_counts: socials[q.id] ?? { likes: 0, comments: 0, shares: 0 },
    })));
  });

export const getQuizAbout = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const adminDb = supabaseAdmin as any;
    const { data: quiz, error } = await context.supabase
      .from("quizzes")
      .select("*")
      .eq("id", data.id)
      .eq("is_published", true)
      .maybeSingle();
    if (error) throw error;
    if (!quiz) throw new Error("Quiz not found or not published");
    const { count } = await context.supabase.from("questions").select("id", { count: "exact", head: true }).eq("quiz_id", data.id);
    const counts = await socialCounts(adminDb, [data.id]);
    return { ...quiz, banner_url: await signBanner(adminDb, (quiz as any).banner_path), share_url: `${requestOrigin()}/share/quiz/${data.id}`, question_count: count ?? 0, social_counts: counts[data.id] };
  });

export const getQuizSharePreview = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const adminDb = supabaseAdmin as any;
    const { data: quiz, error } = await adminDb
      .from("quizzes")
      .select("id, title, description, category, subject, difficulty, duration_min, is_published, banner_path, share_image_url")
      .eq("id", data.id)
      .eq("is_published", true)
      .maybeSingle();
    if (error) throw error;
    if (!quiz) throw new Error("Quiz not available");
    const { count } = await adminDb.from("questions").select("id", { count: "exact", head: true }).eq("quiz_id", data.id);
    const origin = requestOrigin();
    const banner_url = await signBanner(adminDb, quiz.banner_path);
    return { ...quiz, banner_url, question_count: count ?? 0, share_url: `${origin}/share/quiz/${data.id}`, share_image_url: quiz.share_image_url ?? banner_url ?? `${origin}/api/public/quiz-card/${data.id}.svg` };
  });

export const getQuizAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    // Owner or admin. Creators editing their own quiz must be allowed too.
    await assertCanEditQuiz(context.supabase, context.userId, data.id);
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
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), access_key: z.string().max(80).optional().nullable() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    // Use the admin client to bypass RLS for the initial fetch — private quizzes are
    // filtered out for non-owners by policy, so we must gate on access_key ourselves.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const adminDb = supabaseAdmin as any;
    const { data: quiz, error } = await adminDb
      .from("quizzes")
      .select("*")
      .eq("id", data.id)
      .eq("is_published", true)
      .maybeSingle();
    if (error) throw error;
    if (!quiz) throw new Error("Quiz not found or not published");

    // Private quizzes require the correct access key (unless the requester is the creator/admin).
    if ((quiz as any).visibility === "private") {
      const isOwner = (quiz as any).created_by === context.userId;
      const admin = await isSuperAdmin(context.supabase, context.userId);
      if (!isOwner && !admin) {
        const expected = ((quiz as any).access_key ?? "").trim();
        const provided = (data.access_key ?? "").trim();
        if (!expected) throw new Error("This quiz is private and has no access key set. Ask the creator.");
        if (!provided || provided !== expected) {
          const err: any = new Error("Access key required for this private quiz.");
          err.code = "ACCESS_KEY_REQUIRED";
          throw err;
        }
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
    return { quiz: { ...quiz, banner_url: await signBanner(supabaseAdmin, (quiz as any).banner_path) }, questions: finalQuestions };
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
  allow_comments: z.boolean().default(true),
  allow_likes: z.boolean().default(true),
  allow_sharing: z.boolean().default(true),
  show_leaderboard: z.boolean().default(true),
  banner_path: z.string().max(500).optional().nullable(),
  share_image_url: z.string().max(1000).optional().nullable(),
  total_score: z.number().min(0).max(10000).optional().nullable(),
});

export const uploadQuizBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      quiz_id: z.string().uuid(),
      filename: z.string().max(120),
      content_type: z.string().max(80),
      base64: z.string().min(10),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertCanEditQuiz(context.supabase, context.userId, data.quiz_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const buf = Buffer.from(data.base64, "base64");
    const ext = data.filename.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${data.quiz_id}/banner-${Date.now()}.${ext}`;
    const { error: upErr } = await (supabaseAdmin as any).storage
      .from("quiz-banners")
      .upload(path, buf, { contentType: data.content_type, upsert: true });
    if (upErr) throw upErr;
    await context.supabase.from("quizzes").update({ banner_path: path }).eq("id", data.quiz_id);
    const { data: signed } = await (supabaseAdmin as any).storage.from("quiz-banners").createSignedUrl(path, 60 * 60);
    return { banner_path: path, banner_url: signed?.signedUrl ?? null };
  });


export const createQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => QuizInput.parse(d))
  .handler(async ({ context, data }) => {
    const gate = await canCreate(context.supabase, context.userId);
    if (!gate.ok) throw new Error(gate.reason ?? "Not allowed to create quizzes.");
    // Enforce publish + quota rules for non-admin creators.
    const isAdmin = gate.roles.includes("admin") || gate.roles.includes("super_admin");
    if (!isAdmin && gate.perms) {
      const { count } = await context.supabase
        .from("quizzes").select("id", { count: "exact", head: true }).eq("created_by", context.userId);
      if ((count ?? 0) >= gate.perms.max_quizzes) {
        throw new Error(`Quiz cap reached (${gate.perms.max_quizzes}). Ask an admin to raise your limit.`);
      }
      if (data.is_published && gate.perms.can_publish === false) {
        data = { ...data, is_published: false };
      }
    }
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
    const gate = await assertCanEditQuiz(context.supabase, context.userId, data.id);
    // Non-admin creators cannot flip publish on if their perms forbid it.
    if (!gate.admin && data.patch.is_published === true) {
      const perms = await getCreatorPerms(context.supabase, context.userId);
      if (perms && perms.can_publish === false) {
        data.patch = { ...data.patch, is_published: false };
      }
    }
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
    await assertCanEditQuiz(context.supabase, context.userId, data.id);
    const { error } = await context.supabase.from("quizzes").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const duplicateQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    // The source must be readable (via RLS: admins or owner or published).
    const gate = await canCreate(context.supabase, context.userId);
    if (!gate.ok) throw new Error(gate.reason ?? "Not allowed.");
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

/** Creator dashboard — quizzes owned by the caller (no admin bypass). */
export const listMyQuizzes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: quizzes, error } = await context.supabase
      .from("quizzes")
      .select("*")
      .eq("created_by", context.userId)
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

/** Admin review — list a specific creator's quizzes. */
export const listQuizzesByCreator = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: quizzes } = await (supabaseAdmin as any)
      .from("quizzes")
      .select("id, title, category, difficulty, is_published, visibility, created_at, updated_at, banner_path")
      .eq("created_by", data.user_id)
      .order("created_at", { ascending: false });
    return quizzes ?? [];
  });
