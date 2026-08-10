/**
 * Shared behavioral intelligence layer (server-only).
 *
 * `getUserInterestProfile(userId)` is the single source of truth for "what
 * does this user care about" — it is consumed by the Explore "For You" feed
 * (see taste.functions.ts), and is meant to be reused by other workstreams
 * (notification AI, tailored ads, the tour guide) so everyone ranks/targets
 * off the same signals instead of re-deriving them.
 *
 * Signals blended in, each with a recency-decayed weight:
 *  - attempts        (quiz taken)
 *  - quiz_likes       (liked)
 *  - quiz_shares      (shared)
 *  - quiz_comments    (commented)
 *  - user_follows     (follows the creator)
 *  - user_events      (impression / open events tracked from the client)
 *
 * Usage:
 *   import { getUserInterestProfile } from "@/lib/behavior.server";
 *   const profile = await getUserInterestProfile(userId);
 */

export type UserInterestProfile = {
  userId: string;
  categoryWeights: Record<string, number>;
  subjectWeights: Record<string, number>;
  creatorWeights: Record<string, number>;
  difficultyWeights: Record<string, number>;
  followingIds: string[];
  attemptedQuizIds: string[];
  shownQuizIds: string[];
  topTags: string[];
};

function decay(ageDays: number, halfLifeDays = 21) {
  return Math.pow(0.5, ageDays / halfLifeDays);
}

function bump(map: Record<string, number>, key: string | null | undefined, amount: number) {
  if (!key) return;
  map[key] = (map[key] ?? 0) + amount;
}

/** Builds a decayed, weighted interest profile for a single user. Read-only, safe to call often. */
export async function getUserInterestProfile(userId: string): Promise<UserInterestProfile> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const now = Date.now();

  const [
    { data: attempts },
    { data: likes },
    { data: shares },
    { data: comments },
    { data: follows },
    { data: events },
  ] = await Promise.all([
    db.from("attempts").select("quiz_id, submitted_at").eq("student_id", userId).order("submitted_at", { ascending: false }).limit(300),
    db.from("quiz_likes").select("quiz_id, created_at").eq("user_id", userId).limit(300),
    db.from("quiz_shares").select("quiz_id, created_at").eq("user_id", userId).limit(300),
    db.from("quiz_comments").select("quiz_id, created_at").eq("user_id", userId).limit(300),
    db.from("user_follows").select("following_id").eq("follower_id", userId).limit(1000),
    db.from("user_events").select("quiz_id, creator_id, category, kind, created_at")
      .eq("user_id", userId).in("kind", ["impression", "open", "shown_for_you"])
      .order("created_at", { ascending: false }).limit(500),
  ]);

  const quizIds = Array.from(new Set([
    ...(attempts ?? []).map((a: any) => a.quiz_id),
    ...(likes ?? []).map((l: any) => l.quiz_id),
    ...(shares ?? []).map((s: any) => s.quiz_id),
    ...(comments ?? []).map((c: any) => c.quiz_id),
    ...(events ?? []).map((e: any) => e.quiz_id),
  ].filter(Boolean)));

  const quizzes = quizIds.length
    ? (await db.from("quizzes").select("id, category, subject, created_by, difficulty").in("id", quizIds)).data ?? []
    : [];
  const byId = new Map(quizzes.map((q: any) => [q.id, q]));

  const categoryWeights: Record<string, number> = {};
  const subjectWeights: Record<string, number> = {};
  const creatorWeights: Record<string, number> = {};
  const difficultyWeights: Record<string, number> = {};

  const applyForQuiz = (quizId: string | null | undefined, at: string | null | undefined, base: number) => {
    const q: any = quizId ? byId.get(quizId) : null;
    if (!q) return;
    const ageDays = at ? (now - new Date(at).getTime()) / 86_400_000 : 30;
    const w = base * decay(Math.max(0, ageDays));
    bump(categoryWeights, q.category, w);
    bump(subjectWeights, q.subject, w);
    bump(creatorWeights, q.created_by, w * 1.2); // creator affinity weighted slightly higher
    bump(difficultyWeights, q.difficulty, w);
  };

  for (const a of attempts ?? []) applyForQuiz(a.quiz_id, a.submitted_at, 3);
  for (const l of likes ?? []) applyForQuiz(l.quiz_id, l.created_at, 4);
  for (const s of shares ?? []) applyForQuiz(s.quiz_id, s.created_at, 5);
  for (const c of comments ?? []) applyForQuiz(c.quiz_id, c.created_at, 2);

  const followingIds: string[] = (follows ?? []).map((f: any) => f.following_id).filter(Boolean);
  for (const creatorId of followingIds) bump(creatorWeights, creatorId, 6);

  const shownQuizIds = new Set<string>();
  for (const e of events ?? []) {
    if (e.kind === "impression") applyForQuiz(e.quiz_id, e.created_at, 0.5);
    if (e.kind === "open") applyForQuiz(e.quiz_id, e.created_at, 3);
    if (e.kind === "shown_for_you" && e.quiz_id) shownQuizIds.add(e.quiz_id);
    if (e.category) bump(categoryWeights, e.category, 0.3);
  }

  const topTags = [
    ...Object.entries(categoryWeights).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k),
    ...Object.entries(subjectWeights).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k),
  ].filter(Boolean);

  return {
    userId,
    categoryWeights,
    subjectWeights,
    creatorWeights,
    difficultyWeights,
    followingIds,
    attemptedQuizIds: Array.from(new Set((attempts ?? []).map((a: any) => a.quiz_id).filter(Boolean))),
    shownQuizIds: Array.from(shownQuizIds),
    topTags: Array.from(new Set(topTags)),
  };
}
