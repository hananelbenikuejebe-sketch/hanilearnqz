import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CHAT_BUCKET = "chat-media";

async function signAttachment(db: any, path?: string | null) {
  if (!path) return null;
  const { data } = await db.storage.from(CHAT_BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

async function withAttachmentUrls(db: any, rows: any[]) {
  return Promise.all(
    (rows ?? []).map(async (m: any) => ({ ...m, attachment_url: await signAttachment(db, m.attachment_path) })),
  );
}

export const uploadChatMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      filename: z.string().max(160),
      content_type: z.string().max(80),
      base64: z.string().min(10),
      kind: z.enum(["image", "audio"]),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const buf = Buffer.from(data.base64, "base64");
    if (buf.byteLength > 15 * 1024 * 1024) throw new Error("File too large (max 15MB).");
    const ext = data.filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || (data.kind === "image" ? "jpg" : "webm");
    const path = `${context.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await db.storage.from(CHAT_BUCKET).upload(path, buf, { contentType: data.content_type, upsert: false });
    if (upErr) throw upErr;
    return { path, type: data.kind };
  });

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
    const list = (rows ?? []).flatMap((message: any) => {
      const peerId = message.sender_id === context.userId ? message.recipient_id : message.sender_id;
      if (seen.has(peerId)) return [];
      seen.add(peerId);
      return [{ peer_id: peerId, profile: profileMap.get(peerId) ?? null, last_message: message, unread: (rows ?? []).filter((m: any) => m.sender_id === peerId && m.recipient_id === context.userId && !m.read_at).length }];
    });
    return Promise.all(list.map(async (c: any) => ({ ...c, last_message: { ...c.last_message, attachment_url: await signAttachment(db, c.last_message.attachment_path) } })));
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
    const withUrls = await withAttachmentUrls(db, messages ?? []);
    return { profile, messages: withUrls, my_id: context.userId };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      recipient_id: z.string().uuid(),
      body: z.string().trim().max(2000).optional(),
      attachment_path: z.string().max(300).optional(),
      attachment_type: z.enum(["image", "audio"]).optional(),
      attachment_mime: z.string().max(80).optional(),
      attachment_duration_sec: z.number().int().positive().max(3600).optional(),
    }).refine((v) => (v.body && v.body.length > 0) || !!v.attachment_path, { message: "Message cannot be empty." }).parse(d),
  )
  .handler(async ({ context, data }) => {
    if (data.recipient_id === context.userId) throw new Error("You cannot message yourself.");
    const { data: row, error } = await (context.supabase as any).from("direct_messages").insert({
      sender_id: context.userId,
      recipient_id: data.recipient_id,
      body: data.body || null,
      attachment_path: data.attachment_path ?? null,
      attachment_type: data.attachment_type ?? null,
      attachment_mime: data.attachment_mime ?? null,
      attachment_duration_sec: data.attachment_duration_sec ?? null,
    }).select().single();
    if (error) throw error;
    // Minimal inline hook (messages.functions.ts is not owned by this workstream):
    // notify the recipient that they got a new message.
    try {
      const { notifyUsers } = await import("./notifications.functions");
      void notifyUsers([data.recipient_id], {
        kind: "new_message",
        title: "New message",
        body: data.body.slice(0, 140),
        link: `/messages/${context.userId}`,
      });
    } catch { /* best-effort, never blocks sending */ }
    return row;
  });
