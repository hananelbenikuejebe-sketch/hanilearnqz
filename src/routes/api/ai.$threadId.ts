import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { createAiProvider, DEFAULT_CHAT_MODEL } from "@/lib/ai-gateway.server";

export const Route = createFileRoute("/api/ai/$threadId")({
  server: { handlers: { POST: async ({ request, params }) => {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!token || !url || !key) return new Response("Unauthorized", { status: 401 });
    const auth = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
    const { data: userData } = await auth.auth.getUser(token);
    const userId = userData.user?.id;
    if (!userId) return new Response("Unauthorized", { status: 401 });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: thread } = await db.from("ai_threads").select("*").eq("id", params.threadId).eq("user_id", userId).maybeSingle();
    if (!thread) return new Response("Conversation not found", { status: 404 });
    const body = await request.json() as { messages?: UIMessage[] };
    if (!Array.isArray(body.messages)) return new Response("Messages are required", { status: 400 });

    const { checkAiAccess, reserveAiCredit, getActorRoles } = await import("@/lib/authz.server");
    const roles = await getActorRoles(db, userId);
    const isAdmin = roles.includes("admin") || roles.includes("super_admin");

    // Agentic creator mode stays a Pro-creator (or admin) capability.
    let agentic = false;
    if (thread.mode === "creator") {
      if (isAdmin) {
        agentic = true;
      } else {
        const { data: pro } = await db.rpc("has_active_creator_subscription", { _user_id: userId });
        if (!pro) {
          return new Response("The agentic Creator assistant is a Pro creator feature. Upgrade your creator access in your wallet to unlock it.", { status: 403 });
        }
        agentic = true;
      }
    }

    const feature = agentic ? "ai_generate" : "ai_review";
    try {
      await checkAiAccess(auth, userId, feature as any);
      const reservation = await reserveAiCredit(userId, feature as any);
      if (!reservation.ok) return new Response("Insufficient AI credit. Top up your AI credit to keep chatting.", { status: 402 });
    } catch (error) {
      return new Response(error instanceof Error ? error.message : "AI access unavailable", { status: 403 });
    }

    const apiKey = process.env["OPENROUTER_API_KEY"];
    if (!apiKey) return new Response("AI is not configured", { status: 503 });
    const provider = createAiProvider(apiKey);

    const { creatorTools, adminTools } = await import("@/lib/ai-agent.server");
    const tools = agentic
      ? { ...creatorTools({ db, userId }), ...(isAdmin ? adminTools({ db, userId }) : {}) }
      : undefined;

    const system = agentic
      ? [
          "You are the HaniLearn-QZ Creator Agent — an autonomous copilot for quiz creators.",
          "You have real tools: create quizzes with questions, append questions, publish/unpublish, read your own quiz analytics, draft self-serve ads, send direct messages, create groups with members, and schedule timed follow-up tasks.",
          "When a creator asks for a quiz on a topic, actually build it: invent a clear title, description, category/subject, sensible duration, and a full set of well-formed questions with raw points, correct options and explanations. Save it as a draft unless they explicitly ask you to publish.",
          "Always use the tools instead of describing what you would do, and never claim something is done unless the tool returned success. After acting, report exactly what you created and give the in-app link.",
          isAdmin ? "You also hold mini-admin powers: platform overview, user lookup, AI credit grants, notifications and editing platform settings. Confirm the change back to the admin in plain numbers." : "",
          "You may recommend HaniLearn features (Pro creator access, AI credit top-ups, ads, prize quizzes) when genuinely useful.",
          "Link users onward with real in-app paths: /explore, /create, /wallet, /messages, /ads, /results, /exams, /support, /profile, /admin/analytics.",
        ].filter(Boolean).join(" ")
      : "You are Hani, the HaniLearn-QZ guide and education assistant. Explain how to explore and take quizzes, create quizzes, use AI credit and wallet, messages, groups, profiles, ads, notifications, results, exams, and support. Link users onward with real in-app paths (/explore, /create, /wallet, /messages, /ads, /results, /exams, /support, /profile). Also teach general school subjects clearly. Be concise, accurate, and never invent app features.";

    const result = streamText({
      model: provider(DEFAULT_CHAT_MODEL),
      system,
      messages: await convertToModelMessages(body.messages),
      ...(tools ? { tools, stopWhen: stepCountIs(50) } : {}),
      abortSignal: request.signal,
    });
    return result.toUIMessageStreamResponse({
      originalMessages: body.messages,
      onFinish: async ({ messages, responseMessage }) => {
        const completed = responseMessage ? [...messages.filter((m) => m.id !== responseMessage.id), responseMessage] : messages;
        for (const [index, message] of completed.entries()) {
          await db.from("ai_messages").upsert({
            thread_id: params.threadId, user_id: userId, ai_message_id: message.id,
            role: message.role, message, position: index + 1,
          }, { onConflict: "thread_id,ai_message_id" });
        }
        const firstUser = completed.find((m) => m.role === "user");
        const text = firstUser?.parts?.filter((p: any) => p.type === "text").map((p: any) => p.text).join(" ") ?? "";
        await db.from("ai_threads").update({ title: text.slice(0, 60) || thread.title, updated_at: new Date().toISOString() }).eq("id", params.threadId);
      },
    });
  } } },
});
