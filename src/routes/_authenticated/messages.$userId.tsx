import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getConversation, sendMessage } from "@/lib/messages.functions";
import { getMyCreatorStatus } from "@/lib/creators.functions";
import { AppShell } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Send } from "lucide-react";
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

function Conversation() {
  const { userId } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(getConversation); const sendFn = useServerFn(sendMessage); const statusFn = useServerFn(getMyCreatorStatus);
  const [body, setBody] = useState("");
  const { data } = useQuery({ queryKey: ["conversation", userId], queryFn: () => getFn({ data: { user_id: userId } }), refetchInterval: 5000 });
  const { data: status } = useQuery({ queryKey: ["creator-status"], queryFn: () => statusFn() });
  const send = useMutation({ mutationFn: () => sendFn({ data: { recipient_id: userId, body } }), onSuccess: () => { setBody(""); qc.invalidateQueries({ queryKey: ["conversation", userId] }); }, onError: (e: any) => toast.error(e.message) });
  return <AppShell isSuperAdmin={status?.is_super_admin}><div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl flex-col p-4 md:min-h-screen md:p-8">
    <div className="flex items-center gap-3 border-b pb-4"><Button asChild size="icon" variant="ghost"><Link to="/messages"><ArrowLeft className="h-4 w-4"/></Link></Button><div><div className="font-semibold">{data?.profile.full_name || data?.profile.handle || "Conversation"}</div>{data?.profile.handle && <div className="text-xs text-muted-foreground">@{data.profile.handle}</div>}</div></div>
    <div className="flex-1 space-y-3 overflow-y-auto py-5">{(data?.messages ?? []).map((m: any) => <div key={m.id} className={`flex ${m.sender_id === data?.my_id ? "justify-end" : "justify-start"}`}><div className={`max-w-[82%] rounded-md px-3 py-2 text-sm ${m.sender_id === data?.my_id ? "bg-primary text-primary-foreground" : "bg-muted"}`}><p className="whitespace-pre-wrap">{m.body}</p><p className="mt-1 text-[10px] opacity-70">{new Date(m.created_at).toLocaleString()}</p></div></div>)}</div>
    <form className="flex gap-2 border-t pt-4" onSubmit={(e) => { e.preventDefault(); if (body.trim()) send.mutate(); }}><Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message…"/><Button type="submit" size="icon" disabled={!body.trim() || send.isPending}><Send className="h-4 w-4"/></Button></form>
  </div></AppShell>;
}