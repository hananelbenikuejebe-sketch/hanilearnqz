import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSuperAdmin } from "./authz.server";

/** One merged view of every user: role, creator plan, wallet, AI spend, activity. */
export const getUsersOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().max(120).default("") }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const [
      { data: profiles }, { data: roles }, { data: perms }, { data: wallets },
      { data: subs }, { data: usage }, { data: quizzes }, { data: attempts }, { data: txs },
    ] = await Promise.all([
      db.from("profiles").select("id, full_name, email, handle, is_guest, created_at"),
      db.from("user_roles").select("user_id, role"),
      db.from("creator_permissions").select("*"),
      db.from("wallets").select("*"),
      db.from("subscriptions").select("user_id, kind, expires_at, active").eq("kind", "creator_access"),
      db.from("ai_usage_log").select("user_id, feature, credits_cost, created_at").order("created_at", { ascending: false }).limit(4000),
      db.from("quizzes").select("id, created_by, is_published"),
      db.from("attempts").select("id, student_id"),
      db.from("wallet_transactions").select("user_id, kind, amount_kobo, bucket, created_at").order("created_at", { ascending: false }).limit(500),
    ]);

    const rows: Record<string, any> = {};
    for (const p of profiles ?? []) {
      rows[p.id] = {
        user_id: p.id, full_name: p.full_name, email: p.email, handle: p.handle,
        is_guest: p.is_guest, created_at: p.created_at,
        roles: [] as string[], permissions: null as any,
        balance_kobo: 0, ai_credit_kobo: 0, ai_credit_expires_at: null as string | null,
        ai_spent_kobo: 0, ai_calls: 0, quizzes: 0, published: 0, attempts: 0,
        plan_expires_at: null as string | null, plan_active: false,
      };
    }
    for (const r of roles ?? []) rows[r.user_id]?.roles.push(r.role);
    for (const p of perms ?? []) if (rows[p.user_id]) rows[p.user_id].permissions = p;
    for (const w of wallets ?? []) {
      const r = rows[w.user_id]; if (!r) continue;
      r.balance_kobo = w.balance_kobo ?? 0;
      const expired = w.ai_credit_expires_at && new Date(w.ai_credit_expires_at).getTime() < Date.now();
      r.ai_credit_kobo = expired ? 0 : (w.ai_credit_balance_kobo ?? 0);
      r.ai_credit_expires_at = w.ai_credit_expires_at ?? null;
    }
    for (const s of subs ?? []) {
      const r = rows[s.user_id]; if (!r) continue;
      const live = !!s.active && new Date(s.expires_at).getTime() > Date.now();
      if (live && (!r.plan_expires_at || s.expires_at > r.plan_expires_at)) { r.plan_expires_at = s.expires_at; r.plan_active = true; }
    }
    for (const u of usage ?? []) {
      const r = rows[u.user_id]; if (!r) continue;
      r.ai_spent_kobo += Number(u.credits_cost ?? 0);
      r.ai_calls += 1;
    }
    for (const q of quizzes ?? []) {
      const r = rows[q.created_by]; if (!r) continue;
      r.quizzes += 1; if (q.is_published) r.published += 1;
    }
    for (const a of attempts ?? []) { const r = rows[a.student_id]; if (r) r.attempts += 1; }

    let list = Object.values(rows);
    const term = data.q.trim().toLowerCase();
    if (term) {
      list = list.filter((r: any) =>
        [r.full_name, r.email, r.handle, r.user_id].some((v) => String(v ?? "").toLowerCase().includes(term)));
    }
    list.sort((a: any, b: any) => b.ai_spent_kobo - a.ai_spent_kobo || (b.quizzes - a.quizzes));

    const totals = {
      users: (profiles ?? []).length,
      guests: (profiles ?? []).filter((p: any) => p.is_guest).length,
      creators_active: Object.values(rows).filter((r: any) => r.plan_active).length,
      earnings_kobo: Object.values(rows).reduce((s: number, r: any) => s + r.balance_kobo, 0),
      ai_credit_kobo: Object.values(rows).reduce((s: number, r: any) => s + r.ai_credit_kobo, 0),
      ai_spent_kobo: Object.values(rows).reduce((s: number, r: any) => s + r.ai_spent_kobo, 0),
      ai_calls: (usage ?? []).length,
      quizzes: (quizzes ?? []).length,
      attempts: (attempts ?? []).length,
    };

    return { users: list.slice(0, 200), totals, recent_transactions: txs ?? [] };
  });

/** Grant creator access for N months, or forever. */
export const grantCreatorMonths = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    user_id: z.string().uuid(),
    months: z.number().int().min(0).max(120),
    infinite: z.boolean().default(false),
  }).parse(d))
  .handler(async ({ context, data }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: settings } = await db.from("payment_settings").select("*").eq("id", "default").single();

    if (data.months === 0 && !data.infinite) {
      await db.from("subscriptions").update({ active: false }).eq("user_id", data.user_id).eq("kind", "creator_access");
      return { ok: true, revoked: true };
    }
    const expires = data.infinite
      ? new Date("2999-12-31T00:00:00.000Z").toISOString()
      : new Date(Date.now() + data.months * (settings.creator_access_duration_days ?? 30) * 86400000).toISOString();
    await db.from("subscriptions").insert({ user_id: data.user_id, kind: "creator_access", expires_at: expires, active: true });
    await db.from("user_roles").upsert({ user_id: data.user_id, role: "creator" }, { onConflict: "user_id,role" });
    await db.from("creator_permissions").upsert({
      user_id: data.user_id,
      ai_enabled: !!settings.creator_access_includes_ai,
      analytics_enabled: true,
      can_publish: true,
      max_quizzes: settings.creator_access_quiz_cap ?? 50,
      notes: data.infinite ? "Lifetime access granted by admin" : `Granted ${data.months} month(s) by admin`,
    }, { onConflict: "user_id" });
    return { ok: true, expires_at: expires };
  });
