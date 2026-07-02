import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listCreators, grantCreator, revokeCreator } from "@/lib/creators.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Shield, ShieldCheck, ShieldOff } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/creators")({
  component: CreatorsAdmin,
});

function CreatorsAdmin() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCreators);
  const grantFn = useServerFn(grantCreator);
  const revokeFn = useServerFn(revokeCreator);
  const { data, isLoading } = useQuery({ queryKey: ["creators-list"], queryFn: () => listFn() });
  const [editing, setEditing] = useState<any | null>(null);

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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="h-6 w-6" />Creators</h1>
        <p className="text-muted-foreground text-sm">Grant users creator access and control what they can do.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">All users</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
          <div className="divide-y">
            {(data ?? []).map((u: any) => {
              const isCreator = u.roles.includes("creator") || u.permissions;
              const isAdmin = u.roles.includes("admin") || u.roles.includes("super_admin");
              return (
                <div key={u.user_id} className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-sm">{u.full_name || u.email || u.user_id}</div>
                    <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {isAdmin && <Badge>Admin</Badge>}
                      {isCreator && !isAdmin && <Badge variant="secondary">Creator</Badge>}
                      {u.permissions?.ai_enabled && <Badge variant="outline">AI</Badge>}
                      {u.permissions && <Badge variant="outline">Cap {u.permissions.max_quizzes}</Badge>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setEditing(u)}>
                      <ShieldCheck className="h-4 w-4 mr-1" />{isCreator ? "Edit" : "Grant"}
                    </Button>
                    {isCreator && !isAdmin && (
                      <Button size="sm" variant="ghost" onClick={() => revoke.mutate(u.user_id)}>
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
            onSave={(v) => grant.mutate({ user_id: editing.user_id, ...v })}
          />
        )}
      </Dialog>
    </div>
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
function Row({ label, v, set }: any) {
  return <div className="flex items-center justify-between"><span className="text-sm">{label}</span><Switch checked={v} onCheckedChange={set} /></div>;
}
