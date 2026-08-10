import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { notifyUsers } from "@/lib/notifications.functions";

async function assertMember(db: any, groupId: string, userId: string) {
  const { data } = await db.from("group_members").select("role").eq("group_id", groupId).eq("user_id", userId).maybeSingle();
  if (!data) throw new Error("You are not a member of this group.");
  return data.role as string;
}

export const listMyGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: memberships, error } = await db.from("group_members").select("group_id, role").eq("user_id", context.userId);
    if (error) throw error;
    const groupIds = (memberships ?? []).map((m: any) => m.group_id);
    if (!groupIds.length) return [];

    const [{ data: groups }, { data: allMembers }, { data: lastMessages }] = await Promise.all([
      db.from("groups").select("*").in("id", groupIds),
      db.from("group_members").select("group_id").in("group_id", groupIds),
      db.from("group_messages").select("group_id, body, created_at").in("group_id", groupIds).order("created_at", { ascending: false }),
    ]);

    const memberCounts = new Map<string, number>();
    for (const m of allMembers ?? []) memberCounts.set(m.group_id, (memberCounts.get(m.group_id) ?? 0) + 1);
    const lastMsgMap = new Map<string, any>();
    for (const m of lastMessages ?? []) if (!lastMsgMap.has(m.group_id)) lastMsgMap.set(m.group_id, m);

    return (groups ?? [])
      .map((g: any) => ({
        ...g,
        member_count: memberCounts.get(g.id) ?? 0,
        last_message: lastMsgMap.get(g.id) ?? null,
      }))
      .sort((a: any, b: any) => {
        if (a.is_community !== b.is_community) return a.is_community ? -1 : 1;
        const at = a.last_message?.created_at ?? a.created_at;
        const bt = b.last_message?.created_at ?? b.created_at;
        return new Date(bt).getTime() - new Date(at).getTime();
      });
  });

export const createGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      name: z.string().trim().min(1).max(120),
      description: z.string().trim().max(1000).optional(),
      member_ids: z.array(z.string().uuid()).max(200).default([]),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: group, error } = await db.from("groups").insert({
      name: data.name, description: data.description ?? null, created_by: context.userId, is_community: false,
    }).select("*").single();
    if (error) throw error;

    const memberIds = Array.from(new Set([context.userId, ...data.member_ids]));
    const rows = memberIds.map((user_id) => ({ group_id: group.id, user_id, role: user_id === context.userId ? "owner" : "member" }));
    const { error: memErr } = await db.from("group_members").insert(rows);
    if (memErr) throw memErr;

    const others = memberIds.filter((id) => id !== context.userId);
    await notifyUsers(others, { kind: "group_invite", title: `Added to "${data.name}"`, body: "You were added to a new group chat.", link: `/messages/group/${group.id}` });

    return group;
  });

export const getGroup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ group_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    await assertMember(db, data.group_id, context.userId);

    const [{ data: group, error: gErr }, { data: members }, { data: messages }] = await Promise.all([
      db.from("groups").select("*").eq("id", data.group_id).single(),
      db.from("group_members").select("group_id, user_id, role, created_at").eq("group_id", data.group_id),
      db.from("group_messages").select("*").eq("group_id", data.group_id).order("created_at", { ascending: false }).limit(100),
    ]);
    if (gErr) throw gErr;

    const memberIds = (members ?? []).map((m: any) => m.user_id);
    const senderIds = (messages ?? []).map((m: any) => m.user_id);
    const allProfileIds = Array.from(new Set([...memberIds, ...senderIds]));
    const { fetchProfiles } = await import("@/lib/profile-lookup.server");
    const profiles = await fetchProfiles(db, allProfileIds);
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const profilesRecord: Record<string, any> = {};
    for (const p of profiles ?? []) profilesRecord[p.id] = p;

    // Always hand back at least `{ id }` so the UI can render a stable
    // "Learner ab12cd" label instead of collapsing everyone into "Learner".
    const profileFor = (id: string) => profileMap.get(id) ?? { id, full_name: null, handle: null, avatar_url: null };
    const membersWithProfile = (members ?? []).map((m: any) => ({ ...m, profile: profileFor(m.user_id) }));
    const messagesWithSenderRaw = (messages ?? []).slice().reverse().map((m: any) => ({ ...m, sender: profileFor(m.user_id) }));
    const messagesWithSender = await Promise.all(messagesWithSenderRaw.map(async (m: any) => ({ ...m, attachment_url: await signAttachment(db, m.attachment_path) })));
    for (const id of allProfileIds) if (!profilesRecord[id]) profilesRecord[id] = profileFor(id);

    return { group, members: membersWithProfile, messages: messagesWithSender, profiles: profilesRecord, my_id: context.userId };
  });

