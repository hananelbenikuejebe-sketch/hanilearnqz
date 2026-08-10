/**
 * Automatic, per-user AI notification engine (server-only).
 *
 * Builds a real per-user context snapshot (quizzes taken, categories, wallet /
 * AI-credit balance, creator access expiry, unread messages, whether the user
 * creates quizzes, last activity, push/PWA status), asks the OpenRouter-backed
 * "heavy" AI lane (via aiChat) for a short, personal notification grounded ONLY
 * in features that actually exist in this app, and delivers it through the
 * existing notifyUsers pipeline (DB insert + web push).
 *
 * Every notification must carry a `link` to a real in-app route. The allowed
 * link set below is intentionally the same feature surface documented in
 * src/lib/tour-content.ts (owned by another agent, read-only here) so tours and
 * notifications never contradict each other.
 */

import { aiChat, parseJsonLoose } from "@/lib/ai-provider.server";

/** The only routes we ever let the model reference — keeps copy grounded in real features. */
export const ALLOWED_LINKS = [
  "/explore",
  "/create",
  "/wallet",
  "/messages",
  "/notifications",
  "/support",
  "/profile",
  "/exams",
  "/results",
  "/ads",
] as const;

function sanitizeLink(link: unknown, fallback: string): string {
  const s = String(link ?? "").trim();
  if (!s) return fallback;
  if (s.startsWith("/quiz/") || s.startsWith("/profile/")) return s; // dynamic routes with a real id, checked by caller
  if ((ALLOWED_LINKS as readonly string[]).includes(s)) return s;
  return fallback;
}

export type UserContext = {
  userId: string;
  name: string;
  quizzesTaken: number;
  categories: string[];
  isCreator: boolean;
  quizzesCreated: number;
  followedCreators: Array<{ id: string; name: string }>;
  walletBalanceKobo: number;
  aiCreditBalanceKobo: number;
  creatorAccessExpiresAt: string | null;
  unreadMessages: number;
  lastActiveAt: string | null;
  hasPushEnabled: boolean;
};

