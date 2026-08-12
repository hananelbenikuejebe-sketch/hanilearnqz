import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

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
    const { checkAiAccess, reserveAiCredit } = await import("@/lib/authz.server");
    try {
      await checkAiAccess(auth, userId, "ai_generate");
      const reservation = await reserveAiCredit(userId, "ai_generate");
      if (!reservation.ok) return new Response("Insufficient AI credit", { status: 402 });
    } catch (error) {
      return new Response(error instanceof Error ? error.message : "AI access unavailable", { status: 403 });
    }
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return new Response("AI is not configured", { status: 503 });
    const gateway = createLovableAiGatewayProvider(apiKey);
    const system = thread.mode === "creator"
      ? "You are HaniLearn Creator Assistant. Help creators design rigorous quizzes, assign sensible raw points, repair pasted question formats, explain app errors, plan sections, pricing, promotion, and learner engagement. Give actionable steps grounded in HaniLearn-QZ. Never claim an action was completed unless a tool actually completed it."
      : "You are Hani, the HaniLearn-QZ guide and education assistant. Explain how to explore and take quizzes, create quizzes, use AI credit and wallet, messages, groups, profiles, ads, notifications, results, exams, and support. Also teach general school subjects clearly. Be concise, accurate, and never invent app features.";
    const result = streamText({
      model: gateway("google/gemini-3.6-flash"),
      system,
      messages: await convertToModelMessages(body.messages),
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