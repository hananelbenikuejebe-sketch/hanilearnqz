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

export const listStudents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: roles } = await context.supabase.from("user_roles").select("user_id").eq("role", "student");
    const ids = (roles ?? []).map((r: any) => r.user_id);
    if (!ids.length) return [];
    const { data: profiles } = await context.supabase
      .from("profiles").select("id, full_name, email, created_at").in("id", ids);
    const { data: attempts } = await context.supabase
      .from("attempts").select("student_id, score_pct").in("student_id", ids);
    const stats = new Map<string, { count: number; avg: number }>();
    (attempts ?? []).forEach((a: any) => {
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
