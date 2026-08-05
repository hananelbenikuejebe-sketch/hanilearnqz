import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listConversations } from "@/lib/messages.functions";
import { listMyGroups, createGroup, searchUsersForGroup } from "@/lib/groups.functions";
import { getMyCreatorStatus } from "@/lib/creators.functions";
import { AppShell } from "@/components/app-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { MessageCircle, Users, Plus, Check } from "lucide-react";
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
          <Input placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {(results ?? []).map((p: any) => {
              const isSel = !!selected[p.id];
              return (
                <button key={p.id} type="button" onClick={() => setSelected((s) => { const n = { ...s }; if (isSel) delete n[p.id]; else n[p.id] = p; return n; })}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/40 ${isSel ? "bg-accent/50" : ""}`}>
                  <div className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {(p.full_name || p.handle || "?").slice(0, 1).toUpperCase()}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-left">{p.full_name || p.handle || "User"}</span>
                  {isSel && <Check className="h-4 w-4 text-primary" />}
                </button>
              );
            })}
          </div>
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
  const [tab, setTab] = useState<"direct" | "groups">("direct");
  const { data, isLoading } = useQuery({ queryKey: ["conversations"], queryFn: () => listFn() });
  const { data: groups, isLoading: groupsLoading } = useQuery({ queryKey: ["my-groups"], queryFn: () => groupsFn() });
  const { data: status } = useQuery({ queryKey: ["creator-status"], queryFn: () => statusFn() });

  return <AppShell isSuperAdmin={status?.is_super_admin}><div className="mx-auto max-w-3xl space-y-5 p-4 md:p-8">
    <div className="flex items-start justify-between gap-3">
      <div><h1 className="text-3xl font-bold">Messages</h1><p className="text-sm text-muted-foreground">Direct chats and group conversations.</p></div>
      {tab === "groups" && <NewGroupDialog />}
    </div>

    <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
      <TabsList>
        <TabsTrigger value="direct">Direct</TabsTrigger>
        <TabsTrigger value="groups">Groups</TabsTrigger>
      </TabsList>
    </Tabs>

    {tab === "direct" && <>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && !(data ?? []).length && <Card><CardContent className="py-12 text-center"><MessageCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground"/><p className="font-medium">No conversations yet</p><p className="text-sm text-muted-foreground">Open a profile and tap Message.</p></CardContent></Card>}
      <div className="divide-y border-y">{(data ?? []).map((c: any) => <Link key={c.peer_id} to="/messages/$userId" params={{ userId: c.peer_id }} className="flex items-center gap-3 py-4 hover:bg-accent/30">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{(c.profile?.full_name || c.profile?.handle || "?").slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0 flex-1"><div className="font-medium">{c.profile?.full_name || c.profile?.handle || "User"}</div><div className="truncate text-sm text-muted-foreground">{c.last_message.body}</div></div>
        {c.unread > 0 && <Badge>{c.unread}</Badge>}
      </Link>)}</div>
    </>}

    {tab === "groups" && <>
      {groupsLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!groupsLoading && !(groups ?? []).length && <Card><CardContent className="py-12 text-center"><Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground"/><p className="font-medium">No groups yet</p></CardContent></Card>}
      <div className="divide-y border-y">{(groups ?? []).map((g: any) => <Link key={g.id} to="/messages/group/$groupId" params={{ groupId: g.id }} className="flex items-center gap-3 py-4 hover:bg-accent/30">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">{g.name.slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><span className="font-medium truncate">{g.name}</span>{g.is_community && <Badge variant="secondary" className="text-[10px]">Community</Badge>}</div>
          <div className="truncate text-sm text-muted-foreground">{g.last_message?.body ?? `${g.member_count} member${g.member_count === 1 ? "" : "s"}`}</div>
        </div>
      </Link>)}</div>
    </>}
  </div></AppShell>;
}
