import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/authz.server";

/** Best-effort bulk notification insert. Never throws. */
export async function notifyUsers(
  userIds: string[],
  n: { kind: string; title: string; body?: string; link?: string; image_url?: string },
) {
  try {
    if (!userIds.length) return;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uniq = Array.from(new Set(userIds));
    const rows = uniq.map((user_id) => ({
      user_id,
      kind: n.kind,
      title: n.title,
      body: n.body ?? null,
      link: n.link ?? null,
      image_url: n.image_url ?? null,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      await (supabaseAdmin as any).from("notifications").insert(rows.slice(i, i + 500));
    }
  } catch (e) {
    console.error("[notifyUsers] failed", e);
  }
}

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    // Ensure membership in the global community group so new users land in it.
    const { data: community } = await db.from("groups").select("id").eq("is_community", true).limit(1).maybeSingle();
    if (community?.id) {
      await db.from("group_members").upsert(
        { group_id: community.id, user_id: context.userId, role: "member" },
        { onConflict: "group_id,user_id", ignoreDuplicates: true },
      );
    }

    const { data, error } = await db.from("notifications").select("*")
      .eq("user_id", context.userId).order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    const unread = (data ?? []).filter((n: any) => !n.read_at).length;
    return { notifications: data ?? [], unread_count: unread };
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()).optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    let q = db.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", context.userId).is("read_at", null);
    if (data.ids?.length) q = q.in("id", data.ids);
    const { error } = await q;
    if (error) throw error;
    return { ok: true };
  });

export const adminBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      title: z.string().trim().min(1).max(200),
      body: z.string().trim().max(2000).optional(),
      link: z.string().trim().max(500).optional(),
      image_url: z.string().trim().max(1000).optional(),
      audience: z.enum(["all", "creators", "students"]),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(supabaseAdmin, context.userId);
    const db = supabaseAdmin as any;

    let userIds: string[] = [];
    if (data.audience === "all") {
      const { data: rows } = await db.from("profiles").select("id");
      userIds = (rows ?? []).map((r: any) => r.id);
    } else if (data.audience === "creators") {
      const { data: rows } = await db.from("quizzes").select("created_by");
      userIds = Array.from(new Set((rows ?? []).map((r: any) => r.created_by).filter(Boolean)));
    } else {
      const { data: creatorRows } = await db.from("quizzes").select("created_by");
      const creatorIds = new Set((creatorRows ?? []).map((r: any) => r.created_by));
      const { data: rows } = await db.from("profiles").select("id");
      userIds = (rows ?? []).map((r: any) => r.id).filter((id: string) => !creatorIds.has(id));
    }

    const rows = userIds.map((user_id) => ({
      user_id,
      kind: "broadcast",
      title: data.title,
      body: data.body ?? null,
      link: data.link ?? null,
      image_url: data.image_url ?? null,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from("notifications").insert(rows.slice(i, i + 500));
      if (error) throw error;
    }
    return { ok: true, sent: rows.length };
  });

export const adminNotificationStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(supabaseAdmin, context.userId);
    const db = supabaseAdmin as any;
    const now = Date.now();
    const d7 = new Date(now - 7 * 86400000).toISOString();
    const d30 = new Date(now - 30 * 86400000).toISOString();

    const [{ count: sent7 }, { count: sent30 }, { count: read7 }, { data: recent }] = await Promise.all([
      db.from("notifications").select("id", { count: "exact", head: true }).eq("kind", "broadcast").gte("created_at", d7),
      db.from("notifications").select("id", { count: "exact", head: true }).eq("kind", "broadcast").gte("created_at", d30),
      db.from("notifications").select("id", { count: "exact", head: true }).eq("kind", "broadcast").gte("created_at", d7).not("read_at", "is", null),
      db.from("notifications").select("id, title, body, link, created_at").eq("kind", "broadcast").order("created_at", { ascending: false }).limit(500),
    ]);

    // Dedupe recent broadcasts by title+created minute since one broadcast = many rows.
    const seen = new Map<string, any>();
    for (const r of recent ?? []) {
      const key = `${r.title}|${new Date(r.created_at).toISOString().slice(0, 16)}`;
      if (!seen.has(key)) seen.set(key, { ...r, count: 0 });
      seen.get(key).count += 1;
    }
    return {
      sent_7d: sent7 ?? 0,
      sent_30d: sent30 ?? 0,
      read_rate_7d: sent7 ? Math.round(((read7 ?? 0) / sent7) * 100) : 0,
      recent_broadcasts: Array.from(seen.values()).slice(0, 20),
    };
  });

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ endpoint: z.string().min(1), p256dh: z.string().optional(), auth: z.string().optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { error } = await db.from("push_subscriptions").upsert(
      { user_id: context.userId, endpoint: data.endpoint, p256dh: data.p256dh ?? null, auth: data.auth ?? null },
      { onConflict: "endpoint" },
    );
    if (error) throw error;
    return { ok: true };
  });

export const deletePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ endpoint: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { error } = await db.from("push_subscriptions").delete().eq("user_id", context.userId).eq("endpoint", data.endpoint);
    if (error) throw error;
    return { ok: true };
  });
