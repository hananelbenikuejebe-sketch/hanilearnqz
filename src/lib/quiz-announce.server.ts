/**
 * Publish-time audience notifications (server-only).
 *
 * When a creator publishes a quiz we ping the people most likely to come back
 * for it: their followers, and anyone who took one of their earlier quizzes.
 * Best-effort — never blocks or fails the publish itself.
 */

export async function announceQuizPublished(quizId: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const { data: quiz } = await db
      .from("quizzes")
      .select("id, title, category, created_by, is_published, visibility")
      .eq("id", quizId)
      .maybeSingle();
    if (!quiz?.is_published || quiz.visibility !== "public" || !quiz.created_by) return;

    const [{ data: followers }, { data: myQuizzes }, { data: creator }] = await Promise.all([
      db.from("user_follows").select("follower_id").eq("following_id", quiz.created_by).limit(500),
      db.from("quizzes").select("id").eq("created_by", quiz.created_by).limit(200),
      db.from("profiles").select("full_name, handle").eq("id", quiz.created_by).maybeSingle(),
    ]);

    const priorIds = (myQuizzes ?? []).map((q: any) => q.id).filter((id: string) => id !== quizId);
    let pastTakers: Array<string> = [];
    if (priorIds.length) {
      const { data: attempts } = await db
        .from("attempts")
        .select("student_id")
        .in("quiz_id", priorIds.slice(0, 100))
        .order("submitted_at", { ascending: false })
        .limit(600);
      pastTakers = (attempts ?? []).map((a: any) => a.student_id);
    }

    const audience = Array.from(
      new Set([...(followers ?? []).map((f: any) => f.follower_id), ...pastTakers].filter(Boolean)),
    ).filter((id) => id !== quiz.created_by);
    if (!audience.length) return;

    const name = creator?.full_name || (creator?.handle ? `@${creator.handle}` : "A creator you follow");
    const { notifyUsers } = await import("./notifications.functions");
    await notifyUsers(audience.slice(0, 500), {
      kind: "new_quiz",
      title: `${name} just published "${quiz.title}"`,
      body: `New ${quiz.category ?? "quiz"} — be one of the first to take it and top the leaderboard.`,
      link: `/quiz/${quiz.id}`,
    });
  } catch (err) {
    console.error("[announceQuizPublished] skipped:", err);
  }
}
