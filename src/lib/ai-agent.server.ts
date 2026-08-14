import { tool } from "ai";
import { z } from "zod";

/**
 * Agentic tools for Hani AI.
 *
 * - "creator" mode (Pro creators only): can actually build quizzes, add
 *   questions, publish, draft ads, message users, create groups, read its own
 *   analytics, and schedule timed follow-up tasks.
 * - "admin" mode (super admin): mini-admin read/manage powers.
 *
 * All tools run server-side with the service client, but every query is scoped
 * to the calling user's own rows unless the caller is an admin.
 */

type Ctx = { db: any; userId: string };

const questionSchema = z.object({
  type: z.enum(["mcq", "tf", "short", "essay"]),
  text: z.string(),
  options: z.array(z.object({ text: z.string(), is_correct: z.boolean() })).optional(),
  explanation: z.string().optional(),
  sample_answer: z.string().optional(),
  points: z.number().optional(),
});

async function insertQuestions(db: any, quizId: string, questions: z.infer<typeof questionSchema>[]) {
  const { data: existing } = await db.from("questions").select("id").eq("quiz_id", quizId);
  let position = (existing ?? []).length;
  let added = 0;
  for (const q of questions) {
    position += 1;
    const { data: row, error } = await db.from("questions").insert({
      quiz_id: quizId,
      position,
      type: q.type,
      text: q.text,
      explanation: q.explanation ?? null,
      sample_answer: q.sample_answer ?? null,
      points: q.points ?? 1,
      difficulty: "medium",
      tags: [],
    }).select("id").single();
    if (error) throw new Error(error.message);
    if ((q.type === "mcq" || q.type === "tf") && q.options?.length) {
      await db.from("options").insert(q.options.map((o, i) => ({
        question_id: row.id, position: i + 1, text: o.text, is_correct: !!o.is_correct,
      })));
    }
    added += 1;
  }
  const { data: all } = await db.from("questions").select("points").eq("quiz_id", quizId);
  const total = (all ?? []).reduce((s: number, r: any) => s + Number(r.points ?? 1), 0);
  await db.from("quizzes").update({ total_score: total }).eq("id", quizId);
  return { added, total_points: total };
}

async function resolveUser(db: any, who: string) {
  if (/^[0-9a-f-]{36}$/i.test(who)) return who;
  const { data } = await db.from("profiles").select("id").or(`handle.eq.${who},full_name.eq.${who},email.eq.${who}`).limit(1).maybeSingle();
  return data?.id ?? null;
}

