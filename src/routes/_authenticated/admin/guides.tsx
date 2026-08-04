import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listGuides, saveGuide, deleteGuide } from "@/lib/support.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/guides")({
  component: Guides,
});

function Guides() {
  const qc = useQueryClient();
  const listFn = useServerFn(listGuides);
  const saveFn = useServerFn(saveGuide);
  const delFn = useServerFn(deleteGuide);
  const { data } = useQuery({ queryKey: ["support-guides"], queryFn: () => listFn() });
  const save = useMutation({
    mutationFn: (g: any) => saveFn({ data: g }),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["support-guides"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support-guides"] }),
  });

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Support guides</h1>
          <p className="text-sm text-muted-foreground">These appear on the public Help & support page.</p>
        </div>
        <Button size="sm" onClick={() => save.mutate({ title: "New guide", body: "", position: (data?.guides?.length ?? 0) + 1, is_published: false })}>
          <Plus className="mr-1 h-4 w-4" />Add guide
        </Button>
      </div>
      {(data?.guides ?? []).map((g: any) => <GuideEditor key={g.id} guide={g} onSave={(v: any) => save.mutate(v)} onDelete={() => remove.mutate(g.id)} />)}
    </div>
  );
}

function GuideEditor({ guide, onSave, onDelete }: any) {
  const [f, setF] = useState({
    id: guide.id, title: guide.title, body: guide.body ?? "",
    link_url: guide.link_url ?? "", link_label: guide.link_label ?? "",
    position: guide.position ?? 0, is_published: !!guide.is_published,
  });
  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{f.title || "Untitled"}</CardTitle>
        <div className="flex items-center gap-2">
          <Switch checked={f.is_published} onCheckedChange={(v) => { setF({ ...f, is_published: v }); onSave({ ...f, is_published: v }); }} />
          <Button size="icon" variant="ghost" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="sm:col-span-3"><Label>Title</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div><Label>Order</Label><Input type="number" value={f.position} onChange={(e) => setF({ ...f, position: parseInt(e.target.value) || 0 })} /></div>
        </div>
        <div><Label>Body</Label><Textarea rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div><Label>Link URL (optional)</Label><Input value={f.link_url} onChange={(e) => setF({ ...f, link_url: e.target.value })} placeholder="https://…" /></div>
          <div><Label>Link label</Label><Input value={f.link_label} onChange={(e) => setF({ ...f, link_label: e.target.value })} placeholder="Watch the walkthrough" /></div>
        </div>
        <Button size="sm" onClick={() => onSave(f)}>Save</Button>
      </CardContent>
    </Card>
  );
}
