import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { submitAd, previewAdPrice, listMyAds, uploadAdImage, PLACEMENTS } from "@/lib/ads.functions";
import { fileToBase64, ImageUploadField } from "@/components/image-upload-field";
import { AdSettingsGuide } from "@/routes/_authenticated/admin/ads";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ads")({
  head: () => ({ meta: [
    { title: "Promote your quiz — HaniLearn-QZ" },
    { name: "description", content: "Submit a sponsored ad to reach more learners across HaniLearn-QZ." },
    { property: "og:title", content: "Promote your quiz — HaniLearn-QZ" },
    { property: "og:description", content: "Create a sponsored ad card." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: CreatorAdsPage,
});

const naira = (kobo: number) => `₦${(Number(kobo || 0) / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

type FormState = {
  title: string; body: string; image_url: string; cta_label: string; cta_url: string;
  placements: string[]; weight: number; every_n: number; frequency_minutes: number; days: number;
  use_free_tier: boolean;
};

const emptyForm: FormState = {
  title: "", body: "", image_url: "", cta_label: "", cta_url: "",
  placements: [], weight: 10, every_n: 6, frequency_minutes: 30, days: 1, use_free_tier: false,
};

function statusBadge(ad: any) {
  if (ad.status === "approved") return <Badge>Approved{ad.active ? "" : " (off)"}</Badge>;
  if (ad.status === "rejected") return <Badge variant="destructive">Rejected</Badge>;
  return <Badge variant="secondary">Pending review</Badge>;
}

function CreatorAdsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const submitFn = useServerFn(submitAd);
  const previewFn = useServerFn(previewAdPrice);
  const listFn = useServerFn(listMyAds);
  const uploadFn = useServerFn(uploadAdImage);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [preview, setPreview] = useState<{ price_kobo: number; breakdown: { label: string; amount_kobo: number }[]; is_free: boolean; eligible_for_free: boolean } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const { data: myAds, isLoading } = useQuery({ queryKey: ["my-ads"], queryFn: () => listFn() });

  useEffect(() => {
    if (!form.placements.length) { setPreview(null); return; }
    let cancelled = false;
    setPreviewing(true);
    const t = setTimeout(async () => {
      try {
        const res = await previewFn({ data: {
          days: form.days, placementsCount: form.placements.length, weight: form.weight,
          frequencyMinutes: form.frequency_minutes, use_free_tier: form.use_free_tier,
        } });
        if (!cancelled) setPreview(res as any);
      } catch {
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [form.days, form.placements.length, form.weight, form.frequency_minutes, form.use_free_tier, previewFn]);

  const submit = useMutation({
    mutationFn: () => submitFn({ data: {
      title: form.title, body: form.body || null, image_url: form.image_url || null,
      cta_label: form.cta_label || null, cta_url: form.cta_url || null,
      placements: form.placements as any, weight: form.weight, every_n: form.every_n,
      frequency_minutes: form.frequency_minutes, days: form.days, use_free_tier: form.use_free_tier,
    } }),
    onSuccess: (ad: any) => {
      qc.invalidateQueries({ queryKey: ["my-ads"] });
      setForm(emptyForm);
      setPreview(null);
      if (ad.is_free) {
        toast.success("Ad submitted for free and is pending admin approval.");
      } else {
        toast.success(`Ad "${ad.title}" submitted — pending approval. Upload your receipt for ${naira(ad.price_kobo)} in Wallet.`, { duration: 8000 });
        navigate({ to: "/wallet" });
      }
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to submit ad"),
  });

  function togglePlacement(p: string) {
    setForm((f) => ({ ...f, placements: f.placements.includes(p) ? f.placements.filter((x) => x !== p) : [...f.placements, p] }));
  }

  async function uploadImage(file: File) {
    const base64 = await fileToBase64(file);
    const res = await uploadFn({ data: { filename: file.name, content_type: file.type, base64 } });
    if (!res.url) throw new Error("Upload failed");
    return res.url;
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-2xl px-3 py-6 sm:px-4">
        <div className="mb-4">
          <h1 className="text-lg font-semibold">Promote with an ad</h1>
          <p className="text-sm text-muted-foreground">Submit a sponsored card. It goes live once an admin approves it.</p>
        </div>

        <Card className="mb-6">
          <CardHeader className="pb-2"><CardTitle className="text-sm">New ad</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <AdSettingsGuide />
            <div className="space-y-1">
              <Label className="text-xs">Title</Label>
              <Input value={form.title} maxLength={120} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Body</Label>
              <Textarea value={form.body} maxLength={500} rows={3} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
            </div>
            <ImageUploadField label="Image" value={form.image_url} onChange={(url) => setForm((f) => ({ ...f, image_url: url }))} upload={uploadImage} />
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
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Weight (1-100)</Label>
                <Input type="number" min={1} max={100} value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Frequency (min)</Label>
                <Input type="number" min={1} max={1440} value={form.frequency_minutes} onChange={(e) => setForm((f) => ({ ...f, frequency_minutes: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Days</Label>
                <Input type="number" min={1} max={365} value={form.days} onChange={(e) => setForm((f) => ({ ...f, days: Number(e.target.value) }))} />
              </div>
            </div>

            {preview?.eligible_for_free && (
              <label className="flex items-center gap-2 rounded-lg border p-2 text-xs">
                <Switch checked={form.use_free_tier} onCheckedChange={(v) => setForm((f) => ({ ...f, use_free_tier: v }))} />
                Use my free ad slot this month (within free limits)
              </label>
            )}

            <div className="rounded-lg border p-3 text-xs">
              <div className="mb-1 flex items-center justify-between font-medium">
                <span>Estimated price</span>
                <span>{previewing ? "…" : preview ? (preview.is_free ? "Free" : naira(preview.price_kobo)) : "Add placements to see price"}</span>
              </div>
              {preview && preview.breakdown.length > 0 && (
                <ul className="space-y-0.5 text-muted-foreground">
                  {preview.breakdown.map((b, i) => (
                    <li key={i} className="flex items-center justify-between">
                      <span>{b.label}</span>
                      <span>{naira(b.amount_kobo)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {!preview?.is_free && preview && (
                <p className="mt-2 text-muted-foreground">
                  After submitting, you'll be sent to Wallet to upload a payment receipt for this amount, referencing your ad title.
                </p>
              )}
            </div>

            <Button
              className="w-full"
              onClick={() => submit.mutate()}
              disabled={submit.isPending || !form.title || form.placements.length === 0}
            >
              {submit.isPending ? "Submitting…" : "Submit ad for review"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Your ads</h2>
          {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {(myAds ?? []).map((ad: any) => (
            <Card key={ad.id}>
              <CardContent className="space-y-1 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-medium">{ad.title}</div>
                  {statusBadge(ad)}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{ad.is_free ? "Free" : naira(ad.price_kobo)}</span>
                  <span>·</span>
                  <span>{ad.is_free ? "N/A" : ad.paid_at ? "Payment received" : "Awaiting payment"}</span>
                  {ad.review_note && <><span>·</span><span>Note: {ad.review_note}</span></>}
                </div>
              </CardContent>
            </Card>
          ))}
          {!isLoading && (myAds ?? []).length === 0 && (
            <div className="text-sm text-muted-foreground">You haven't submitted any ads yet.</div>
          )}
        </div>
      </main>
    </div>
  );
}
