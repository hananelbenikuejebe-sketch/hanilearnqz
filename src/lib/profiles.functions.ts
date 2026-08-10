import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Public profile view — safe fields only. */
export const getPublicProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const [{ data: profile }, { data: quizzes }, { data: attempts }, { count: followers }, { count: following }, { data: iFollow }, { data: roles }, { data: permissions }] = await Promise.all([
      db.from("profiles").select("id, full_name, handle, avatar_url, bio, is_guest, created_at, whatsapp_number, school, level, social_links").eq("id", data.user_id).maybeSingle(),
      db.from("quizzes")
        .select("id, title, category, difficulty, is_published, visibility, created_at, banner_path")
        .eq("created_by", data.user_id).eq("is_published", true).eq("visibility", "public")
        .order("created_at", { ascending: false }),
      db.from("attempts").select("quiz_id, quizzes(id, title)").eq("student_id", data.user_id).order("submitted_at", { ascending: false }).limit(20),
      db.from("user_follows").select("follower_id", { count: "exact", head: true }).eq("following_id", data.user_id),
      db.from("user_follows").select("following_id", { count: "exact", head: true }).eq("follower_id", data.user_id),
      db.from("user_follows").select("follower_id").eq("follower_id", context.userId).eq("following_id", data.user_id).maybeSingle(),
      db.from("user_roles").select("role").eq("user_id", data.user_id),
      db.from("creator_permissions").select("user_id").eq("user_id", data.user_id).maybeSingle(),
    ]);
    if (!profile) throw new Error("Profile not found");
    return {
      profile,
      quizzes: quizzes ?? [],
      attempts_count: (attempts ?? []).length,
      unique_quizzes_taken: new Set((attempts ?? []).map((a: any) => a.quiz_id)).size,
      followers: followers ?? 0,
      following: following ?? 0,
      i_follow: !!iFollow,
      is_self: context.userId === data.user_id,
      badges: [
        permissions ? "Pro creator" : null,
        (roles ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin") ? "Platform admin" : null,
        (quizzes ?? []).length > 0 ? "Quiz creator" : null,
        (quizzes ?? []).length >= 10 ? "10 quiz milestone" : null,
        (attempts ?? []).length > 0 ? "Quiz learner" : null,
        new Set((attempts ?? []).map((a: any) => a.quiz_id)).size >= 10 ? "10 quizzes taken" : null,
      ].filter(Boolean),
    };
  });

export const getFollowingIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("user_follows").select("following_id").eq("follower_id", context.userId);
    if (error) throw error;
    return (data ?? []).map((r: any) => r.following_id);
  });

export const searchProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().max(120).default("") }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const term = data.q.trim();
    if (term.length < 1) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const pattern = `%${term.replace(/[%_]/g, "")}%`;
    const { data: rows } = await db.from("profiles")
      .select("id, full_name, handle, avatar_url, is_guest")
      .or(`full_name.ilike.${pattern},handle.ilike.${pattern},email.ilike.${pattern}`)
      .limit(20);
    return rows ?? [];
  });

export const toggleFollow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    if (data.user_id === context.userId) throw new Error("You cannot follow yourself.");
    const { data: existing } = await context.supabase
      .from("user_follows").select("follower_id")
      .eq("follower_id", context.userId).eq("following_id", data.user_id).maybeSingle();
    if (existing) {
      await context.supabase.from("user_follows").delete()
        .eq("follower_id", context.userId).eq("following_id", data.user_id);
      return { following: false };
    }
    await context.supabase.from("user_follows").insert({ follower_id: context.userId, following_id: data.user_id });
    return { following: true };
  });

/* --------------------------- self-serve profile editing --------------------------- */

const socialLinksSchema = z.object({
  twitter: z.string().trim().max(300).optional().or(z.literal("")),
  instagram: z.string().trim().max(300).optional().or(z.literal("")),
  facebook: z.string().trim().max(300).optional().or(z.literal("")),
  tiktok: z.string().trim().max(300).optional().or(z.literal("")),
  website: z.string().trim().max(300).optional().or(z.literal("")),
}).partial();

/** Normalizes a Nigerian-style phone number to E.164-ish digits for wa.me links. */
export function normalizeWhatsappNumber(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = "234" + digits.slice(1);
  else if (digits.length === 10) digits = "234" + digits;
  return digits;
}

/** Lets a signed-in user edit their own public profile fields. */
export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    bio: z.string().trim().max(500).optional().nullable(),
    whatsapp_number: z.string().trim().max(30).optional().nullable(),
    school: z.string().trim().max(120).optional().nullable(),
    level: z.string().trim().max(60).optional().nullable(),
    social_links: socialLinksSchema.optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const patch: Record<string, unknown> = {};
    if (data.bio !== undefined) patch.bio = data.bio || null;
    if (data.whatsapp_number !== undefined) patch.whatsapp_number = normalizeWhatsappNumber(data.whatsapp_number);
    if (data.school !== undefined) patch.school = data.school || null;
    if (data.level !== undefined) patch.level = data.level || null;
    if (data.social_links !== undefined) {
      patch.social_links = Object.fromEntries(Object.entries(data.social_links).filter(([, v]) => !!v));
    }
    const { data: row, error } = await db.from("profiles").update(patch).eq("id", context.userId).select().single();
    if (error) throw error;
    return row;
  });

/**
 * Resolves the platform admin used for in-app support DMs everywhere the app
 * used to link out to WhatsApp: the earliest user with role 'admin' in
 * user_roles (same convention as src/lib/platform-wallet.server.ts).
 */
export const getSupportContact = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: roleRow } = await db.from("user_roles").select("user_id, created_at")
      .eq("role", "admin").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!roleRow?.user_id) {
      return { user_id: null as string | null, name: "Support", whatsapp: null as string | null };
    }
    const [{ data: profile }, { data: settings }] = await Promise.all([
      db.from("profiles").select("id, full_name, handle").eq("id", roleRow.user_id).maybeSingle(),
      db.from("payment_settings").select("support_whatsapp").eq("id", "default").maybeSingle(),
    ]);
    return {
      user_id: roleRow.user_id as string,
      name: profile?.full_name || profile?.handle || "Admin",
      whatsapp: settings?.support_whatsapp ?? null,
    };
  });
