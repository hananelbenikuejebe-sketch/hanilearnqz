import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, assertAnalyticsAllowed, checkAiAccess, logAiUsage, reserveAiCredit } from "./authz.server";

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

function bucketByDay(rows: { submitted_at: string | null; score_pct: number | string }[], days = 30) {
  const out: { date: string; attempts: number; avg: number }[] = [];
  const map = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    if (!r.submitted_at) continue;
    const d = new Date(r.submitted_at).toISOString().slice(0, 10);
    const e = map.get(d) ?? { sum: 0, n: 0 };
    e.sum += Number(r.score_pct);
    e.n++;
    map.set(d, e);
  }
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const e = map.get(key);
    out.push({ date: key, attempts: e?.n ?? 0, avg: e ? Math.round((e.sum / e.n) * 10) / 10 : 0 });
  }
  return out;
}

export const getAdminAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const [quizzes, attempts, students] = await Promise.all([
      fetchAllRows((f, t) => context.supabase.from("quizzes").select("id, title, category, subject, is_published, created_at").range(f, t)),
      fetchAllRows((f, t) => context.supabase.from("attempts").select("id, quiz_id, student_id, score_pct, correct_count, total, time_taken_sec, submitted_at").range(f, t)),
      fetchAllRows((f, t) => context.supabase.from("user_roles").select("user_id").eq("role", "student").range(f, t)),
    ]);
    const qById = new Map(quizzes.map((q: any) => [q.id, q]));
    const attemptsArr = attempts;
    const total = attemptsArr.length;
    const avg = total ? attemptsArr.reduce((s, a: any) => s + Number(a.score_pct), 0) / total : 0;
    const passing = attemptsArr.filter((a: any) => Number(a.score_pct) >= 50).length;
    const avgTime = total ? Math.round(attemptsArr.reduce((s, a: any) => s + (a.time_taken_sec ?? 0), 0) / total) : 0;

    // top quizzes
    const perQuiz = new Map<string, { attempts: number; sum: number }>();
    for (const a of attemptsArr) {
      const e = perQuiz.get(a.quiz_id) ?? { attempts: 0, sum: 0 };
      e.attempts++;
      e.sum += Number(a.score_pct);
      perQuiz.set(a.quiz_id, e);
    }
    const topQuizzes = [...perQuiz.entries()]
      .map(([id, v]) => ({ id, title: (qById.get(id) as any)?.title ?? "Untitled", attempts: v.attempts, avg: Math.round((v.sum / v.attempts) * 10) / 10 }))
      .sort((a, b) => b.attempts - a.attempts)
      .slice(0, 5);

    // category breakdown
    const perCat = new Map<string, { attempts: number; sum: number }>();
    for (const a of attemptsArr) {
      const cat = (qById.get(a.quiz_id) as any)?.category ?? "Unknown";
      const e = perCat.get(cat) ?? { attempts: 0, sum: 0 };
      e.attempts++;
      e.sum += Number(a.score_pct);
      perCat.set(cat, e);
    }
    const categories = [...perCat.entries()].map(([category, v]) => ({
      category, attempts: v.attempts, avg: Math.round((v.sum / v.attempts) * 10) / 10,
    })).sort((a, b) => b.attempts - a.attempts);

    return {
      summary: {
        quizzes: quizzes.length,
        published: quizzes.filter((q: any) => q.is_published).length,
        students: students.length,
        attempts: total,
        avg_score: Math.round(avg * 10) / 10,
        pass_rate: total ? Math.round((passing / total) * 100) : 0,
        avg_time_sec: avgTime,
      },
      trend: bucketByDay(attemptsArr as any, 30),
      top_quizzes: topQuizzes,
      categories,
    };
  });

