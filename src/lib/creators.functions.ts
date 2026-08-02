import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSuperAdmin, canCreate } from "./authz.server";

export const getMyCreatorStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const gate = await canCreate(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await (supabaseAdmin as any)
      .from("quizzes").select("id", { count: "exact", head: true }).eq("created_by", context.userId);
    return {
      can_create: gate.ok,
      reason: gate.reason ?? null,
      roles: gate.roles,
      permissions: gate.perms ?? null,
      effective: gate.effective ?? null,
      quizzes_created: count ?? 0,
      is_super_admin: gate.roles.includes("super_admin") || gate.roles.includes("admin"),
    };
  });


export const listCreators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: perms }, { data: roles }, { data: profiles }] = await Promise.all([
      (supabaseAdmin as any).from("creator_permissions").select("*"),
      (supabaseAdmin as any).from("user_roles").select("user_id, role"),
      (supabaseAdmin as any).from("profiles").select("id, full_name, email"),
    ]);
    const byId: Record<string, any> = {};
    (profiles ?? []).forEach((p: any) => { byId[p.id] = { user_id: p.id, full_name: p.full_name, email: p.email, roles: [], permissions: null }; });
    (roles ?? []).forEach((r: any) => { if (byId[r.user_id]) byId[r.user_id].roles.push(r.role); });
    (perms ?? []).forEach((p: any) => { if (byId[p.user_id]) byId[p.user_id].permissions = p; });
    return Object.values(byId).sort((a: any, b: any) => (a.full_name || "").localeCompare(b.full_name || ""));
  });

export const grantCreator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      user_id: z.string().uuid(),
      ai_enabled: z.boolean().default(false),
      analytics_enabled: z.boolean().default(true),
      can_publish: z.boolean().default(true),
      max_quizzes: z.number().int().min(0).max(1000).default(10),
      notes: z.string().max(500).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).from("user_roles").upsert(
      { user_id: data.user_id, role: "creator" }, { onConflict: "user_id,role" },
    );
    const { error } = await (supabaseAdmin as any).from("creator_permissions").upsert({
      user_id: data.user_id,
      ai_enabled: data.ai_enabled,
      analytics_enabled: data.analytics_enabled,
      can_publish: data.can_publish,
      max_quizzes: data.max_quizzes,
      notes: data.notes,
      granted_by: context.userId,
    }, { onConflict: "user_id" });
    if (error) throw error;
    return { ok: true };
  });

export const revokeCreator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).from("creator_permissions").delete().eq("user_id", data.user_id);
    await (supabaseAdmin as any).from("user_roles").delete().eq("user_id", data.user_id).eq("role", "creator");
    return { ok: true };
  });
