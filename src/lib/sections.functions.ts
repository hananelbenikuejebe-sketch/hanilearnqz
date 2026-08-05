import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCanEditQuiz } from "./authz.server";

export const listSections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ quiz_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: sections, error } = await context.supabase
      .from("quiz_sections")
      .select("*")
      .eq("quiz_id", data.quiz_id)
      .order("position");
    if (error) throw error;
    const { data: questions } = await context.supabase
      .from("questions")
      .select("id, section_id, points")
      .eq("quiz_id", data.quiz_id);
    const byId: Record<string, { count: number; points: number }> = {};
    let unsectioned = 0;
    for (const q of questions ?? []) {
      const sid = (q as any).section_id as string | null;
      if (!sid) { unsectioned++; continue; }
      if (!byId[sid]) byId[sid] = { count: 0, points: 0 };
      byId[sid].count++;
      byId[sid].points += Number((q as any).points ?? 1);
    }
    return {
      sections: (sections ?? []).map((s: any) => ({
        ...s,
        question_count: byId[s.id]?.count ?? 0,
        computed_points: byId[s.id]?.points ?? 0,
      })),
      unsectioned,
    };
  });

export const upsertSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      quiz_id: z.string().uuid(),
      title: z.string().min(1).max(120),
      instructions: z.string().max(2000).optional().nullable(),
      position: z.number().int().min(0).optional(),
      total_score: z.number().min(0).max(10000).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertCanEditQuiz(context.supabase, context.userId, data.quiz_id);
    if (data.id) {
      const { id, quiz_id: _q, ...patch } = data;
      const { data: row, error } = await context.supabase.from("quiz_sections").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return row;
    }
    let position = data.position;
    if (position == null) {
      const { count } = await context.supabase.from("quiz_sections").select("id", { count: "exact", head: true }).eq("quiz_id", data.quiz_id);
      position = count ?? 0;
    }
    const { data: row, error } = await context.supabase
      .from("quiz_sections")
      .insert({ quiz_id: data.quiz_id, title: data.title, instructions: data.instructions ?? null, position, total_score: data.total_score ?? null })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: section } = await context.supabase.from("quiz_sections").select("quiz_id").eq("id", data.id).maybeSingle();
    if (!section) throw new Error("Section not found");
    await assertCanEditQuiz(context.supabase, context.userId, (section as any).quiz_id);
    await context.supabase.from("questions").update({ section_id: null }).eq("section_id", data.id);
    const { error } = await context.supabase.from("quiz_sections").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const reorderSections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ quiz_id: z.string().uuid(), ids: z.array(z.string().uuid()) }).parse(d))
  .handler(async ({ context, data }) => {
    await assertCanEditQuiz(context.supabase, context.userId, data.quiz_id);
    for (let i = 0; i < data.ids.length; i++) {
      await context.supabase.from("quiz_sections").update({ position: i }).eq("id", data.ids[i]).eq("quiz_id", data.quiz_id);
    }
    return { ok: true };
  });

export const assignQuestionsToSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      quiz_id: z.string().uuid(),
      question_ids: z.array(z.string().uuid()).min(1),
      section_id: z.string().uuid().nullable(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertCanEditQuiz(context.supabase, context.userId, data.quiz_id);
    const { error } = await context.supabase
      .from("questions")
      .update({ section_id: data.section_id })
      .in("id", data.question_ids)
      .eq("quiz_id", data.quiz_id);
    if (error) throw error;
    return { ok: true };
  });

export const autoSectionFromSubsections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ quiz_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertCanEditQuiz(context.supabase, context.userId, data.quiz_id);
    const { data: questions, error } = await context.supabase
      .from("questions")
      .select("id, subsection, position")
      .eq("quiz_id", data.quiz_id)
      .order("position");
    if (error) throw error;

    const order: string[] = [];
    const seen = new Set<string>();
    for (const q of questions ?? []) {
      const label = ((q as any).subsection ?? "").trim() || "General";
      if (!seen.has(label)) { seen.add(label); order.push(label); }
    }
    if (order.length === 0) return { created: 0 };

    // Clear any previous sections for a clean re-run.
    const { data: existing } = await context.supabase.from("quiz_sections").select("id").eq("quiz_id", data.quiz_id);
    if (existing?.length) {
      await context.supabase.from("questions").update({ section_id: null }).in("section_id", existing.map((s: any) => s.id));
      await context.supabase.from("quiz_sections").delete().eq("quiz_id", data.quiz_id);
    }

    const sectionIdByLabel: Record<string, string> = {};
    for (let i = 0; i < order.length; i++) {
      const { data: row, error: insErr } = await context.supabase
        .from("quiz_sections")
        .insert({ quiz_id: data.quiz_id, title: order[i], position: i })
        .select()
        .single();
      if (insErr) throw insErr;
      sectionIdByLabel[order[i]] = row.id;
    }
    for (const q of questions ?? []) {
      const label = ((q as any).subsection ?? "").trim() || "General";
      await context.supabase.from("questions").update({ section_id: sectionIdByLabel[label] }).eq("id", (q as any).id);
    }
    return { created: order.length };
  });

export const setSectionMarks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      section_id: z.string().uuid(),
      total_score: z.number().min(0).max(10000),
      distribute: z.boolean().default(false),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: section } = await context.supabase.from("quiz_sections").select("quiz_id").eq("id", data.section_id).maybeSingle();
    if (!section) throw new Error("Section not found");
    await assertCanEditQuiz(context.supabase, context.userId, (section as any).quiz_id);
    await context.supabase.from("quiz_sections").update({ total_score: data.total_score }).eq("id", data.section_id);
    if (data.distribute) {
      const { data: questions } = await context.supabase.from("questions").select("id").eq("section_id", data.section_id).order("position");
      const n = questions?.length ?? 0;
      if (n > 0) {
        const per = Math.round((data.total_score / n) * 100) / 100;
        for (const q of questions ?? []) {
          await context.supabase.from("questions").update({ points: per }).eq("id", (q as any).id);
        }
      }
    }
    return { ok: true };
  });