export const getStudentAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ student_id: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    let studentId = context.userId;
    if (data.student_id && data.student_id !== context.userId) {
      const { data: isAdmin } = await context.supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", context.userId)
        .eq("role", "admin")
        .maybeSingle();
      if (!isAdmin) throw new Error("Forbidden");
      studentId = data.student_id;
    }
    const [{ data: attempts }, { data: profile }] = await Promise.all([
      context.supabase
        .from("attempts")
        .select("id, quiz_id, score_pct, correct_count, total, time_taken_sec, submitted_at, quizzes(title, category, subject, difficulty)")
        .eq("student_id", studentId)
        .order("submitted_at", { ascending: false }),
      context.supabase.from("profiles").select("id, full_name, email").eq("id", studentId).maybeSingle(),
    ]);
    const arr = attempts ?? [];
    const total = arr.length;
    const avg = total ? arr.reduce((s, a: any) => s + Number(a.score_pct), 0) / total : 0;
    const best = total ? Math.max(...arr.map((a: any) => Number(a.score_pct))) : 0;
    const passing = arr.filter((a: any) => Number(a.score_pct) >= 50).length;

    const perCat = new Map<string, { n: number; sum: number }>();
    for (const a of arr as any[]) {
      const c = a.quizzes?.category ?? "Unknown";
      const e = perCat.get(c) ?? { n: 0, sum: 0 };
      e.n++; e.sum += Number(a.score_pct);
      perCat.set(c, e);
    }
    const categories = [...perCat.entries()].map(([category, v]) => ({
      category, attempts: v.n, avg: Math.round((v.sum / v.n) * 10) / 10,
    })).sort((a, b) => b.avg - a.avg);

    // recent trend (last 14 attempts ordered by date asc)
    const trend = [...arr].reverse().slice(-14).map((a: any) => ({
      date: a.submitted_at ? new Date(a.submitted_at).toISOString().slice(0, 10) : "",
      score: Number(a.score_pct),
      title: a.quizzes?.title ?? "",
    }));

    return {
      profile,
      summary: {
        attempts: total,
        avg_score: Math.round(avg * 10) / 10,
        best_score: Math.round(best * 10) / 10,
        pass_rate: total ? Math.round((passing / total) * 100) : 0,
      },
      categories,
      trend,
      history: arr,
    };
  });

export const generateStudentAiSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ student_id: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    // AI features may be disabled by admin.
    await checkAiAccess(context.supabase, context.userId, "ai_result");
    const reservation = await reserveAiCredit(context.userId, "ai_result");
    if (!reservation.ok) throw new Error("You have no AI credit left. Top up before generating an AI summary.");
    let studentId = context.userId;
    if (data.student_id && data.student_id !== context.userId) {
      const { data: isAdmin } = await context.supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", context.userId)
        .eq("role", "admin")
        .maybeSingle();
      if (!isAdmin) throw new Error("Forbidden");
      studentId = data.student_id;
    }
    const { data: attempts } = await context.supabase
      .from("attempts")
      .select("score_pct, correct_count, total, time_taken_sec, submitted_at, quizzes(title, category, subject, difficulty)")
      .eq("student_id", studentId)
      .order("submitted_at", { ascending: false })
      .limit(30);
    const arr = (attempts ?? []) as any[];
    if (!arr.length) return { summary: "No attempts yet. Take a quiz to see personalised insights." };

    const compact = arr.map((a) => ({
      quiz: a.quizzes?.title, category: a.quizzes?.category, subject: a.quizzes?.subject,
      difficulty: a.quizzes?.difficulty, score: Number(a.score_pct),
      correct: a.correct_count, total: a.total, seconds: a.time_taken_sec,
      date: a.submitted_at?.slice(0, 10),
    }));
    const { aiChat } = await import("@/lib/ai-provider.server");
    const res = await aiChat("light", [
      { role: "system", content: "You are a concise study coach. Given a student's quiz history, write a 4-6 bullet summary covering: overall progress, strongest area, weakest area, time efficiency, and ONE concrete next step. Use plain Markdown bullets. No preamble." },
      { role: "user", content: `Attempts (newest first):\n${JSON.stringify(compact, null, 2)}` },
    ], { max_tokens: 600 });
    const summary = res.text || "Could not generate a summary.";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await logAiUsage(supabaseAdmin as any, context.userId, {
      feature: "ai_result",
      model: res.model,
      input_tokens: res.input_tokens,
      output_tokens: res.output_tokens,
      credits_cost: reservation.cost,
      meta: { provider: res.provider, fellBack: res.fellBack },
    });
    return { summary };
  });


