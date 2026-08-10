import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getGroup, sendGroupMessage, joinGroupViaInvite } from "@/lib/groups.functions";
import { uploadChatMedia } from "@/lib/messages.functions";
import { getMyCreatorStatus } from "@/lib/creators.functions";
import { displayName, initialsOf } from "@/lib/display-name";
import { AppShell } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Users, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { DateSeparator } from "@/components/chat/date-separator";
import { MessageAttachment } from "@/components/chat/message-attachment";
import { ChatComposer, type PendingAttachment } from "@/components/chat/chat-composer";
import { GroupInviteButton } from "@/components/chat/group-invite-button";
import { dayLabel, timeLabel } from "@/components/chat/chat-utils";

export const Route = createFileRoute("/_authenticated/messages/group/$groupId")({
  validateSearch: (s: any) => z.object({ invite: z.string().optional() }).parse(s),
  head: () => ({ meta: [
    { title: "Group chat — HaniLearn-QZ" },
    { name: "description", content: "Group and community chat on HaniLearn-QZ." },
    { property: "og:title", content: "Group chat — HaniLearn-QZ" },
    { property: "og:description", content: "Group and community chat on HaniLearn-QZ." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: GroupChat,
});

function GroupChat() {
  const { groupId } = Route.useParams();
  const search = useSearch({ from: "/_authenticated/messages/group/$groupId" });
  const qc = useQueryClient();
  const getFn = useServerFn(getGroup);
  const sendFn = useServerFn(sendGroupMessage);
  const uploadFn = useServerFn(uploadChatMedia);
  const joinFn = useServerFn(joinGroupViaInvite);
  const statusFn = useServerFn(getMyCreatorStatus);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [joined, setJoined] = useState(false);

  const { data } = useQuery({ queryKey: ["group", groupId], queryFn: () => getFn({ data: { group_id: groupId } }) });
  const { data: status } = useQuery({ queryKey: ["creator-status"], queryFn: () => statusFn() });
  const send = useMutation({
    mutationFn: (payload: { body: string; attachment?: PendingAttachment }) =>
      sendFn({ data: { group_id: groupId, body: payload.body || undefined, attachment_path: payload.attachment?.path, attachment_type: payload.attachment?.type, attachment_mime: payload.attachment?.mime, attachment_duration_sec: payload.attachment?.durationSec } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group", groupId] }),
    onError: (e: any) => toast.error(e.message),
  });

  // Auto-join via invite link if present and not yet a member.
  useEffect(() => {
    if (!search.invite || joined) return;
    setJoined(true);
    joinFn({ data: { token: search.invite } })
      .then(() => { toast.success("Joined the group!"); qc.invalidateQueries({ queryKey: ["group", groupId] }); qc.invalidateQueries({ queryKey: ["my-groups"] }); })
      .catch((e: any) => toast.error(e.message ?? "Couldn't join via this invite link."));
  }, [search.invite, joined, joinFn, groupId, qc]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const channel = supabase
      .channel(`group-messages-${groupId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${groupId}` }, () => {
        qc.invalidateQueries({ queryKey: ["group", groupId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [groupId, qc]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [data?.messages?.length]);

  const messages = data?.messages ?? [];
  let lastDay = "";
  let lastSender = "";

  return (
    <AppShell isSuperAdmin={status?.is_super_admin}>
      <div className="mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-3xl flex-col overflow-hidden md:h-screen">
        <div className="flex items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur">
          <Button asChild size="icon" variant="ghost"><Link to="/messages"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">
            {(data?.group?.name ?? "?").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold">{data?.group?.name ?? "Group"}</span>
              {data?.group?.is_community && <Badge variant="secondary" className="text-[10px]">Community</Badge>}
            </div>
            <div className="text-xs text-muted-foreground">{data?.members?.length ?? 0} members</div>
          </div>
          {data?.group && <GroupInviteButton groupId={groupId} groupName={data.group.name} />}
          <Sheet>
            <SheetTrigger asChild><Button size="icon" variant="ghost"><Users className="h-4 w-4" /></Button></SheetTrigger>
            <SheetContent>
              <SheetHeader><SheetTitle>Members ({data?.members?.length ?? 0})</SheetTitle></SheetHeader>
              <div className="mt-4 space-y-2">
                {(data?.members ?? []).map((m: any) => (
                  <Link key={m.user_id} to="/profile/$userId" params={{ userId: m.user_id }} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/40">
                    <Avatar className="h-7 w-7 shrink-0">
                      {m.profile?.avatar_url && <AvatarImage src={m.profile.avatar_url} alt={displayName(m.profile)} />}
                      <AvatarFallback className="text-[10px]">{initialsOf(m.profile)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate">{displayName(m.profile)}</span>
                    {m.role !== "member" && <Badge variant="outline" className="text-[10px]">{m.role}</Badge>}
                  </Link>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden bg-secondary/30 px-3 py-4">
          {!messages.length && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <MessageCircle className="h-8 w-8" />
              <p className="text-sm">No messages yet. Start the conversation!</p>
            </div>
          )}
          {messages.map((m: any) => {
            const mine = m.user_id === data?.my_id;
            const day = dayLabel(m.created_at);
            const showDay = day !== lastDay;
            if (showDay) lastSender = "";
            lastDay = day;
            const showSender = !mine && lastSender !== m.user_id;
            lastSender = m.user_id;
            const senderProfile = data?.profiles?.[m.user_id] ?? m.sender;
            return (
              <div key={m.id}>
                {showDay && <DateSeparator label={day} />}
                <div className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                  {!mine && (
                    <Avatar className={`h-7 w-7 shrink-0 ${showSender ? "" : "invisible"}`}>
                      {senderProfile?.avatar_url && <AvatarImage src={senderProfile.avatar_url} alt={displayName(senderProfile)} />}
                      <AvatarFallback className="text-[10px]">{initialsOf(senderProfile)}</AvatarFallback>
                    </Avatar>
                  )}
                  <div className={`max-w-[74%] space-y-1 px-3.5 py-2 text-sm shadow-sm ${mine ? "rounded-2xl rounded-br-sm bg-primary text-primary-foreground" : "rounded-2xl rounded-bl-sm bg-card text-card-foreground"}`}>
                    {!mine && showSender && (
                      <Link to="/profile/$userId" params={{ userId: m.user_id }} className="mb-0.5 block text-[11px] font-semibold text-primary hover:underline">
                        {displayName(senderProfile)}
                      </Link>
                    )}
                    <MessageAttachment type={m.attachment_type} url={m.attachment_url} durationSec={m.attachment_duration_sec} mine={mine} />
                    {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <span className={`text-[10px] ${mine ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{timeLabel(m.created_at)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <ChatComposer
          sending={send.isPending}
          uploadFn={(args) => uploadFn({ data: args })}
          onSend={(body, attachment) => send.mutate({ body, attachment })}
        />
      </div>
    </AppShell>
  );
}