export function creatorTools({ db, userId }: Ctx) {
  return {
    list_my_quizzes: tool({
      description: "List the quizzes this creator owns, with publish state, price and question counts.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await db.from("quizzes")
          .select("id, title, category, subject, is_published, price_kobo, total_score, created_at")
          .eq("created_by", userId).order("created_at", { ascending: false }).limit(50);
        return { quizzes: data ?? [] };
      },
    }),

    create_quiz: tool({
      description: "Create a new quiz owned by this creator. Leave publish false to keep it as a draft.",
      inputSchema: z.object({
        title: z.string(),
        description: z.string().optional(),
        category: z.string(),
        subject: z.string().optional(),
        difficulty: z.enum(["easy", "medium", "hard"]).optional(),
        duration_min: z.number().optional(),
        price_naira: z.number().optional(),
        instructions: z.string().optional(),
        publish: z.boolean().optional(),
        questions: z.array(questionSchema).optional(),
      }),
      execute: async (input) => {
        const { data: quiz, error } = await db.from("quizzes").insert({
          title: input.title,
          description: input.description ?? null,
          category: input.category,
          subject: input.subject ?? null,
          difficulty: input.difficulty ?? "medium",
          duration_min: Math.max(1, Math.round(input.duration_min ?? 10)),
          instructions: input.instructions ?? null,
          price_kobo: Math.max(0, Math.round((input.price_naira ?? 0) * 100)),
          created_by: userId,
          is_published: false,
          input_method: "ai",
        }).select("id, title").single();
        if (error) throw new Error(error.message);
        let questions = { added: 0, total_points: 0 };
        if (input.questions?.length) questions = await insertQuestions(db, quiz.id, input.questions);
        if (input.publish && questions.added > 0) {
          await db.from("quizzes").update({ is_published: true }).eq("id", quiz.id);
        }
        return { quiz_id: quiz.id, title: quiz.title, ...questions, published: !!input.publish && questions.added > 0, link: `/quiz/${quiz.id}` };
      },
    }),

    add_questions: tool({
      description: "Append questions to a quiz this creator owns. Points are raw marks used for grading.",
      inputSchema: z.object({ quiz_id: z.string(), questions: z.array(questionSchema) }),
      execute: async ({ quiz_id, questions }) => {
        const { data: owned } = await db.from("quizzes").select("id").eq("id", quiz_id).eq("created_by", userId).maybeSingle();
        if (!owned) throw new Error("You do not own that quiz.");
        return insertQuestions(db, quiz_id, questions);
      },
    }),

    publish_quiz: tool({
      description: "Publish or unpublish a quiz this creator owns.",
      inputSchema: z.object({ quiz_id: z.string(), publish: z.boolean() }),
      execute: async ({ quiz_id, publish }) => {
        const { data: owned } = await db.from("quizzes").select("id").eq("id", quiz_id).eq("created_by", userId).maybeSingle();
        if (!owned) throw new Error("You do not own that quiz.");
        const { count } = await db.from("questions").select("id", { count: "exact", head: true }).eq("quiz_id", quiz_id);
        if (publish && !count) throw new Error("Add at least one question before publishing.");
        await db.from("quizzes").update({ is_published: publish }).eq("id", quiz_id);
        return { quiz_id, published: publish };
      },
    }),

    my_analytics: tool({
      description: "Performance of this creator's quizzes: attempts, average score, likes, earnings.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data: quizzes } = await db.from("quizzes").select("id, title, price_kobo").eq("created_by", userId).limit(100);
        const ids = (quizzes ?? []).map((q: any) => q.id);
        if (!ids.length) return { quizzes: [], attempts: 0 };
        const [{ data: attempts }, { data: purchases }] = await Promise.all([
          db.from("attempts").select("quiz_id, score_pct").in("quiz_id", ids),
          db.from("quiz_purchases").select("quiz_id, price_kobo").in("quiz_id", ids),
        ]);
        const rows = (quizzes ?? []).map((q: any) => {
          const mine = (attempts ?? []).filter((a: any) => a.quiz_id === q.id);
          const sold = (purchases ?? []).filter((p: any) => p.quiz_id === q.id);
          return {
            title: q.title,
            attempts: mine.length,
            avg_score: mine.length ? Math.round(mine.reduce((s: number, a: any) => s + Number(a.score_pct ?? 0), 0) / mine.length) : 0,
            sales: sold.length,
            revenue_naira: sold.reduce((s: number, p: any) => s + Number(p.price_kobo ?? 0), 0) / 100,
          };
        });
        return { quizzes: rows, attempts: (attempts ?? []).length };
      },
    }),

    create_ad_draft: tool({
      description: "Create a draft self-serve ad for this creator. It stays pending until paid/approved.",
      inputSchema: z.object({
        title: z.string(), body: z.string().optional(), cta_label: z.string().optional(),
        cta_url: z.string().optional(), placements: z.array(z.string()).optional(), days: z.number().optional(),
      }),
      execute: async (input) => {
        const { data, error } = await db.from("ads").insert({
          title: input.title, body: input.body ?? null,
          cta_label: input.cta_label ?? "Learn more", cta_url: input.cta_url ?? null,
          placements: input.placements ?? ["explore"], days: Math.max(1, Math.round(input.days ?? 3)),
          created_by: userId, active: false, status: "pending",
        }).select("id").single();
        if (error) throw new Error(error.message);
        return { ad_id: data.id, link: "/ads", status: "pending" };
      },
    }),

    send_message: tool({
      description: "Send a direct message from this creator to another user (by handle, name or id).",
      inputSchema: z.object({ to: z.string(), body: z.string() }),
      execute: async ({ to, body }) => {
        const recipient = await resolveUser(db, to);
        if (!recipient) throw new Error("Could not find that user.");
        const { error } = await db.from("direct_messages").insert({ sender_id: userId, recipient_id: recipient, body });
        if (error) throw new Error(error.message);
        return { sent: true, link: `/messages/${recipient}` };
      },
    }),

    create_group: tool({
      description: "Create a group chat owned by this creator and optionally add members by handle/name/id.",
      inputSchema: z.object({ name: z.string(), description: z.string().optional(), members: z.array(z.string()).optional() }),
      execute: async ({ name, description, members }) => {
        const { data: group, error } = await db.from("groups").insert({
          name, description: description ?? null, created_by: userId, is_community: false,
        }).select("id").single();
        if (error) throw new Error(error.message);
        await db.from("group_members").insert({ group_id: group.id, user_id: userId, role: "admin" });
        let added = 0;
        for (const m of members ?? []) {
          const id = await resolveUser(db, m);
          if (!id || id === userId) continue;
          await db.from("group_members").insert({ group_id: group.id, user_id: id, role: "member" });
          added += 1;
        }
        return { group_id: group.id, members_added: added, link: `/messages/group/${group.id}` };
      },
    }),

    schedule_task: tool({
      description: "Schedule a follow-up task for later (e.g. 'in 3 hours, publish the quiz' or 'watch attempts for 5 hours'). Stored and executed by the daily/hourly automation run.",
      inputSchema: z.object({ instruction: z.string(), run_in_minutes: z.number() }),
      execute: async ({ instruction, run_in_minutes }) => {
        const runAt = new Date(Date.now() + Math.max(1, Math.round(run_in_minutes)) * 60000).toISOString();
        const { data: row } = await db.from("app_settings").select("value").eq("key", "agent_tasks").maybeSingle();
        const list = Array.isArray(row?.value) ? row.value : [];
        list.push({ user_id: userId, instruction, run_at: runAt, done: false, created_at: new Date().toISOString() });
        await db.from("app_settings").upsert({ key: "agent_tasks", value: list.slice(-500) }, { onConflict: "key" });
        return { scheduled_for: runAt };
      },
    }),
  };
}

