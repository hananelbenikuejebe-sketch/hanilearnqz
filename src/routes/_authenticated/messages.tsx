import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listConversations } from "@/lib/messages.functions";
import { getMyCreatorStatus } from "@/lib/creators.functions";
import { AppShell } from "@/components/app-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({ meta: [
    { title: "Messages — HaniLearn-QZ" },
    { name: "description", content: "Private conversations with learners and quiz creators." },
    { property: "og:title", content: "Messages — HaniLearn-QZ" },
    { property: "og:description", content: "Private conversations with learners and quiz creators." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Messages,
});

function Messages() {
  const listFn = useServerFn(listConversations);
  const statusFn = useServerFn(getMyCreatorStatus);
  const { data, isLoading } = useQuery({ queryKey: ["conversations"], queryFn: () => listFn() });
  const { data: status } = useQuery({ queryKey: ["creator-status"], queryFn: () => statusFn() });
  return <AppShell isSuperAdmin={status?.is_super_admin}><div className="mx-auto max-w-3xl space-y-5 p-4 md:p-8">
    <div><h1 className="text-3xl font-bold">Messages</h1><p className="text-sm text-muted-foreground">Your private conversations.</p></div>
    {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
    {!isLoading && !(data ?? []).length && <Card><CardContent className="py-12 text-center"><MessageCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground"/><p className="font-medium">No conversations yet</p><p className="text-sm text-muted-foreground">Open a profile and tap Message.</p></CardContent></Card>}
    <div className="divide-y border-y">{(data ?? []).map((c: any) => <Link key={c.peer_id} to="/messages/$userId" params={{ userId: c.peer_id }} className="flex items-center gap-3 py-4 hover:bg-accent/30">
      <div className="grid h-10 w-10 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{(c.profile?.full_name || c.profile?.handle || "?").slice(0, 1).toUpperCase()}</div>
      <div className="min-w-0 flex-1"><div className="font-medium">{c.profile?.full_name || c.profile?.handle || "User"}</div><div className="truncate text-sm text-muted-foreground">{c.last_message.body}</div></div>
      {c.unread > 0 && <Badge>{c.unread}</Badge>}
    </Link>)}</div>
  </div></AppShell>;
}