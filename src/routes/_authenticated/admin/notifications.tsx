import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { adminBroadcast, adminNotificationStats } from "@/lib/notifications.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Send, Megaphone } from "lucide-react";

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

function AdminNotifications() {
  const qc = useQueryClient();
  const broadcastFn = useServerFn(adminBroadcast);
  const statsFn = useServerFn(adminNotificationStats);
  const { data: stats } = useQuery({ queryKey: ["admin-notification-stats"], queryFn: () => statsFn() });

  const [form, setForm] = useState({ title: "", body: "", link: "", image_url: "", audience: "all" as "all" | "creators" | "students" });

  const send = useMutation({
    mutationFn: () => broadcastFn({ data: { ...form, body: form.body || undefined, link: form.link || undefined, image_url: form.image_url || undefined } }),
    onSuccess: (res: any) => {
      toast.success(`Sent to ${res.sent} user(s)`);
      setForm({ title: "", body: "", link: "", image_url: "", audience: "all" });
      qc.invalidateQueries({ queryKey: ["admin-notification-stats"] });
    },
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
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Title</Label><Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="New feature launched!" /></div>
          <div className="space-y-1"><Label className="text-xs">Body</Label><Textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} placeholder="Details…" rows={3} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label className="text-xs">Link (optional)</Label><Input value={form.link} onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))} placeholder="/explore" /></div>
            <div className="space-y-1"><Label className="text-xs">Image URL (optional)</Label><Input value={form.image_url} onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))} placeholder="https://…" /></div>
          </div>
          <Button className="gap-1" disabled={!form.title.trim() || send.isPending} onClick={() => send.mutate()}>
            <Send className="h-4 w-4" /> Send broadcast
          </Button>
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
