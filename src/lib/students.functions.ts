import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./authz.server";

export const listStudents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    q: z.string().max(120).optional(),
    include_guests: z.boolean().default(true),
  }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    // Use admin client so we see ALL profiles regardless of RLS, including guests.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    let query = db.from("profiles").select("id, full_name, email, handle, is_guest, created_at").order("created_at", { ascending: false });
    if (!data.include_guests) query = query.eq("is_guest", false);
    if (data.q?.trim()) {
      const pattern = `%${data.q.trim().replace(/[%_]/g, "")}%`;
      query = query.or(`full_name.ilike.${pattern},email.ilike.${pattern},handle.ilike.${pattern}`);
    }
    const { data: profiles } = await query.limit(500);
    const ids = (profiles ?? []).map((p: any) => p.id);
    let attempts: any[] = [];
    if (ids.length) {
      const { data } = await db.from("attempts").select("student_id, score_pct").in("student_id", ids);
      attempts = data ?? [];
    }
    const stats = new Map<string, { count: number; avg: number }>();
    attempts.forEach((a: any) => {
      const s = stats.get(a.student_id) ?? { count: 0, avg: 0 };
      s.avg = (s.avg * s.count + Number(a.score_pct)) / (s.count + 1);
      s.count++;
      stats.set(a.student_id, s);
    });
    return (profiles ?? []).map((p: any) => ({
      ...p,
      attempts: stats.get(p.id)?.count ?? 0,
      avg_score: Math.round((stats.get(p.id)?.avg ?? 0) * 100) / 100,
    }));
  });


export const addStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      email: z.string().email().max(255),
      full_name: z.string().min(1).max(120),
      password: z.string().min(8).max(72),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error) throw error;
    // trigger will auto-create profile + student role (since admin already exists)
    return { id: created.user?.id, email: data.email };
  });

export const bulkImportStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      students: z.array(z.object({
        email: z.string().email().max(255),
        full_name: z.string().min(1).max(120),
        password: z.string().min(8).max(72),
      })).min(1).max(500),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const results: { email: string; ok: boolean; error?: string }[] = [];
    for (const s of data.students) {
      const { error } = await supabaseAdmin.auth.admin.createUser({
        email: s.email, password: s.password, email_confirm: true,
        user_metadata: { full_name: s.full_name },
      });
      results.push({ email: s.email, ok: !error, error: error?.message });
    }
    return { results };
  });
