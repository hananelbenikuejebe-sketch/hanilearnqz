import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listAiThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).from("ai_threads")
      .select("id, title, mode, created_at, updated_at")
      .eq("user_id", context.userId).order("updated_at", { ascending: false }).limit(100);
    if (error) throw error;
    return data ?? [];
  });

export const createAiThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ mode: z.enum(["guide", "creator"]).default("guide") }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any).from("ai_threads").insert({
      user_id: context.userId,
      mode: data.mode,
      title: data.mode === "creator" ? "Creator assistant" : "New conversation",
    }).select().single();
    if (error) throw error;
    return row;
  });

export const getAiThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ thread_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: thread, error: threadError } = await db.from("ai_threads").select("*")
      .eq("id", data.thread_id).eq("user_id", context.userId).maybeSingle();
    if (threadError) throw threadError;
    if (!thread) throw new Error("Conversation not found");
    const { data: rows, error } = await db.from("ai_messages").select("message")
      .eq("thread_id", data.thread_id).eq("user_id", context.userId).order("position");
    if (error) throw error;
    return { thread, messages: (rows ?? []).map((row: any) => row.message) };
  });

export const deleteAiThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ thread_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("ai_threads").delete()
      .eq("id", data.thread_id).eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });