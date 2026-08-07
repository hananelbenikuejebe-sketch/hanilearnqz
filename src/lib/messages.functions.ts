import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: rows, error } = await db.from("direct_messages").select("*")
      .or(`sender_id.eq.${context.userId},recipient_id.eq.${context.userId}`)
      .order("created_at", { ascending: false }).limit(300);
    if (error) throw error;
    const peerIds = Array.from(new Set((rows ?? []).map((m: any) => m.sender_id === context.userId ? m.recipient_id : m.sender_id)));
    const { fetchProfileMap } = await import("@/lib/profile-lookup.server");
    const profileMap = await fetchProfileMap(db, peerIds as Array<string>);
    const seen = new Set<string>();
    return (rows ?? []).flatMap((message: any) => {
      const peerId = message.sender_id === context.userId ? message.recipient_id : message.sender_id;
      if (seen.has(peerId)) return [];
      seen.add(peerId);
      return [{ peer_id: peerId, profile: profileMap.get(peerId) ?? null, last_message: message, unread: (rows ?? []).filter((m: any) => m.sender_id === peerId && m.recipient_id === context.userId && !m.read_at).length }];
    });
  });

export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: profile } = await db.from("profiles").select("id, full_name, handle, avatar_url").eq("id", data.user_id).maybeSingle();
    if (!profile) throw new Error("Profile not found");
    const { data: messages, error } = await db.from("direct_messages").select("*")
      .or(`and(sender_id.eq.${context.userId},recipient_id.eq.${data.user_id}),and(sender_id.eq.${data.user_id},recipient_id.eq.${context.userId})`)
      .order("created_at", { ascending: true }).limit(300);
    if (error) throw error;
    await db.from("direct_messages").update({ read_at: new Date().toISOString() })
      .eq("sender_id", data.user_id).eq("recipient_id", context.userId).is("read_at", null);
    return { profile, messages: messages ?? [], my_id: context.userId };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ recipient_id: z.string().uuid(), body: z.string().trim().min(1).max(2000) }).parse(d))
  .handler(async ({ context, data }) => {
    if (data.recipient_id === context.userId) throw new Error("You cannot message yourself.");
    const { data: row, error } = await (context.supabase as any).from("direct_messages").insert({
      sender_id: context.userId, recipient_id: data.recipient_id, body: data.body,
    }).select().single();
    if (error) throw error;
    return row;
  });