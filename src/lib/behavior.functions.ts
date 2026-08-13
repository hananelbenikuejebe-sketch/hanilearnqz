import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSuperAdmin } from "./authz.server";
import { getUserInterestProfile } from "./behavior.server";

/** Fetch every row of a query in pages of 1000 to bypass PostgREST's implicit row cap. */
async function fetchAllRows<T = any>(build: (from: number, to: number) => any, pageSize = 1000): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

const eventSchema = z.object({
  kind: z.enum(["impression", "open", "shown_for_you"]),
  quiz_id: z.string().uuid().optional().nullable(),
  creator_id: z.string().uuid().optional().nullable(),
  category: z.string().max(80).optional().nullable(),
  meta: z.record(z.any()).optional(),
});

/**
 * Cheap, batched behavior tracking used by Explore ("For You" impressions and
 * opens). The client debounces/batches calls so this fires at most a couple
 * of times per page visit, never per-card. Best-effort: never throws to the
 * caller so tracking failures cannot break the browsing experience.
 */
export const trackEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ events: z.array(eventSchema).min(1).max(50) }).parse(d))
  .handler(async ({ context, data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const db = supabaseAdmin as any;
      const rows = data.events.map((e) => ({
        user_id: context.userId,
        kind: e.kind,
        quiz_id: e.quiz_id ?? null,
        creator_id: e.creator_id ?? null,
        category: e.category ?? null,
        meta: e.meta ?? {},
      }));
      await db.from("user_events").insert(rows);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

/**
 * Admin-only rollup of the behavior/interest layer for the Users & access
 * page's "Behavior & interests" panel: top quizzes, top categories, most
 * active users (with their derived interest tags), retention buckets and AI
 * usage. No hardcoded row caps — everything is paged with fetchAllRows.
 */
export const getBehaviorInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const [quizzes, attempts, likes, shares, comments, events, aiUsage, profiles] = await Promise.all([
      fetchAllRows((f, t) => db.from("quizzes").select("id, title, category, created_by, created_at").range(f, t)),
      fetchAllRows((f, t) => db.from("attempts").select("id, quiz_id, student_id, submitted_at").range(f, t)),
      fetchAllRows((f, t) => db.from("quiz_likes").select("quiz_id, user_id").range(f, t)),
      fetchAllRows((f, t) => db.from("quiz_shares").select("quiz_id, user_id").range(f, t)),
      fetchAllRows((f, t) => db.from("quiz_comments").select("quiz_id, user_id").range(f, t)),
      fetchAllRows((f, t) => db.from("user_events").select("user_id, kind, quiz_id, category, created_at").range(f, t)),
      fetchAllRows((f, t) => db.from("ai_usage_log").select("user_id, feature, credits_cost, created_at").range(f, t)),
      fetchAllRows((f, t) => db.from("profiles").select("id, full_name, handle, is_guest").range(f, t)),
    ]);

    const qById = new Map(quizzes.map((q: any) => [q.id, q]));
    const profileById = new Map(profiles.map((p: any) => [p.id, p]));

    // Top quizzes by combined engagement.
    const engagement = new Map<string, { attempts: number; likes: number; shares: number; comments: number }>();
    const bumpEng = (id: string | null, key: "attempts" | "likes" | "shares" | "comments") => {
      if (!id) return;
      const e = engagement.get(id) ?? { attempts: 0, likes: 0, shares: 0, comments: 0 };
      e[key]++;
      engagement.set(id, e);
    };
    attempts.forEach((a: any) => bumpEng(a.quiz_id, "attempts"));
    likes.forEach((l: any) => bumpEng(l.quiz_id, "likes"));
    shares.forEach((s: any) => bumpEng(s.quiz_id, "shares"));
    comments.forEach((c: any) => bumpEng(c.quiz_id, "comments"));
    const topQuizzes = [...engagement.entries()]
      .map(([id, e]) => ({ id, title: (qById.get(id) as any)?.title ?? "Untitled", category: (qById.get(id) as any)?.category ?? "Unknown", ...e, score: e.attempts + e.likes * 2 + e.shares * 3 + e.comments }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    // Top categories by attempts.
    const perCat = new Map<string, number>();
    attempts.forEach((a: any) => {
      const cat = (qById.get(a.quiz_id) as any)?.category ?? "Unknown";
      perCat.set(cat, (perCat.get(cat) ?? 0) + 1);
    });
    const topCategories = [...perCat.entries()].map(([category, attempts]) => ({ category, attempts })).sort((a, b) => b.attempts - a.attempts).slice(0, 12);

    // Most active users by combined signal count + last active timestamp.
    const activity = new Map<string, { events: number; attempts: number; last: string | null }>();
    const bumpActivity = (id: string | null, key: "events" | "attempts", at?: string | null) => {
      if (!id) return;
      const e = activity.get(id) ?? { events: 0, attempts: 0, last: null };
      e[key]++;
      if (at && (!e.last || at > e.last)) e.last = at;
      activity.set(id, e);
    };
    events.forEach((e: any) => bumpActivity(e.user_id, "events", e.created_at));
    attempts.forEach((a: any) => bumpActivity(a.student_id, "attempts", a.submitted_at));

    const now = Date.now();
    const mostActiveIds = [...activity.entries()]
      .map(([id, a]) => ({ id, ...a, score: a.events + a.attempts * 3 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((a) => a.id);

    const interestByUser = await Promise.all(mostActiveIds.map((id) => getUserInterestProfile(id)));
    const mostActiveUsers = mostActiveIds.map((id, i) => {
      const a = activity.get(id)!;
      const p: any = profileById.get(id);
      const daysSince = a.last ? Math.floor((now - new Date(a.last).getTime()) / 86_400_000) : null;
      return {
        user_id: id,
        name: p?.full_name || p?.handle || "Unknown",
        is_guest: !!p?.is_guest,
        events: a.events,
        attempts: a.attempts,
        last_active: a.last,
        days_since_active: daysSince,
        interest_tags: interestByUser[i]?.topTags ?? [],
      };
    });

    // Retention buckets across every user with any activity.
    let active7 = 0, active30 = 0, dormant = 0;
    for (const [, a] of activity) {
      if (!a.last) { dormant++; continue; }
      const days = (now - new Date(a.last).getTime()) / 86_400_000;
      if (days <= 7) active7++;
      else if (days <= 30) active30++;
      else dormant++;
    }

    const aiTotal = aiUsage.reduce((s: number, u: any) => s + Number(u.credits_cost ?? 0), 0);
    const aiByFeature = new Map<string, number>();
    aiUsage.forEach((u: any) => aiByFeature.set(u.feature, (aiByFeature.get(u.feature) ?? 0) + 1));

    return {
      top_quizzes: topQuizzes,
      top_categories: topCategories,
      most_active_users: mostActiveUsers,
      retention: { active_7d: active7, active_30d: active30, dormant },
      ai_usage: {
        total_calls: aiUsage.length,
        total_cost_kobo: aiTotal,
        by_feature: [...aiByFeature.entries()].map(([feature, calls]) => ({ feature, calls })).sort((a, b) => b.calls - a.calls),
      },
    };
  });

/**
 * Full analytics for a single account, used by the per-user analytics page so
 * super admins never have to scroll the platform-wide dashboard to answer
 * "what is this person actually doing?".
 */
export const getUserAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const uid = data.user_id;

    const [profile, wallet, quizzes, attempts, events, ai, tx, purchases] = await Promise.all([
      db.from("profiles").select("id, full_name, handle, email, is_guest, school, level, avatar_url, created_at").eq("id", uid).maybeSingle(),
      db.from("wallets").select("balance_kobo, ai_credit_balance_kobo, ai_credit_expires_at").eq("user_id", uid).maybeSingle(),
      fetchAllRows((f, t) => db.from("quizzes").select("id, title, category, is_published, created_at, price_kobo").eq("created_by", uid).range(f, t)),
      fetchAllRows((f, t) => db.from("attempts").select("id, quiz_id, score_pct, points_awarded, points_max, submitted_at").eq("student_id", uid).range(f, t)),
      fetchAllRows((f, t) => db.from("user_events").select("kind, category, created_at").eq("user_id", uid).range(f, t)),
      fetchAllRows((f, t) => db.from("ai_usage_log").select("feature, model, provider, credits_cost, created_at").eq("user_id", uid).range(f, t)),
      fetchAllRows((f, t) => db.from("wallet_transactions").select("kind, bucket, amount_kobo, status, created_at").eq("user_id", uid).range(f, t)),
      fetchAllRows((f, t) => db.from("quiz_purchases").select("quiz_id, price_kobo, created_at").eq("user_id", uid).range(f, t)),
    ]);

    const interests = await getUserInterestProfile(uid).catch(() => null);

    const perFeature = new Map<string, { calls: number; cost_kobo: number }>();
    for (const row of ai as any[]) {
      const e = perFeature.get(row.feature) ?? { calls: 0, cost_kobo: 0 };
      e.calls++;
      e.cost_kobo += Math.round(Number(row.credits_cost ?? 0));
      perFeature.set(row.feature, e);
    }
    const scores = (attempts as any[]).map((a) => Number(a.score_pct ?? 0));
    const lastActive = [...(events as any[]).map((e) => e.created_at), ...(attempts as any[]).map((a) => a.submitted_at)]
      .filter(Boolean).sort().at(-1) ?? null;

    return {
      profile: profile.data ?? null,
      wallet: wallet.data ?? null,
      totals: {
        quizzes: quizzes.length,
        published: (quizzes as any[]).filter((q) => q.is_published).length,
        attempts: attempts.length,
        avg_score: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
        events: events.length,
        ai_calls: ai.length,
        ai_spend_kobo: (ai as any[]).reduce((n, r) => n + Math.round(Number(r.credits_cost ?? 0)), 0),
        purchases: purchases.length,
        purchase_spend_kobo: (purchases as any[]).reduce((n, r) => n + Number(r.price_kobo ?? 0), 0),
        last_active: lastActive,
      },
      interests,
      ai_by_feature: [...perFeature.entries()].map(([feature, v]) => ({ feature, ...v })).sort((a, b) => b.cost_kobo - a.cost_kobo),
      recent_ai: (ai as any[]).slice(-20).reverse(),
      recent_transactions: (tx as any[]).slice(-20).reverse(),
      quizzes: (quizzes as any[]).slice(0, 30),
      recent_attempts: (attempts as any[]).slice(-20).reverse(),
    };
  });
