import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Lightweight "taste profile" used by the Explore → Relevance feed.
 * Returns the categories, subjects and creators this user has engaged with
 * recently, so the client can rank similar quizzes higher without shipping
 * every attempt row to the browser.
 */
export const getMyTasteProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const [{ data: attempts }, { data: likes }] = await Promise.all([
      db.from("attempts").select("quiz_id, submitted_at").eq("student_id", context.userId).order("submitted_at", { ascending: false }).limit(40),
      db.from("quiz_likes").select("quiz_id").eq("user_id", context.userId).limit(40),
    ]);

    const quizIds = Array.from(new Set([...(attempts ?? []).map((a: any) => a.quiz_id), ...(likes ?? []).map((l: any) => l.quiz_id)].filter(Boolean)));
    if (!quizIds.length) return { categories: [], subjects: [], creators: [], taken_quiz_ids: [] };

    const { data: quizzes } = await db.from("quizzes").select("id, category, subject, created_by").in("id", quizIds);

    const tally = (rows: Array<any>, key: string) => {
      const m = new Map<string, number>();
      for (const r of rows ?? []) {
        const v = r?.[key];
        if (v) m.set(v, (m.get(v) ?? 0) + 1);
      }
      return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([value, count]) => ({ value, count }));
    };

    return {
      categories: tally(quizzes ?? [], "category"),
      subjects: tally(quizzes ?? [], "subject"),
      creators: tally(quizzes ?? [], "created_by"),
      taken_quiz_ids: (attempts ?? []).map((a: any) => a.quiz_id),
    };
  });
