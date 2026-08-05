import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { adminListAds, adminUpsertAd, adminDeleteAd, PLACEMENTS } from "@/lib/ads.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, Pencil, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/ads")({
  head: () => ({ meta: [
    { title: "Promo ads — HaniLearn-QZ admin" },
    { name: "description", content: "Manage sponsored promo cards shown across explore, quiz results, wallet and switch screens." },
    { property: "og:title", content: "Promo ads — HaniLearn-QZ admin" },
    { property: "og:description", content: "Create, schedule and track promo ad cards." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AdsAdmin,
});

type FormState = {
  id?: string;
  title: string;
  body: string;
  image_url: string;
  cta_label: string;
  cta_url: string;
  placements: string[];
  active: boolean;
  auto_show: boolean;
  weight: number;
  every_n: number;
  start_at: string;
  end_at: string;
};

const emptyForm: FormState = {
  title: "", body: "", image_url: "", cta_label: "", cta_url: "",
  placements: [], active: true, auto_show: true, weight: 10, every_n: 6, start_at: "", end_at: "",
};

function toIso(local: string) {
  return local ? new Date(local).toISOString() : null;
}

function fromIso(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function AdPreview({ form }: { form: FormState }) {
  return (
    <Card className="relative overflow-hidden">
      {form.image_url && (
        <img src={form.image_url} alt="" className="aspect-video w-full rounded-t-xl object-cover" />
      )}
      <CardContent className="p-4 space-y-2">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sponsored</div>
        <div className="text-sm font-semibold leading-tight">{form.title || "Ad title"}</div>
        {form.body && <p className="text-xs text-muted-foreground leading-snug">{form.body}</p>}
        {form.cta_url && (
          <Button size="sm" className="mt-1 w-full sm:w-auto" type="button">
            {form.cta_label || "Learn more"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function AdsAdmin() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListAds);
  const upsertFn = useServerFn(adminUpsertAd);
  const deleteFn = useServerFn(adminDeleteAd);

  const { data, isLoading } = useQuery({ queryKey: ["admin-ads"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-ads"] });

  const save = useMutation({
    mutationFn: () => upsertFn({ data: {
      id: form.id,
      title: form.title,
      body: form.body || null,
      image_url: form.image_url || null,
      cta_label: form.cta_label || null,
      cta_url: form.cta_url || null,
      placements: form.placements as any,
      active: form.active,
      auto_show: form.auto_show,
      weight: form.weight,
      every_n: form.every_n,
      start_at: toIso(form.start_at),
      end_at: toIso(form.end_at),
    } }),
    onSuccess: () => { toast.success("Ad saved"); invalidate(); setOpen(false); },
    onError: (e: any) => toast.error(e.message ?? "Failed to save ad"),
  });

  const toggleActive = useMutation({
    mutationFn: (ad: any) => upsertFn({ data: { ...adToForm(ad), active: !ad.active } as any }),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Ad deleted"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  function adToForm(ad: any): FormState {
    return {
      id: ad.id, title: ad.title, body: ad.body ?? "", image_url: ad.image_url ?? "",
      cta_label: ad.cta_label ?? "", cta_url: ad.cta_url ?? "", placements: ad.placements ?? [],
      active: ad.active, auto_show: ad.auto_show, weight: ad.weight ?? 10, every_n: ad.every_n ?? 6,
      start_at: fromIso(ad.start_at), end_at: fromIso(ad.end_at),
    };
  }

  function openCreate() { setForm(emptyForm); setOpen(true); }
  function openEdit(ad: any) { setForm(adToForm(ad)); setOpen(true); }

  function togglePlacement(p: string) {
    setForm((f) => ({
      ...f,
      placements: f.placements.includes(p) ? f.placements.filter((x) => x !== p) : [...f.placements, p],
    }));
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-3xl px-3 py-6 sm:px-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">Promo ads</h1>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-4 w-4" />New ad</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
              <DialogHeader><DialogTitle>{form.id ? "Edit ad" : "New ad"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Title</Label>
                  <Input value={form.title} maxLength={120} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Body</Label>
                  <Textarea value={form.body} maxLength={500} rows={3} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Image URL</Label>
                  <Input value={form.image_url} onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">CTA label</Label>
                    <Input value={form.cta_label} maxLength={40} onChange={(e) => setForm((f) => ({ ...f, cta_label: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">CTA URL</Label>
                    <Input value={form.cta_url} onChange={(e) => setForm((f) => ({ ...f, cta_url: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Placements</Label>
                  <div className="flex flex-wrap gap-3">
                    {PLACEMENTS.map((p) => (
                      <label key={p} className="flex items-center gap-1.5 text-xs">
                        <Checkbox checked={form.placements.includes(p)} onCheckedChange={() => togglePlacement(p)} />
                        {p}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Weight (1-100)</Label>
                    <Input type="number" min={1} max={100} value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: Number(e.target.value) }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Every N items (2-30)</Label>
                    <Input type="number" min={2} max={30} value={form.every_n} onChange={(e) => setForm((f) => ({ ...f, every_n: Number(e.target.value) }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Start</Label>
                    <Input type="datetime-local" value={form.start_at} onChange={(e) => setForm((f) => ({ ...f, start_at: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">End</Label>
                    <Input type="datetime-local" value={form.end_at} onChange={(e) => setForm((f) => ({ ...f, end_at: e.target.value }))} />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs">
                    <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
                    Active
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <Switch checked={form.auto_show} onCheckedChange={(v) => setForm((f) => ({ ...f, auto_show: v }))} />
                    Auto-show
                  </label>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Preview</Label>
                  <AdPreview form={form} />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => save.mutate()}
                  disabled={save.isPending || !form.title || form.placements.length === 0}
                >
                  {form.id ? "Save changes" : "Create ad"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

        <div className="space-y-2">
          {(data ?? []).map((ad: any) => (
            <Card key={ad.id}>
              <CardContent className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{ad.title}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(ad.placements ?? []).map((p: string) => (
                        <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(ad)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this ad?</AlertDialogTitle>
                          <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => del.mutate(ad.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">{ad.impressions_7d} views/7d</Badge>
                  <Badge variant="outline" className="text-[10px]">{ad.clicks_7d} clicks/7d</Badge>
                  <Badge variant="outline" className="text-[10px]">CTR {ad.ctr_7d}%</Badge>
                  <span>·</span>
                  <span>weight {ad.weight}</span>
                  <span>·</span>
                  <span>every {ad.every_n}</span>
                  <label className="ml-auto flex items-center gap-1.5">
                    <Switch checked={ad.active} onCheckedChange={() => toggleActive.mutate(ad)} />
                    {ad.active ? "Active" : "Off"}
                  </label>
                </div>
              </CardContent>
            </Card>
          ))}
          {!isLoading && (data ?? []).length === 0 && (
            <div className="text-sm text-muted-foreground">No ads yet.</div>
          )}
        </div>
      </main>
    </div>
  );
}
