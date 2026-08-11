import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getUserInterestProfile } from "./behavior.server";

/**
 * Lightweight "taste profile" — thin client-facing wrapper around the shared
 * interest profile, kept for anything that only needs the raw tallies.
 */
export const getMyTasteProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const p = await getUserInterestProfile(context.userId);
    const toRanked = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([value, count]) => ({ value, count }));
    return {
      categories: toRanked(p.categoryWeights),
      subjects: toRanked(p.subjectWeights),
      creators: toRanked(p.creatorWeights),
      taken_quiz_ids: p.attemptedQuizIds,
    };
  });

// --- deterministic per-visit shuffle helpers -------------------------------

function hashToUint32(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The "For You" feed: 5–15 quizzes per visit, ranked by the user's interest
 * profile (category/subject/creator/difficulty affinity + recency +
 * virality). Quizzes already attempted are excluded permanently; quizzes
 * already shown are demoted (not removed) so they can resurface lower down.
 * Order is re-shuffled every visit via a per-visit seed while staying
 * interest-tailored (score-weighted jitter, not a pure random shuffle).
 */
export const getForYouFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ seed: z.string().max(64).optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const profile = await getUserInterestProfile(context.userId);
    const visitSeed = data.seed || `${context.userId}:${Date.now()}:${Math.random()}`;

    const { data: quizzes, error: quizError } = await db
      .from("quizzes")
      .select("id, title, description, category, subject, difficulty, duration_min, created_by, created_at, banner_path, banner_url, banner_color, prize_pool_kobo, visibility, is_published")
      .eq("is_published", true)
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(500);
    if (quizError) throw quizError;

    const pool = (quizzes ?? []).filter((q: any) => !profile.attemptedQuizIds.includes(q.id));
    if (!pool.length) return { quizzes: [], seed: visitSeed };

    const ids = pool.map((q: any) => q.id);
    const creatorIds = Array.from(new Set(pool.map((q: any) => q.created_by).filter(Boolean))) as string[];
    const [{ data: likes }, { data: attemptRows }, { data: shares }, { data: creators }] = await Promise.all([
      db.from("quiz_likes").select("quiz_id").in("quiz_id", ids),
      db.from("attempts").select("quiz_id").in("quiz_id", ids),
      db.from("quiz_shares").select("quiz_id").in("quiz_id", ids),
      creatorIds.length
        ? db.from("profiles").select("id, full_name, handle, avatar_url").in("id", creatorIds)
        : Promise.resolve({ data: [] }),
    ]);
    const creatorMap = new Map((creators ?? []).map((p: any) => [p.id, p]));
    const likeCount = new Map<string, number>();
    (likes ?? []).forEach((l: any) => likeCount.set(l.quiz_id, (likeCount.get(l.quiz_id) ?? 0) + 1));
    const attemptCount = new Map<string, number>();
    (attemptRows ?? []).forEach((a: any) => attemptCount.set(a.quiz_id, (attemptCount.get(a.quiz_id) ?? 0) + 1));
    const shareCount = new Map<string, number>();
    (shares ?? []).forEach((s: any) => shareCount.set(s.quiz_id, (shareCount.get(s.quiz_id) ?? 0) + 1));

    const now = Date.now();
    const shownSet = new Set(profile.shownQuizIds);
    const scored = pool.map((q: any) => {
      let score = 0;
      score += (profile.categoryWeights[q.category] ?? 0) * 6;
      score += (profile.subjectWeights[q.subject] ?? 0) * 5;
      score += (profile.creatorWeights[q.created_by] ?? 0) * 7;
      score += (profile.difficultyWeights[q.difficulty] ?? 0) * 2;
      if (profile.followingIds.includes(q.created_by)) score += 10;
      const virality = Math.min(25, (likeCount.get(q.id) ?? 0) * 2 + (attemptCount.get(q.id) ?? 0) + (shareCount.get(q.id) ?? 0) * 3);
      score += virality;
      const ageDays = (now - new Date(q.created_at).getTime()) / 86_400_000;
      score += Math.max(0, 12 - ageDays); // recency boost
      if (shownSet.has(q.id)) score *= 0.35; // demote, don't remove
      // seeded jitter keeps ordering fresh each visit without abandoning relevance
      const rand = mulberry32(hashToUint32(`${visitSeed}:${q.id}`))();
      score += rand * 8;
      return { quiz: q, score } as { quiz: any; score: number };
    });

    scored.sort((a: { score: number }, b: { score: number }) => b.score - a.score);
    const count = Math.min(15, Math.max(5, Math.min(15, scored.length)));
    const picked = scored.slice(0, count).map((s: { quiz: any }) => s.quiz);

    // Persist impressions so future visits demote these (best-effort).
    if (picked.length) {
      db.from("user_events").insert(picked.map((q: any) => ({
        user_id: context.userId, kind: "shown_for_you", quiz_id: q.id, creator_id: q.created_by, category: q.category,
      }))).then(() => {}).catch(() => {});
    }

    return {
      quizzes: picked.map((q: any) => ({ ...q, creator: creatorMap.get(q.created_by) ?? null })),
      seed: visitSeed,
    };
  });