export function adminTools({ db }: Ctx) {
  return {
    platform_overview: tool({
      description: "Platform totals: users, quizzes, attempts, wallet cash in circulation, AI spend, pending withdrawals and receipts.",
      inputSchema: z.object({}),
      execute: async () => {
        const [users, quizzes, attempts, wallets, ai, withdrawals, proofs] = await Promise.all([
          db.from("profiles").select("id", { count: "exact", head: true }),
          db.from("quizzes").select("id", { count: "exact", head: true }),
          db.from("attempts").select("id", { count: "exact", head: true }),
          db.from("wallets").select("balance_kobo, ai_credit_balance_kobo"),
          db.from("ai_usage_log").select("credits_cost").limit(5000),
          db.from("withdrawal_requests").select("id, amount_kobo, status, user_id, created_at").eq("status", "pending"),
          db.from("payment_proofs").select("id, purpose, amount_kobo, status, created_at").eq("status", "pending"),
        ]);
        const cash = (wallets.data ?? []).reduce((s: number, w: any) => s + Number(w.balance_kobo ?? 0), 0) / 100;
        const credit = (wallets.data ?? []).reduce((s: number, w: any) => s + Number(w.ai_credit_balance_kobo ?? 0), 0) / 100;
        const aiSpend = (ai.data ?? []).reduce((s: number, r: any) => s + Number(r.credits_cost ?? 0), 0) / 100;
        return {
          users: users.count ?? 0, quizzes: quizzes.count ?? 0, attempts: attempts.count ?? 0,
          wallet_cash_naira: cash, ai_credit_outstanding_naira: credit, ai_spend_naira: aiSpend,
          pending_withdrawals: withdrawals.data ?? [], pending_receipts: proofs.data ?? [],
        };
      },
    }),

    find_user: tool({
      description: "Look up a user and summarise their roles, wallet, quizzes and AI spend.",
      inputSchema: z.object({ who: z.string() }),
      execute: async ({ who }) => {
        const id = await resolveUser(db, who);
        if (!id) return { found: false };
        const [{ data: profile }, { data: roles }, { data: wallet }, { data: quizzes }, { data: ai }] = await Promise.all([
          db.from("profiles").select("id, full_name, handle, email, school, level, is_guest, created_at").eq("id", id).maybeSingle(),
          db.from("user_roles").select("role").eq("user_id", id),
          db.from("wallets").select("balance_kobo, ai_credit_balance_kobo, ai_credit_expires_at").eq("user_id", id).maybeSingle(),
          db.from("quizzes").select("id", { count: "exact", head: true }).eq("created_by", id),
          db.from("ai_usage_log").select("credits_cost, feature").eq("user_id", id).limit(500),
        ]);
        return {
          found: true, profile, roles: (roles ?? []).map((r: any) => r.role), wallet,
          quizzes_created: quizzes ?? 0,
          ai_spend_naira: (ai ?? []).reduce((s: number, r: any) => s + Number(r.credits_cost ?? 0), 0) / 100,
          link: `/admin/analytics/${id}`,
        };
      },
    }),

    grant_ai_credit: tool({
      description: "Grant AI credit (in Naira) to a user's wallet.",
      inputSchema: z.object({ who: z.string(), naira: z.number() }),
      execute: async ({ who, naira }) => {
        const id = await resolveUser(db, who);
        if (!id) throw new Error("User not found.");
        const kobo = Math.round(Math.max(0, naira) * 100);
        const { data: wallet } = await db.from("wallets").select("ai_credit_balance_kobo").eq("user_id", id).maybeSingle();
        const next = Number(wallet?.ai_credit_balance_kobo ?? 0) + kobo;
        await db.from("wallets").upsert({
          user_id: id, ai_credit_balance_kobo: next,
          ai_credit_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        }, { onConflict: "user_id" });
        return { user_id: id, ai_credit_naira: next / 100 };
      },
    }),

    notify_user: tool({
      description: "Send an in-app + push notification to a user, linking to a real in-app route.",
      inputSchema: z.object({ who: z.string(), title: z.string(), body: z.string(), link: z.string().optional() }),
      execute: async ({ who, title, body, link }) => {
        const id = await resolveUser(db, who);
        if (!id) throw new Error("User not found.");
        const { notifyUsers } = await import("@/lib/notifications.functions");
        await notifyUsers([id], { kind: "admin_ai", title, body, link: link ?? "/explore" });
        return { sent: true };
      },
    }),

    update_platform_setting: tool({
      description: "Update a numeric platform setting in payment_settings (prices, fees, free-tier limits, AI credit amounts).",
      inputSchema: z.object({ field: z.string(), value: z.number() }),
      execute: async ({ field, value }) => {
        const allowed = new Set([
          "ai_result_price_kobo", "ai_essay_price_kobo", "ai_generate_price_kobo", "ai_review_price_kobo",
          "ai_min_charge_kobo", "ai_credit_min_topup_kobo", "ai_credit_expiry_days",
          "free_monthly_ai_credit_kobo", "free_max_questions_per_quiz", "free_max_quizzes_per_month",
          "quiz_platform_fee_pct", "topup_fee_pct", "withdrawal_fee_pct", "withdrawal_min_kobo", "affiliate_pct",
        ]);
        if (!allowed.has(field)) throw new Error(`${field} cannot be edited from chat.`);
        const { error } = await db.from("payment_settings").update({ [field]: value }).eq("id", "default");
        if (error) throw new Error(error.message);
        return { field, value };
      },
    }),
  };
}
