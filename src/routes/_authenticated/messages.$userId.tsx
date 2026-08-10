import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { getConversation, sendMessage, uploadChatMedia } from "@/lib/messages.functions";
import { getMyCreatorStatus } from "@/lib/creators.functions";
import { displayName, initialsOf } from "@/lib/display-name";
import { AppShell } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { DateSeparator } from "@/components/chat/date-separator";
import { MessageTicks } from "@/components/chat/message-ticks";
import { MessageAttachment } from "@/components/chat/message-attachment";
import { ChatComposer, type PendingAttachment } from "@/components/chat/chat-composer";
import { dayLabel, timeLabel } from "@/components/chat/chat-utils";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/messages/$userId")({
  head: () => ({ meta: [
    { title: "Conversation — HaniLearn-QZ" },
    { name: "description", content: "A private HaniLearn-QZ conversation." },
    { property: "og:title", content: "Conversation — HaniLearn-QZ" },
    { property: "og:description", content: "A private HaniLearn-QZ conversation." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Conversation,
});

function Conversation() {
  const { userId } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(getConversation);
  const sendFn = useServerFn(sendMessage);
  const uploadFn = useServerFn(uploadChatMedia);
  const statusFn = useServerFn(getMyCreatorStatus);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { data } = useQuery({ queryKey: ["conversation", userId], queryFn: () => getFn({ data: { user_id: userId } }), refetchInterval: 5000 });
  const { data: status } = useQuery({ queryKey: ["creator-status"], queryFn: () => statusFn() });
  const send = useMutation({
    mutationFn: (payload: { body: string; attachment?: PendingAttachment }) =>
      sendFn({ data: { recipient_id: userId, body: payload.body || undefined, attachment_path: payload.attachment?.path, attachment_type: payload.attachment?.type, attachment_mime: payload.attachment?.mime, attachment_duration_sec: payload.attachment?.durationSec } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversation", userId] }),
    onError: (e: any) => toast.error(e.message),
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const channel = supabase
      .channel(`dm-${[userId].sort().join("-")}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["conversation", userId] });
        qc.invalidateQueries({ queryKey: ["conversations"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, qc]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [data?.messages?.length]);

  const messages = data?.messages ?? [];
  let lastDay = "";
  const lastMineIndex = [...messages].map((m: any) => m.sender_id === data?.my_id).lastIndexOf(true);

  return <AppShell isSuperAdmin={status?.is_super_admin}>
    <div className="mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-3xl flex-col overflow-hidden md:h-screen">
      <div className="flex items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <Button asChild size="icon" variant="ghost"><Link to="/messages"><ArrowLeft className="h-4 w-4"/></Link></Button>
        {data?.profile && (
          <Avatar className="h-9 w-9">
            {data.profile.avatar_url && <AvatarImage src={data.profile.avatar_url} alt={displayName(data.profile)} />}
            <AvatarFallback>{initialsOf(data.profile)}</AvatarFallback>
          </Avatar>
        )}
        <div className="min-w-0">
          <div className="truncate font-semibold">{data?.profile ? displayName(data.profile) : "Conversation"}</div>
          {data?.profile?.handle && <div className="truncate text-xs text-muted-foreground">@{data.profile.handle}</div>}
        </div>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden bg-secondary/30 px-3 py-4">
        {!messages.length && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <MessageCircle className="h-8 w-8" />
            <p className="text-sm">No messages yet. Say hi!</p>
          </div>
        )}
        {messages.map((m: any, idx: number) => {
          const mine = m.sender_id === data?.my_id;
          const day = dayLabel(m.created_at);
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <div key={m.id}>
              {showDay && <DateSeparator label={day} />}
              <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[78%] space-y-1 px-3.5 py-2 text-sm shadow-sm ${mine ? "rounded-2xl rounded-br-sm bg-primary text-primary-foreground" : "rounded-2xl rounded-bl-sm bg-card text-card-foreground"}`}>
                  <MessageAttachment type={m.attachment_type} url={m.attachment_url} durationSec={m.attachment_duration_sec} mine={mine} />
                  {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                  <div className={`flex items-center gap-1 ${mine ? "justify-end" : "justify-start"}`}>
                    <span className={`text-[10px] ${mine ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{timeLabel(m.created_at)}</span>
                    {mine && idx === lastMineIndex && <MessageTicks read={!!m.read_at} />}
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
  </AppShell>;
}