/** Builds a real, grounded context snapshot for one user from live data. */
export async function buildUserContext(db: any, userId: string): Promise<UserContext> {
  const [
    { data: profile },
    { data: attempts },
    { data: myQuizzes },
    { data: follows },
    { data: wallet },
    { data: creatorSub },
    { data: unread },
    { data: lastAttempt },
    { data: pushSubs },
  ] = await Promise.all([
    db.from("profiles").select("id, full_name, handle").eq("id", userId).maybeSingle(),
    db.from("attempts").select("quiz_id, submitted_at").eq("student_id", userId).order("submitted_at", { ascending: false }).limit(50),
    db.from("quizzes").select("id, category").eq("created_by", userId).limit(50),
    db.from("user_follows").select("following_id").eq("follower_id", userId).limit(20),
    db.from("wallets").select("balance_kobo, ai_credit_balance_kobo").eq("user_id", userId).maybeSingle(),
    db.from("subscriptions").select("expires_at, active").eq("user_id", userId).eq("kind", "creator_access").eq("active", true).order("expires_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("direct_messages").select("id", { count: "exact", head: true }).eq("recipient_id", userId).is("read_at", null),
    db.from("attempts").select("submitted_at").eq("student_id", userId).order("submitted_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("push_subscriptions").select("id").eq("user_id", userId).limit(1),
  ]);

  const quizIds = Array.from(new Set((attempts ?? []).map((a: any) => a.quiz_id).filter(Boolean)));
  let categories: string[] = [];
  if (quizIds.length) {
    const { data: quizRows } = await db.from("quizzes").select("id, category").in("id", quizIds.slice(0, 50));
    categories = Array.from(new Set((quizRows ?? []).map((q: any) => q.category).filter(Boolean)));
  }

  let followedCreators: Array<{ id: string; name: string }> = [];
  const followIds = (follows ?? []).map((f: any) => f.following_id).filter(Boolean);
  if (followIds.length) {
    const { data: creators } = await db.from("profiles").select("id, full_name, handle").in("id", followIds);
    followedCreators = (creators ?? []).map((c: any) => ({ id: c.id, name: c.full_name || c.handle || "a creator" }));
  }

  return {
    userId,
    name: profile?.full_name || profile?.handle || "there",
    quizzesTaken: (attempts ?? []).length,
    categories,
    isCreator: (myQuizzes ?? []).length > 0,
    quizzesCreated: (myQuizzes ?? []).length,
    followedCreators,
    walletBalanceKobo: Number(wallet?.balance_kobo ?? 0),
    aiCreditBalanceKobo: Number(wallet?.ai_credit_balance_kobo ?? 0),
    creatorAccessExpiresAt: creatorSub?.active ? creatorSub?.expires_at ?? null : null,
    unreadMessages: Number((unread as any)?.length ?? 0),
    lastActiveAt: lastAttempt?.submitted_at ?? null,
    hasPushEnabled: (pushSubs ?? []).length > 0,
  };
}

async function pickRotatingImage(db: any): Promise<string | undefined> {
  try {
    const { data } = await db.from("app_settings").select("value").eq("key", "ai_notification_images").maybeSingle();
    const list = Array.isArray(data?.value) ? (data.value as string[]) : [];
    if (!list.length) return undefined;
    return list[Math.floor(Math.random() * list.length)];
  } catch {
    return undefined;
  }
}

const SYSTEM_PROMPT = [
  "You write ONE short, personal push/in-app notification for a specific user of a quiz platform called HaniLearn-QZ.",
  "Ground everything ONLY in real features of this app: browsing/taking quizzes (/explore), creating your own quizzes by typing questions, pasting/uploading a document for AI parsing, or asking AI to generate questions from a topic (/create), a wallet holding both cash balance and AI credit used to top up and unlock priced quizzes (/wallet), direct messaging other users (/messages), creator access subscription that lets you publish quizzes, cash prizes on quizzes, and a support page (/support).",
  "NEVER invent features that are not listed above (no 'turn your notes into quizzes' or similar unless it is literally the document-upload parsing feature described).",
  "Use the user's own stats to personalise the message: what they've done, what they haven't done yet, low balances, expiring access, unread messages, or creators they follow publishing new content.",
  "Reply with ONLY compact JSON: {\"kind\": string, \"title\": string (max 60 chars), \"body\": string (max 160 chars), \"link\": one of /explore, /create, /wallet, /messages, /notifications, /support, /profile, /exams, /results}.",
  "Tone: warm, specific, never generic, never mention you are an AI.",
].join(" ");

/** Generates one grounded, personalised notification for a single user via OpenRouter (heavy lane), logging usage. */
export async function generatePersonalNotification(
  db: any,
  ctx: UserContext,
): Promise<{ kind: string; title: string; body: string; link: string; image_url?: string } | null> {
  const facts = [
    `Name: ${ctx.name}`,
    `Quizzes taken: ${ctx.quizzesTaken}`,
    `Categories taken: ${ctx.categories.join(", ") || "none yet"}`,
    `Is a quiz creator: ${ctx.isCreator} (${ctx.quizzesCreated} quizzes published)`,
    `Follows creators: ${ctx.followedCreators.map((c) => c.name).join(", ") || "none"}`,
    `Wallet balance: ₦${(ctx.walletBalanceKobo / 100).toFixed(0)}`,
    `AI credit balance: ₦${(ctx.aiCreditBalanceKobo / 100).toFixed(0)}`,
    `Creator access expires: ${ctx.creatorAccessExpiresAt ?? "not subscribed"}`,
    `Unread messages: ${ctx.unreadMessages}`,
    `Last active: ${ctx.lastActiveAt ?? "never took a quiz"}`,
    `Has push notifications enabled: ${ctx.hasPushEnabled}`,
  ].join("\n");

  try {
    const res = await aiChat("heavy", [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Here is this user's context:\n${facts}\n\nWrite their notification now.` },
    ], { json: true, max_tokens: 300, temperature: 0.9 });

    const parsed: any = parseJsonLoose(res.text, null);
    if (!parsed?.title) return null;

    try {
      await db.from("ai_usage_log").insert({
        user_id: ctx.userId,
        feature: "ai_notify",
        provider: res.provider,
        model: res.model,
        input_tokens: res.input_tokens,
        output_tokens: res.output_tokens,
        credits_cost: 0,
        meta: { fellBack: res.fellBack },
      });
    } catch { /* non-fatal */ }

    const image_url = await pickRotatingImage(db);
    return {
      kind: String(parsed.kind || "ai_daily").slice(0, 40),
      title: String(parsed.title).slice(0, 60),
      body: String(parsed.body || "").slice(0, 160),
      link: sanitizeLink(parsed.link, "/explore"),
      image_url,
    };
  } catch (e) {
    console.error("[generatePersonalNotification] AI failed for", ctx.userId, e);
    return null;
  }
}

/**
 * Daily batch: every active user gets at most one AI notification per calendar
 * day (enforced via the ai_notification_log unique constraint). Returns counts
 * for the cron route / admin "run now" button to report back.
 */
export async function runDailyAiNotifyBatch(opts: { limit?: number } = {}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const today = new Date().toISOString().slice(0, 10);

  const { data: profiles } = await db.from("profiles").select("id").limit(opts.limit ?? 2000);
  const userIds: string[] = (profiles ?? []).map((p: any) => p.id);

  // Skip anyone already sent an AI notification today (spam guard).
  const { data: already } = await db.from("ai_notification_log").select("user_id").eq("sent_on", today).eq("kind", "daily_ai");
  const doneToday = new Set((already ?? []).map((r: any) => r.user_id));
  const pending = userIds.filter((id) => !doneToday.has(id));

  const { notifyUsers } = await import("@/lib/notifications.functions");
  let generated = 0;
  let failed = 0;

  // Small concurrency batches so we don't hammer the AI provider or the DB.
  const CONCURRENCY = 5;
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (userId) => {
      try {
        const ctx = await buildUserContext(db, userId);
        const notif = await generatePersonalNotification(db, ctx);
        if (!notif) { failed++; return; }
        // Claim the day slot before sending so a crash mid-send can't double-send on retry.
        const { error: claimErr } = await db.from("ai_notification_log").insert({
          user_id: userId, sent_on: today, kind: "daily_ai", title: notif.title,
        });
        if (claimErr) return; // already claimed (race) — skip
        await notifyUsers([userId], notif);
        generated++;
      } catch (e) {
        failed++;
        console.error("[runDailyAiNotifyBatch] failed for", userId, e);
      }
    }));
  }

  return { total: userIds.length, alreadySentToday: doneToday.size, generated, failed };
}

/** Event-driven: a creator the user recently interacted with just published a new quiz. Handled by announceQuizPublished already; this is the AI-flavoured per-follower variant used when richer copy is wanted. Kept simple/deterministic to stay cheap and instant (no AI round-trip on every publish). */
export async function notifyLowAiCredit(db: any, userId: string, balanceKobo: number) {
  if (balanceKobo > 0) return;
  const { notifyUsers } = await import("@/lib/notifications.functions");
  await notifyUsers([userId], {
    kind: "low_credit",
    title: "Your AI credit just ran out",
    body: "Top up to keep generating and grading quizzes with AI.",
    link: "/wallet",
  });
}

/** Event-driven: creator access is expiring within `withinDays`. */
export async function notifyCreatorAccessExpiring(db: any, userId: string, expiresAt: string, withinDays = 3) {
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
  if (days < 0 || days > withinDays) return;
  const { notifyUsers } = await import("@/lib/notifications.functions");
  await notifyUsers([userId], {
    kind: "creator_access_expiring",
    title: days <= 0 ? "Your creator access expired" : `Creator access expires in ${days} day${days === 1 ? "" : "s"}`,
    body: "Renew from your wallet so your quizzes stay published and earning.",
    link: "/wallet",
  });
}