/** Analytics scoped to a creator's own quizzes. Uses an elevated client but is
 * strictly filtered to quizzes the caller owns, because attempt rows belong to
 * students and are not readable by the creator under RLS. */
export const getMyCreatorAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAnalyticsAllowed(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: quizzes } = await db
      .from("quizzes").select("id, title, category, subject, is_published, created_at")
      .eq("created_by", context.userId);
    const ids = (quizzes ?? []).map((q: any) => q.id);
    let attempts: any[] = [];
    if (ids.length) {
      const { data } = await db
        .from("attempts")
        .select("id, quiz_id, student_id, score_pct, correct_count, total, time_taken_sec, submitted_at")
        .in("quiz_id", ids);
      attempts = data ?? [];
    }
    const qById = new Map(quizzes.map((q: any) => [q.id, q]));
    const total = attempts.length;
    const avg = total ? attempts.reduce((s, a) => s + Number(a.score_pct), 0) / total : 0;
    const passing = attempts.filter((a) => Number(a.score_pct) >= 50).length;
    const perQuiz = new Map<string, { attempts: number; sum: number }>();
    for (const a of attempts) {
      const e = perQuiz.get(a.quiz_id) ?? { attempts: 0, sum: 0 };
      e.attempts++; e.sum += Number(a.score_pct);
      perQuiz.set(a.quiz_id, e);
    }
    const topQuizzes = (quizzes ?? []).map((q: any) => {
      const v = perQuiz.get(q.id) ?? { attempts: 0, sum: 0 };
      return {
        id: q.id, title: q.title ?? "Untitled", published: q.is_published,
        attempts: v.attempts, avg: v.attempts ? Math.round((v.sum / v.attempts) * 10) / 10 : 0,
      };
    }).sort((a: any, b: any) => b.attempts - a.attempts);
    void qById;
    return {
      summary: {
        quizzes: quizzes?.length ?? 0,
        published: (quizzes ?? []).filter((q: any) => q.is_published).length,
        attempts: total,
        unique_students: new Set(attempts.map((a) => a.student_id)).size,
        avg_score: Math.round(avg * 10) / 10,
        pass_rate: total ? Math.round((passing / total) * 100) : 0,
      },
      top_quizzes: topQuizzes.slice(0, 25),
      trend: bucketByDay(attempts as any, 30),
    };
  });

