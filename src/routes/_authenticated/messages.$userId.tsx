import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { getConversation, sendMessage } from "@/lib/messages.functions";
import { getMyCreatorStatus } from "@/lib/creators.functions";
import { displayName, initialsOf } from "@/lib/display-name";
import { AppShell } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Send, MessageCircle } from "lucide-react";
import { toast } from "sonner";

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

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function Conversation() {
  const { userId } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(getConversation); const sendFn = useServerFn(sendMessage); const statusFn = useServerFn(getMyCreatorStatus);
  const [body, setBody] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const { data } = useQuery({ queryKey: ["conversation", userId], queryFn: () => getFn({ data: { user_id: userId } }), refetchInterval: 5000 });
  const { data: status } = useQuery({ queryKey: ["creator-status"], queryFn: () => statusFn() });
  const send = useMutation({ mutationFn: () => sendFn({ data: { recipient_id: userId, body } }), onSuccess: () => { setBody(""); qc.invalidateQueries({ queryKey: ["conversation", userId] }); }, onError: (e: any) => toast.error(e.message) });

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [data?.messages?.length]);

  const messages = data?.messages ?? [];
  let lastDay = "";

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

      <div className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 py-4">
        {!messages.length && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <MessageCircle className="h-8 w-8" />
            <p className="text-sm">No messages yet. Say hi!</p>
          </div>
        )}
        {messages.map((m: any) => {
          const mine = m.sender_id === data?.my_id;
          const day = dayLabel(m.created_at);
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <div key={m.id}>
              {showDay && (
                <div className="my-3 flex items-center justify-center">
                  <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground">{day}</span>
                </div>
              )}
              <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[78%] px-3.5 py-2 text-sm shadow-sm ${mine ? "rounded-2xl rounded-br-sm bg-primary text-primary-foreground" : "rounded-2xl rounded-bl-sm bg-muted text-foreground"}`}>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                </div>
              </div>
              <div className={`mt-0.5 flex ${mine ? "justify-end" : "justify-start"}`}>
                <span className="px-1 text-[10px] text-muted-foreground">{timeLabel(m.created_at)}</span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form className="flex items-center gap-2 border-t bg-background px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]" onSubmit={(e) => { e.preventDefault(); if (body.trim()) send.mutate(); }}>
        <Input className="rounded-full" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message…"/>
        <Button type="submit" size="icon" className="rounded-full shrink-0" disabled={!body.trim() || send.isPending}><Send className="h-4 w-4"/></Button>
      </form>
    </div>
  </AppShell>;
}