export const sendGroupMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      group_id: z.string().uuid(),
      body: z.string().trim().max(2000).optional(),
      attachment_path: z.string().max(300).optional(),
      attachment_type: z.enum(["image", "audio"]).optional(),
      attachment_mime: z.string().max(80).optional(),
      attachment_duration_sec: z.number().int().positive().max(3600).optional(),
    }).refine((v) => (v.body && v.body.length > 0) || !!v.attachment_path, { message: "Message cannot be empty." }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    await assertMember(db, data.group_id, context.userId);

    const { data: row, error } = await db.from("group_messages").insert({
      group_id: data.group_id,
      user_id: context.userId,
      body: data.body || null,
      attachment_path: data.attachment_path ?? null,
      attachment_type: data.attachment_type ?? null,
      attachment_mime: data.attachment_mime ?? null,
      attachment_duration_sec: data.attachment_duration_sec ?? null,
    }).select("*").single();
    if (error) throw error;

    const [{ data: group }, { data: members }] = await Promise.all([
      db.from("groups").select("name").eq("id", data.group_id).single(),
      db.from("group_members").select("user_id").eq("group_id", data.group_id).limit(51),
    ]);
    const recipients = (members ?? []).map((m: any) => m.user_id).filter((id: string) => id !== context.userId).slice(0, 50);
    await notifyUsers(recipients, { kind: "group_message", title: group?.name ?? "New group message", body: (data.body || "Sent an attachment").slice(0, 140), link: `/messages/group/${data.group_id}` });

    return row;
  });

export const leaveGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ group_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { error } = await db.from("group_members").delete().eq("group_id", data.group_id).eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const addGroupMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ group_id: z.string().uuid(), member_ids: z.array(z.string().uuid()).min(1).max(200) }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const role = await assertMember(db, data.group_id, context.userId);
    if (role !== "owner" && role !== "admin") throw new Error("Only group owners/admins can add members.");

    const { data: group } = await db.from("groups").select("name").eq("id", data.group_id).single();
    const rows = data.member_ids.map((user_id) => ({ group_id: data.group_id, user_id, role: "member" }));
    const { error } = await db.from("group_members").upsert(rows, { onConflict: "group_id,user_id", ignoreDuplicates: true });
    if (error) throw error;
    await notifyUsers(data.member_ids, { kind: "group_invite", title: `Added to "${group?.name ?? "a group"}"`, body: "You were added to a group chat.", link: `/messages/group/${data.group_id}` });
    return { ok: true };
  });

export const searchUsersForGroup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().trim().max(100).default("") }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    let q = db.from("profiles").select("id, full_name, handle, avatar_url, is_guest")
      .neq("id", context.userId)
      .order("full_name", { ascending: true, nullsFirst: false })
      .limit(400);
    if (data.q) q = q.or(`full_name.ilike.%${data.q}%,handle.ilike.%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

const CHAT_BUCKET = "chat-media";

async function signAttachment(db: any, path?: string | null) {
  if (!path) return null;
  const { data } = await db.storage.from(CHAT_BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export const createGroupInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ group_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    await assertMember(db, data.group_id, context.userId);
    const { data: row, error } = await db.from("group_invites").insert({ group_id: data.group_id, created_by: context.userId }).select("*").single();
    if (error) throw error;
    return row;
  });

export const getGroupInvitePreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ token: z.string().min(8).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: invite } = await db.from("group_invites").select("*, group:groups(id, name, description, is_community)").eq("token", data.token).maybeSingle();
    if (!invite) throw new Error("This invite link is invalid or has expired.");
    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) throw new Error("This invite link has expired.");
    if (invite.max_uses && invite.use_count >= invite.max_uses) throw new Error("This invite link has reached its usage limit.");
    return { group: invite.group };
  });

export const joinGroupViaInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ token: z.string().min(8).max(120) }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: invite } = await db.from("group_invites").select("*").eq("token", data.token).maybeSingle();
    if (!invite) throw new Error("This invite link is invalid or has expired.");
    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) throw new Error("This invite link has expired.");
    if (invite.max_uses && invite.use_count >= invite.max_uses) throw new Error("This invite link has reached its usage limit.");

    const { data: existing } = await db.from("group_members").select("user_id").eq("group_id", invite.group_id).eq("user_id", context.userId).maybeSingle();
    if (!existing) {
      const { error } = await db.from("group_members").insert({ group_id: invite.group_id, user_id: context.userId, role: "member" });
      if (error) throw error;
      await db.from("group_invites").update({ use_count: invite.use_count + 1 }).eq("id", invite.id);
    }
    return { group_id: invite.group_id };
  });
