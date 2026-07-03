import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listCreators, grantCreator, revokeCreator } from "@/lib/creators.functions";
import { listQuizzesByCreator } from "@/lib/quizzes.functions";
import { getAiUsageLeaderboard } from "@/lib/analytics.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Shield, ShieldCheck, ShieldOff, Search, ListChecks, Sparkles } from "lucide-react";


export const Route = createFileRoute("/_authenticated/admin/creators")({
  component: CreatorsAdmin,
});

function CreatorsAdmin() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCreators);
  const grantFn = useServerFn(grantCreator);
  const revokeFn = useServerFn(revokeCreator);
  const quizzesFn = useServerFn(listQuizzesByCreator);
  const aiFn = useServerFn(getAiUsageLeaderboard);
  const { data, isLoading } = useQuery({ queryKey: ["creators-list"], queryFn: () => listFn() });
  const { data: aiUsage } = useQuery({ queryKey: ["ai-usage-30"], queryFn: () => aiFn({ data: { days: 30 } }) });
  const [editing, setEditing] = useState<any | null>(null);
  const [reviewing, setReviewing] = useState<any | null>(null);
  const [q, setQ] = useState("");
  const [creatorsOnly, setCreatorsOnly] = useState(false);

  const grant = useMutation({
    mutationFn: (payload: any) => grantFn({ data: payload }),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["creators-list"] }); setEditing(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: (user_id: string) => revokeFn({ data: { user_id } }),
    onSuccess: () => { toast.success("Revoked"); qc.invalidateQueries({ queryKey: ["creators-list"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const usageMap = useMemo(() => {
    const m = new Map<string, any>();
    (aiUsage ?? []).forEach((r: any) => m.set(r.user_id, r));
    return m;
  }, [aiUsage]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter((u: any) => {
      if (creatorsOnly && !(u.roles.includes("creator") || u.permissions || u.roles.includes("admin"))) return false;
      if (!term) return true;
      return (u.full_name ?? "").toLowerCase().includes(term)
        || (u.email ?? "").toLowerCase().includes(term)
        || (u.user_id ?? "").toLowerCase().includes(term);
    });
  }, [data, q, creatorsOnly]);

  const bulkAi = (enabled: boolean) => {
    const targets = (data ?? []).filter((u: any) => u.permissions);
    if (!targets.length) { toast.info("No creators with permissions to update."); return; }
    if (!confirm(`${enabled ? "Enable" : "Disable"} AI for ${targets.length} creators?`)) return;
    Promise.all(targets.map((u: any) => grantFn({ data: {
      user_id: u.user_id,
      ai_enabled: enabled,
      analytics_enabled: u.permissions.analytics_enabled ?? true,
      can_publish: u.permissions.can_publish ?? true,
      max_quizzes: u.permissions.max_quizzes ?? 10,
      notes: u.permissions.notes ?? null,
    } }))).then(() => {
      toast.success("Bulk update complete");
      qc.invalidateQueries({ queryKey: ["creators-list"] });
    }).catch((e: any) => toast.error(e.message));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="h-6 w-6" />Creators & permissions</h1>
          <p className="text-muted-foreground text-sm">Grant creator access, gate AI + analytics, and review AI spend per user.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => bulkAi(true)}><Sparkles className="h-3.5 w-3.5 mr-1" />Enable AI (all)</Button>
          <Button size="sm" variant="outline" onClick={() => bulkAi(false)}>Disable AI (all)</Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or id…" className="pl-8" />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={creatorsOnly} onCheckedChange={setCreatorsOnly} /> Creators only
        </label>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Users ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
          <div className="divide-y">
            {filtered.map((u: any) => {
              const isCreator = u.roles.includes("creator") || u.permissions;
              const isAdmin = u.roles.includes("admin") || u.roles.includes("super_admin");
              const usage = usageMap.get(u.user_id);
              return (
                <div key={u.user_id} className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-sm">{u.full_name || u.email || u.user_id}</div>
                    <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {isAdmin && <Badge>Admin</Badge>}
                      {isCreator && !isAdmin && <Badge variant="secondary">Creator</Badge>}
                      {u.permissions?.ai_enabled && <Badge variant="outline">AI on</Badge>}
                      {u.permissions?.can_publish === false && <Badge variant="destructive" className="text-[10px]">Publish off</Badge>}
                      {u.permissions && <Badge variant="outline">Cap {u.permissions.max_quizzes}</Badge>}
                      {usage && <Badge variant="outline" className="text-[10px]">{usage.calls} AI · {usage.credits} cr</Badge>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {isCreator && (
                      <Button size="sm" variant="ghost" onClick={() => setReviewing(u)} title="Review quizzes">
                        <ListChecks className="h-4 w-4" />
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setEditing(u)}>
                      <ShieldCheck className="h-4 w-4 mr-1" />{isCreator ? "Edit" : "Grant"}
                    </Button>
                    {isCreator && !isAdmin && (
                      <Button size="sm" variant="ghost" onClick={() => revoke.mutate(u.user_id)} title="Revoke creator">
                        <ShieldOff className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <EditForm
            user={editing}
            saving={grant.isPending}
            onSave={(v: any) => grant.mutate({ user_id: editing.user_id, ...v })}
          />
        )}
      </Dialog>

      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        {reviewing && <ReviewQuizzes user={reviewing} fetchFn={quizzesFn} />}
      </Dialog>
    </div>
  );
}

function ReviewQuizzes({ user, fetchFn }: any) {
  const { data, isLoading } = useQuery({
    queryKey: ["creator-quizzes", user.user_id],
    queryFn: () => fetchFn({ data: { user_id: user.user_id } }),
  });
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>Quizzes by {user.full_name || user.email}</DialogTitle></DialogHeader>
      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      <div className="divide-y max-h-[60vh] overflow-y-auto -mx-6 px-6">
        {(data ?? []).map((q: any) => (
          <div key={q.id} className="py-2 flex items-center gap-2 text-sm">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{q.title}</div>
              <div className="text-xs text-muted-foreground">{q.category} · {q.difficulty} · {new Date(q.created_at).toLocaleDateString()}</div>
            </div>
            <div className="flex gap-1">
              {q.is_published ? <Badge>Published</Badge> : <Badge variant="secondary">Draft</Badge>}
              <Badge variant="outline">{q.visibility}</Badge>
            </div>
          </div>
        ))}
        {!isLoading && !(data ?? []).length && <div className="py-6 text-sm text-muted-foreground text-center">No quizzes yet.</div>}
      </div>
    </DialogContent>
  );
}


function EditForm({ user, saving, onSave }: any) {
  const p = user.permissions ?? {};
  const [ai, setAi] = useState<boolean>(p.ai_enabled ?? false);
  const [an, setAn] = useState<boolean>(p.analytics_enabled ?? true);
  const [pub, setPub] = useState<boolean>(p.can_publish ?? true);
  const [max, setMax] = useState<number>(p.max_quizzes ?? 10);
  const [notes, setNotes] = useState<string>(p.notes ?? "");
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Creator permissions — {user.full_name || user.email}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <Row label="AI parsing" v={ai} set={setAi} />
        <Row label="Analytics" v={an} set={setAn} />
        <Row label="Can publish" v={pub} set={setPub} />
        <label className="text-sm block">Quiz cap
          <Input type="number" min={0} value={max} onChange={(e) => setMax(parseInt(e.target.value) || 0)} />
        </label>
        <label className="text-sm block">Notes
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes" />
        </label>
      </div>
      <DialogFooter>
        <Button disabled={saving} onClick={() => onSave({ ai_enabled: ai, analytics_enabled: an, can_publish: pub, max_quizzes: max, notes })}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
function Row({ label, v, set }: { label: string; v: boolean; set: (b: boolean) => void }) {
  return <div className="flex items-center justify-between"><span className="text-sm">{label}</span><Switch checked={v} onCheckedChange={set} /></div>;
}
