import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { adminBroadcast, adminNotificationStats, generateNotificationDrafts, adminSendTestPush, pushDiagnostics, adminRunDailyAiNotifyNow, getAiNotificationImages, setAiNotificationImages } from "@/lib/notifications.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Send, Megaphone, Sparkles, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/notifications")({
  head: () => ({ meta: [
    { title: "Broadcast notifications — Admin" },
    { name: "description", content: "Send and monitor platform-wide notification broadcasts." },
    { property: "og:title", content: "Broadcast notifications — Admin" },
    { property: "og:description", content: "Send and monitor platform-wide notification broadcasts." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AdminNotifications,
});

function BellTestIcon() { return <Megaphone className="h-3.5 w-3.5" />; }

function AdminNotifications() {
  const qc = useQueryClient();
  const broadcastFn = useServerFn(adminBroadcast);
  const statsFn = useServerFn(adminNotificationStats);
  const { data: stats } = useQuery({ queryKey: ["admin-notification-stats"], queryFn: () => statsFn() });

  type Audience = "all" | "creators" | "students" | "low_credit" | "inactive";
  const [form, setForm] = useState({ title: "", body: "", link: "", image_url: "", audience: "all" as Audience });
  const draftsFn = useServerFn(generateNotificationDrafts);
  const testPushFn = useServerFn(adminSendTestPush);
  const [drafts, setDrafts] = useState<any[]>([]);

  const send = useMutation({
    mutationFn: () => broadcastFn({ data: { ...form, body: form.body || undefined, link: form.link || undefined, image_url: form.image_url || undefined } }),
    onSuccess: (res: any) => {
      toast.success(`Sent to ${res.sent} user(s)`);
      setForm({ title: "", body: "", link: "", image_url: "", audience: "all" });
      qc.invalidateQueries({ queryKey: ["admin-notification-stats"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const generate = useMutation({
    mutationFn: () => draftsFn({ data: { count: 6 } }),
    onSuccess: (res: any) => { setDrafts(res.drafts); toast.success(res.source === "ai" ? "AI drafts ready" : "Loaded starter drafts (AI unavailable)"); },
    onError: (e: any) => toast.error(e.message),
  });

  const sendDraft = useMutation({
    mutationFn: (d: any) => broadcastFn({ data: { title: d.title, body: d.body, link: d.link, audience: d.audience } }),
    onSuccess: (res: any, d: any) => {
      toast.success(`Sent "${d.title}" to ${res.sent} user(s)`);
      setDrafts((prev) => prev.filter((x) => x.id !== d.id));
      qc.invalidateQueries({ queryKey: ["admin-notification-stats"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const testPush = useMutation({
    mutationFn: () => testPushFn(),
    onSuccess: (res: any) => toast.success(`Test push: attempted ${res.attempted}, delivered ${res.sent} (statuses: ${res.statuses?.join(", ") || "n/a"})`),
    onError: (e: any) => toast.error(e.message),
  });

  const diagFn = useServerFn(pushDiagnostics);
  const runDailyFn = useServerFn(adminRunDailyAiNotifyNow);
  const imagesFn = useServerFn(getAiNotificationImages);
  const saveImagesFn = useServerFn(setAiNotificationImages);
  const { data: diag } = useQuery({ queryKey: ["push-diagnostics"], queryFn: () => diagFn() });
  const { data: imagesData } = useQuery({ queryKey: ["ai-notif-images"], queryFn: () => imagesFn() });
  const [imagesText, setImagesText] = useState<string | null>(null);
  const imagesValue = imagesText ?? (imagesData?.images ?? []).join("\n");

  const runDaily = useMutation({
    mutationFn: () => runDailyFn(),
    onSuccess: (res: any) => toast.success(`Daily batch: ${res?.sent ?? res?.processed ?? 0} tailored notification(s) sent`),
    onError: (e: any) => toast.error(e.message),
  });

  const saveImages = useMutation({
    mutationFn: () => saveImagesFn({ data: { images: imagesValue.split("\n").map((s) => s.trim()).filter(Boolean) } }),
    onSuccess: () => { toast.success("Image rotation saved"); qc.invalidateQueries({ queryKey: ["ai-notif-images"] }); },
    onError: (e: any) => toast.error(e.message),
  });


  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Broadcast notifications</h1>
        <p className="text-sm text-muted-foreground">Send a notification to a group of users.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Sent (7d)</p><p className="text-2xl font-bold">{stats?.sent_7d ?? 0}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Sent (30d)</p><p className="text-2xl font-bold">{stats?.sent_30d ?? 0}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Read rate (7d)</p><p className="text-2xl font-bold">{stats?.read_rate_7d ?? 0}%</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Megaphone className="h-4 w-4" /> Compose broadcast</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1"><Label className="text-xs">Audience</Label>
            <Select value={form.audience} onValueChange={(v) => setForm((f) => ({ ...f, audience: v as any }))}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                <SelectItem value="creators">Creators</SelectItem>
                <SelectItem value="students">Students (non-creators)</SelectItem>
                <SelectItem value="low_credit">Low AI credit</SelectItem>
                <SelectItem value="inactive">Inactive (14d+)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Title</Label><Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="New feature launched!" /></div>
          <div className="space-y-1"><Label className="text-xs">Body</Label><Textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} placeholder="Details…" rows={3} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label className="text-xs">Link (optional)</Label><Input value={form.link} onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))} placeholder="/explore" /></div>
            <div className="space-y-1"><Label className="text-xs">Image URL (optional)</Label><Input value={form.image_url} onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))} placeholder="https://…" /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="gap-1" disabled={!form.title.trim() || send.isPending} onClick={() => send.mutate()}>
              <Send className="h-4 w-4" /> Send broadcast
            </Button>
            <Button variant="outline" size="sm" className="gap-1" onClick={() => testPush.mutate()} disabled={testPush.isPending}>
              {testPush.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellTestIcon />} Send test push to me
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm"><Sparkles className="h-4 w-4" /> AI notification composer</CardTitle>
          <CardDescription className="text-xs">Generates tips, low-credit nudges, new-quiz alerts and creator upsells. Falls back to a static library if AI is unavailable.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="secondary" size="sm" className="gap-1" onClick={() => generate.mutate()} disabled={generate.isPending}>
            {generate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Generate batch
          </Button>
          {!!drafts.length && (
            <div className="space-y-2">
              {drafts.map((d) => (
                <div key={d.id} className="rounded-md border p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] uppercase">{d.kind.replace(/_/g, " ")}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{d.audience}</Badge>
                  </div>
                  <Input className="mb-2 h-8 text-sm font-medium" value={d.title} onChange={(e) => setDrafts((prev) => prev.map((x) => (x.id === d.id ? { ...x, title: e.target.value } : x)))} />
                  <Textarea className="mb-2 text-xs" rows={2} value={d.body} onChange={(e) => setDrafts((prev) => prev.map((x) => (x.id === d.id ? { ...x, body: e.target.value } : x)))} />
                  <div className="flex items-center justify-between gap-2">
                    <Input className="h-8 max-w-40 text-xs" value={d.link} onChange={(e) => setDrafts((prev) => prev.map((x) => (x.id === d.id ? { ...x, link: e.target.value } : x)))} />
                    <Button size="sm" className="gap-1" onClick={() => sendDraft.mutate(d)} disabled={sendDraft.isPending}>
                      <Send className="h-3.5 w-3.5" /> Send now
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm"><Sparkles className="h-4 w-4" /> Automatic daily AI notifications</CardTitle>
          <CardDescription className="text-xs">
            Runs itself every day — each user gets their own tailored message with a link into the app. No button needed; the button below is only a manual backup.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-lg border p-2"><p className="text-muted-foreground">Push configured</p><p className="font-semibold">{diag ? (diag.vapid_configured ? "Yes" : "No") : "…"}</p></div>
            <div className="rounded-lg border p-2"><p className="text-muted-foreground">Your devices</p><p className="font-semibold">{diag?.my_subscription_count ?? "…"}</p></div>
            <div className="rounded-lg border p-2"><p className="text-muted-foreground">All devices</p><p className="font-semibold">{diag?.total_subscription_count ?? "…"}</p></div>
            <div className="rounded-lg border p-2"><p className="text-muted-foreground">Daily job key</p><p className="font-semibold">{diag ? (diag.cron_secret_configured ? "Set" : "Missing") : "…"}</p></div>
          </div>
          {diag && diag.my_subscription_count === 0 && (
            <p className="rounded-lg bg-muted p-2 text-xs text-muted-foreground">
              This device has no push subscription yet — open Notifications and allow notifications on this phone, then test again.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-1" onClick={() => testPush.mutate()} disabled={testPush.isPending}>
              <BellTestIcon /> Test push to me
            </Button>
            <Button size="sm" variant="secondary" className="gap-1" onClick={() => runDaily.mutate()} disabled={runDaily.isPending}>
              {runDaily.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Run today's batch now
            </Button>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Motivation image rotation (one URL per line)</Label>
            <Textarea
              rows={3}
              value={imagesText}
              onChange={(e) => setImagesText(e.target.value)}
              placeholder="https://…/study-motivation.jpg"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] text-muted-foreground">Curated list, rotated automatically. Pinterest scraping isn't used — paste any image links you like.</p>
              <Button size="sm" variant="ghost" onClick={() => saveImages.mutate()} disabled={saveImages.isPending}>Save</Button>
            </div>
          </div>
        </CardContent>
      </Card>


      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Recent broadcasts</CardTitle><CardDescription className="text-xs">Deduplicated view — one row per send.</CardDescription></CardHeader>
        <CardContent className="divide-y p-0">
          {!stats?.recent_broadcasts?.length && <p className="p-4 text-center text-xs text-muted-foreground">No broadcasts yet.</p>}
          {(stats?.recent_broadcasts ?? []).map((b: any, i: number) => (
            <div key={i} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{b.title}</p>
                {b.body && <p className="truncate text-xs text-muted-foreground">{b.body}</p>}
                <p className="text-[10px] text-muted-foreground">{new Date(b.created_at).toLocaleString()}</p>
              </div>
              <Badge variant="secondary">{b.count} sent</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
