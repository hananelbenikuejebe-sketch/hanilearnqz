import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw error;
  if (!data) throw new Error("Forbidden: admin only");
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
    const [{ data: quizzes }, { data: attempts }, { data: students }] = await Promise.all([
      context.supabase.from("quizzes").select("id, title, category, subject, is_published, created_at"),
      context.supabase.from("attempts").select("id, quiz_id, student_id, score_pct, correct_count, total, time_taken_sec, submitted_at"),
      context.supabase.from("user_roles").select("user_id").eq("role", "student"),
    ]);
    const qById = new Map((quizzes ?? []).map((q: any) => [q.id, q]));
    const attemptsArr = attempts ?? [];
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
        quizzes: quizzes?.length ?? 0,
        published: quizzes?.filter((q: any) => q.is_published).length ?? 0,
        students: students?.length ?? 0,
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
      const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
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
    let studentId = context.userId;
    if (data.student_id && data.student_id !== context.userId) {
      const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
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

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY missing");
    const compact = arr.map((a) => ({
      quiz: a.quizzes?.title, category: a.quizzes?.category, subject: a.quizzes?.subject,
      difficulty: a.quizzes?.difficulty, score: Number(a.score_pct),
      correct: a.correct_count, total: a.total, seconds: a.time_taken_sec,
      date: a.submitted_at?.slice(0, 10),
    }));
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a concise study coach. Given a student's quiz history, write a 4-6 bullet summary covering: overall progress, strongest area, weakest area, time efficiency, and ONE concrete next step. Use plain Markdown bullets. No preamble." },
          { role: "user", content: `Attempts (newest first):\n${JSON.stringify(compact, null, 2)}` },
        ],
      }),
    });
    if (!res.ok) {
      if (res.status === 429) throw new Error("AI rate limit. Try again in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted. Add credits to continue.");
      throw new Error(`AI summary failed (${res.status})`);
    }
    const json = await res.json();
    const summary = json.choices?.[0]?.message?.content ?? "Could not generate a summary.";
    return { summary };
  });
