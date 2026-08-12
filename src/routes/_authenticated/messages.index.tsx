import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listConversations } from "@/lib/messages.functions";
import { listMyGroups, createGroup, searchUsersForGroup } from "@/lib/groups.functions";
import { getMyCreatorStatus } from "@/lib/creators.functions";
import { displayName, initialsOf } from "@/lib/display-name";
import { AppShell } from "@/components/app-nav";
import { AdSlot } from "@/components/ad-slot";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { MessageCircle, Users, Plus, Check, Search, Bot } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/messages/")({
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

function relativeTime(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

function PersonPicker({ selected, setSelected, q, setQ, results }: any) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-8" placeholder="Search by name or handle…" value={q} onChange={(e: any) => setQ(e.target.value)} />
      </div>
      <div className="max-h-56 space-y-1 overflow-y-auto">
        {(results ?? []).map((p: any) => {
          const isSel = !!selected[p.id];
          return (
            <button key={p.id} type="button" onClick={() => setSelected((s: any) => { const n = { ...s }; if (isSel) delete n[p.id]; else n[p.id] = p; return n; })}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/40 ${isSel ? "bg-accent/50" : ""}`}>
              <Avatar className="h-7 w-7 shrink-0">
                {p.avatar_url && <AvatarImage src={p.avatar_url} alt={displayName(p)} />}
                <AvatarFallback className="text-[10px]">{initialsOf(p)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-left">{displayName(p)}</span>
              {isSel && <Check className="h-4 w-4 text-primary" />}
            </button>
          );
        })}
        {!results?.length && <p className="px-2 py-4 text-center text-xs text-muted-foreground">No people found.</p>}
      </div>
    </div>
  );
}

function NewMessageDialog() {
  const searchFn = useServerFn(searchUsersForGroup);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { data: results } = useQuery({ queryKey: ["dm-user-search", q], queryFn: () => searchFn({ data: { q } }), enabled: open });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline" className="gap-1"><Plus className="h-3.5 w-3.5" /> New message</Button></DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Start a conversation</DialogTitle></DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search by name or handle…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {(results ?? []).map((p: any) => (
            <Link key={p.id} to="/messages/$userId" params={{ userId: p.id }} onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/40">
              <Avatar className="h-7 w-7 shrink-0">
                {p.avatar_url && <AvatarImage src={p.avatar_url} alt={displayName(p)} />}
                <AvatarFallback className="text-[10px]">{initialsOf(p)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-left">{displayName(p)}</span>
            </Link>
          ))}
          {!results?.length && <p className="px-2 py-4 text-center text-xs text-muted-foreground">No people found.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewGroupDialog() {
  const qc = useQueryClient();
  const searchFn = useServerFn(searchUsersForGroup);
  const createFn = useServerFn(createGroup);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Record<string, any>>({});

  const { data: results } = useQuery({ queryKey: ["group-user-search", q], queryFn: () => searchFn({ data: { q } }), enabled: open });
  const create = useMutation({
    mutationFn: () => createFn({ data: { name, description: description || undefined, member_ids: Object.keys(selected) } }),
    onSuccess: () => {
      toast.success("Group created");
      setOpen(false); setName(""); setDescription(""); setSelected({});
      qc.invalidateQueries({ queryKey: ["my-groups"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" className="gap-1"><Plus className="h-3.5 w-3.5" /> New group</Button></DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>New group</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea placeholder="Description (optional)" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          <PersonPicker selected={selected} setSelected={setSelected} q={q} setQ={setQ} results={results} />
          {!!Object.keys(selected).length && <p className="text-xs text-muted-foreground">{Object.keys(selected).length} selected</p>}
        </div>
        <DialogFooter>
          <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>Create group</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Messages() {
  const listFn = useServerFn(listConversations);
  const groupsFn = useServerFn(listMyGroups);
  const statusFn = useServerFn(getMyCreatorStatus);
  const [tab, setTab] = useState<"direct" | "groups" | "ai">("direct");
  const { data, isLoading } = useQuery({ queryKey: ["conversations"], queryFn: () => listFn() });
  const { data: groups, isLoading: groupsLoading } = useQuery({ queryKey: ["my-groups"], queryFn: () => groupsFn() });
  const { data: status } = useQuery({ queryKey: ["creator-status"], queryFn: () => statusFn() });

  return <AppShell isSuperAdmin={status?.is_super_admin}><div className="mx-auto w-full max-w-3xl space-y-5 overflow-x-hidden p-4 pb-24 md:p-8">
    <div className="flex items-start justify-between gap-3">
      <div><h1 className="text-3xl font-bold">Messages</h1><p className="text-sm text-muted-foreground">Direct chats and group conversations.</p></div>
      {tab === "groups" ? <NewGroupDialog /> : tab === "direct" ? <NewMessageDialog /> : <Button asChild size="sm"><Link to="/ai"><Bot className="mr-1 h-4 w-4"/>Open Hani AI</Link></Button>}
    </div>

    <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
      <TabsList>
        <TabsTrigger value="direct">Direct</TabsTrigger>
        <TabsTrigger value="groups">Groups</TabsTrigger>
        <TabsTrigger value="ai">AI assistant</TabsTrigger>
      </TabsList>
    </Tabs>

    <AdSlot placement="messages" />

    {tab === "direct" && <>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && !(data ?? []).length && <Card><CardContent className="py-12 text-center"><MessageCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground"/><p className="font-medium">No conversations yet</p><p className="text-sm text-muted-foreground">Tap "New message" to start chatting.</p></CardContent></Card>}
      <div className="divide-y rounded-lg border">{(data ?? []).map((c: any) => <Link key={c.peer_id} to="/messages/$userId" params={{ userId: c.peer_id }} className="flex items-center gap-3 px-3 py-3 transition hover:bg-accent/30">
        <Avatar className="h-11 w-11 shrink-0">
          {c.profile?.avatar_url && <AvatarImage src={c.profile.avatar_url} alt={displayName(c.profile)} />}
          <AvatarFallback>{initialsOf(c.profile)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium">{displayName(c.profile)}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(c.last_message.created_at)}</span>
          </div>
          <div className="truncate text-sm text-muted-foreground">{c.last_message.body}</div>
        </div>
        {c.unread > 0 && <Badge className="shrink-0">{c.unread}</Badge>}
      </Link>)}</div>
    </>}

    {tab === "groups" && <>
      {groupsLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!groupsLoading && !(groups ?? []).length && <Card><CardContent className="py-12 text-center"><Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground"/><p className="font-medium">No groups yet</p></CardContent></Card>}
      <div className="divide-y rounded-lg border">{(groups ?? []).map((g: any) => <Link key={g.id} to="/messages/group/$groupId" params={{ groupId: g.id }} className="flex items-center gap-3 px-3 py-3 transition hover:bg-accent/30">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">{g.name.slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><span className="font-medium truncate">{g.name}</span>{g.is_community && <Badge variant="secondary" className="text-[10px]">Community</Badge>}</div>
          <div className="truncate text-sm text-muted-foreground">{g.last_message?.body ?? `${g.member_count} member${g.member_count === 1 ? "" : "s"}`}</div>
        </div>
      </Link>)}</div>
    </>}
    {tab === "ai" && <Card><CardContent className="py-10 text-center"><Bot className="mx-auto mb-3 h-9 w-9 text-primary"/><p className="font-medium">Hani AI remembers your conversations</p><p className="mb-4 text-sm text-muted-foreground">Get app guidance, study help, or open the creator copilot.</p><Button asChild><Link to="/ai">View AI conversations</Link></Button></CardContent></Card>}
  </div></AppShell>;
}