/** Per-quiz analytics for the quiz owner (or an admin). */
export const getQuizAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ quiz_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: quiz } = await db.from("quizzes")
      .select("id, title, created_by, total_score, is_published").eq("id", data.quiz_id).maybeSingle();
    if (!quiz) throw new Error("Quiz not found");
    // Owners always get stats for their own quiz; other viewers need analytics access.
    if (quiz.created_by !== context.userId) await assertAnalyticsAllowed(context.supabase, context.userId);
    const { data: roleRows } = await db.from("user_roles").select("role").eq("user_id", context.userId);
    const isAdmin = (roleRows ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin");
    if (quiz.created_by !== context.userId && !isAdmin) throw new Error("Forbidden");

    const [{ data: attempts }, { data: questions }] = await Promise.all([
      db.from("attempts").select("id, student_id, score_pct, correct_count, total, time_taken_sec, submitted_at, answers")
        .eq("quiz_id", data.quiz_id).order("submitted_at", { ascending: false }),
      db.from("questions").select("id, position, text, type, points").eq("quiz_id", data.quiz_id).order("position"),
    ]);
    const arr = attempts ?? [];
    const total = arr.length;
    const avg = total ? arr.reduce((s: number, a: any) => s + Number(a.score_pct), 0) / total : 0;

    // Per-question difficulty from stored answers.
    const perQuestion = (questions ?? []).map((q: any) => {
      let seen = 0, right = 0;
      for (const a of arr as any[]) {
        const ans = a.answers?.[q.id] ?? a.answers?.[String(q.id)];
        if (ans === undefined || ans === null) continue;
        seen++;
        if (ans?.correct === true || ans?.is_correct === true) right++;
      }
      return {
        id: q.id, position: q.position, type: q.type,
        text: String(q.text ?? "").slice(0, 140),
        seen, correct: right, accuracy: seen ? Math.round((right / seen) * 100) : null,
      };
    });

    return {
      quiz: { id: quiz.id, title: quiz.title, is_published: quiz.is_published },
      summary: {
        attempts: total,
        unique_students: new Set(arr.map((a: any) => a.student_id)).size,
        avg_score: Math.round(avg * 10) / 10,
        best: total ? Math.max(...arr.map((a: any) => Number(a.score_pct))) : 0,
        pass_rate: total ? Math.round((arr.filter((a: any) => Number(a.score_pct) >= 50).length / total) * 100) : 0,
        avg_time_sec: total ? Math.round(arr.reduce((s: number, a: any) => s + (a.time_taken_sec ?? 0), 0) / total) : 0,
      },
      trend: bucketByDay(arr as any, 30),
      questions: perQuestion,
    };
  });


/** Aggregated AI usage — self only unless admin. */
export const getAiUsageSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid().optional(), days: z.number().int().min(1).max(365).default(30) }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    let target = context.userId;
    if (data.user_id && data.user_id !== context.userId) {
      await assertAdmin(context.supabase, context.userId);
      target = data.user_id;
    }
    const since = new Date(Date.now() - data.days * 24 * 3600 * 1000).toISOString();
    const { data: rows } = await context.supabase
      .from("ai_usage_log").select("*").eq("user_id", target).gte("created_at", since);
    const arr = rows ?? [];
    const byFeature: Record<string, { calls: number; credits: number; tokens: number }> = {};
    let credits = 0, tokens = 0;
    for (const r of arr) {
      const f = r.feature ?? "other";
      const cost = Number(r.credits_cost ?? 0);
      const t = (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
      credits += cost; tokens += t;
      byFeature[f] = byFeature[f] ?? { calls: 0, credits: 0, tokens: 0 };
      byFeature[f].calls++; byFeature[f].credits += cost; byFeature[f].tokens += t;
    }
    return { total_calls: arr.length, total_credits: Math.round(credits * 100) / 100, total_tokens: tokens, by_feature: byFeature };
  });

/** Admin AI usage leaderboard — top users by credits over a window. */
export const getAiUsageLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ days: z.number().int().min(1).max(365).default(30) }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - data.days * 24 * 3600 * 1000).toISOString();
    const { data: rows } = await (supabaseAdmin as any).from("ai_usage_log").select("user_id, feature, credits_cost, input_tokens, output_tokens").gte("created_at", since);
    const perUser: Record<string, { calls: number; credits: number; tokens: number }> = {};
    for (const r of rows ?? []) {
      const u = r.user_id ?? "unknown";
      const cost = Number(r.credits_cost ?? 0);
      const t = (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
      perUser[u] = perUser[u] ?? { calls: 0, credits: 0, tokens: 0 };
      perUser[u].calls++; perUser[u].credits += cost; perUser[u].tokens += t;
    }
    const ids = Object.keys(perUser);
    const { data: profs } = ids.length
      ? await (supabaseAdmin as any).from("profiles").select("id, full_name, email, handle").in("id", ids)
      : { data: [] };
    const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
    return Object.entries(perUser)
      .map(([user_id, v]) => ({ user_id, profile: profMap.get(user_id) ?? null, ...v, credits: Math.round(v.credits * 100) / 100 }))
      .sort((a, b) => b.credits - a.credits);
  });
