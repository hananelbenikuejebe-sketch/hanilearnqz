import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSuperAdmin } from "./authz.server";

export const listGuides = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const admin = await isSuperAdmin(context.supabase, context.userId);
    let q = db.from("support_guides").select("*").order("position").order("created_at");
    if (!admin) q = q.eq("is_published", true);
    const [{ data: guides }, { data: settings }] = await Promise.all([
      q,
      db.from("payment_settings").select("support_whatsapp").eq("id", "default").maybeSingle(),
    ]);
    const { getSupportContact } = await import("./profiles.functions");
    let support_contact: any = null;
    try { support_contact = await getSupportContact(); } catch { support_contact = null; }
    return {
      guides: guides ?? [],
      is_admin: admin,
      support_whatsapp: settings?.support_whatsapp ?? "+2349071829295",
      support_contact,
    };
  });

const GuideInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(160),
  body: z.string().max(8000).default(""),
  link_url: z.string().trim().max(400).optional().nullable(),
  link_label: z.string().trim().max(80).optional().nullable(),
  position: z.number().int().min(0).max(999).default(0),
  is_published: z.boolean().default(true),
});

export const saveGuide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GuideInput.parse(d))
  .handler(async ({ context, data }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const row = { ...data, link_url: data.link_url || null, link_label: data.link_label || null };
    if (data.id) {
      const { error } = await db.from("support_guides").update(row).eq("id", data.id);
      if (error) throw error;
      return { ok: true, id: data.id };
    }
    const { data: created, error } = await db.from("support_guides").insert(row).select().single();
    if (error) throw error;
    return { ok: true, id: created.id };
  });

export const deleteGuide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).from("support_guides").delete().eq("id", data.id);
    return { ok: true };
  });
