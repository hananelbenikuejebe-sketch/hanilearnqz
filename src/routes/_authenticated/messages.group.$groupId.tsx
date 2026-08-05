import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getGroup, sendGroupMessage } from "@/lib/groups.functions";
import { getMyCreatorStatus } from "@/lib/creators.functions";
import { AppShell } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/messages/group/$groupId")({
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
  const qc = useQueryClient();
  const getFn = useServerFn(getGroup);
  const sendFn = useServerFn(sendGroupMessage);
  const statusFn = useServerFn(getMyCreatorStatus);
  const [body, setBody] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({ queryKey: ["group", groupId], queryFn: () => getFn({ data: { group_id: groupId } }) });
  const { data: status } = useQuery({ queryKey: ["creator-status"], queryFn: () => statusFn() });
  const send = useMutation({
    mutationFn: () => sendFn({ data: { group_id: groupId, body } }),
    onSuccess: () => { setBody(""); qc.invalidateQueries({ queryKey: ["group", groupId] }); },
    onError: (e: any) => toast.error(e.message),
  });

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

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [data?.messages?.length]);

  return (
    <AppShell isSuperAdmin={status?.is_super_admin}>
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl flex-col p-4 md:min-h-screen md:p-8">
        <div className="flex items-center gap-3 border-b pb-4">
          <Button asChild size="icon" variant="ghost"><Link to="/messages"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold">{data?.group?.name ?? "Group"}</span>
              {data?.group?.is_community && <Badge variant="secondary" className="text-[10px]">Community</Badge>}
            </div>
            <div className="text-xs text-muted-foreground">{data?.members?.length ?? 0} members</div>
          </div>
          <Sheet>
            <SheetTrigger asChild><Button size="icon" variant="ghost"><Users className="h-4 w-4" /></Button></SheetTrigger>
            <SheetContent>
              <SheetHeader><SheetTitle>Members ({data?.members?.length ?? 0})</SheetTitle></SheetHeader>
              <div className="mt-4 space-y-2">
                {(data?.members ?? []).map((m: any) => (
                  <Link key={m.user_id} to="/profile/$userId" params={{ userId: m.user_id }} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/40">
                    <div className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {(m.profile?.full_name || m.profile?.handle || "?").slice(0, 1).toUpperCase()}
                    </div>
                    <span className="min-w-0 flex-1 truncate">{m.profile?.full_name || m.profile?.handle || "User"}</span>
                    {m.role !== "member" && <Badge variant="outline" className="text-[10px]">{m.role}</Badge>}
                  </Link>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto py-5">
          {(data?.messages ?? []).map((m: any) => {
            const mine = m.user_id === data?.my_id;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[82%] rounded-md px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {!mine && (
                    <Link to="/profile/$userId" params={{ userId: m.user_id }} className="mb-0.5 block text-[11px] font-semibold opacity-80 hover:underline">
                      {m.sender?.full_name || m.sender?.handle || "User"}
                    </Link>
                  )}
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className="mt-1 text-[10px] opacity-70">{new Date(m.created_at).toLocaleString()}</p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <form className="flex gap-2 border-t pt-4" onSubmit={(e) => { e.preventDefault(); if (body.trim()) send.mutate(); }}>
          <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message…" />
          <Button type="submit" size="icon" disabled={!body.trim() || send.isPending}><Send className="h-4 w-4" /></Button>
        </form>
      </div>
    </AppShell>
  );
}
