import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canCreate, isSuperAdmin } from "./authz.server";

export const listPublishedExams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("exams")
      .select("*, exam_quizzes(quiz_id)")
      .eq("is_published", true)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((e: any) => ({ ...e, quiz_count: e.exam_quizzes?.length ?? 0 }));
  });

export const listMyExams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("exams")
      .select("*, exam_quizzes(quiz_id)")
      .eq("created_by", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((e: any) => ({ ...e, quiz_count: e.exam_quizzes?.length ?? 0 }));
  });

export const getExam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const adminDb = supabaseAdmin as any;
    const { data: exam, error } = await adminDb
      .from("exams")
      .select("*, exam_quizzes(position, quizzes(id, title, category, difficulty, duration_min, description, banner_path, price_kobo, visibility, is_published))")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!exam) throw new Error("Exam not found");
    // Gate unpublished exams to owner/admin only.
    if (!exam.is_published) {
      const superA = await isSuperAdmin(context.supabase, context.userId);
      if (exam.created_by !== context.userId && !superA) throw new Error("Exam not published");
    }
    return exam;
  });

export const createExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      title: z.string().min(1).max(120),
      description: z.string().max(1000).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const gate = await canCreate(context.supabase, context.userId);
    if (!gate.ok) throw new Error(gate.reason ?? "Forbidden");
    const { data: row, error } = await context.supabase
      .from("exams")
      .insert({ ...data, created_by: context.userId })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const setExamQuizzes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      exam_id: z.string().uuid(),
      quiz_ids: z.array(z.string().uuid()).max(50),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: exam } = await context.supabase.from("exams").select("created_by").eq("id", data.exam_id).maybeSingle();
    if (!exam) throw new Error("Exam not found");
    const superA = await isSuperAdmin(context.supabase, context.userId);
    if (exam.created_by !== context.userId && !superA) throw new Error("Forbidden");
    await context.supabase.from("exam_quizzes").delete().eq("exam_id", data.exam_id);
    if (data.quiz_ids.length) {
      await context.supabase.from("exam_quizzes").insert(
        data.quiz_ids.map((qid, i) => ({ exam_id: data.exam_id, quiz_id: qid, position: i })),
      );
    }
    return { ok: true };
  });

export const publishExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), is_published: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("exams").update({ is_published: data.is_published }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
