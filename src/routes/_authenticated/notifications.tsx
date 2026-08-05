import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listMyNotifications, markNotificationsRead } from "@/lib/notifications.functions";
import { getMyCreatorStatus } from "@/lib/creators.functions";
import { AppShell } from "@/components/app-nav";
import { EnableNotificationsButton } from "@/components/notification-bell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, CheckCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [
    { title: "Notifications — HaniLearn-QZ" },
    { name: "description", content: "All your HaniLearn-QZ notifications in one place." },
    { property: "og:title", content: "Notifications — HaniLearn-QZ" },
    { property: "og:description", content: "All your HaniLearn-QZ notifications in one place." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: NotificationsPage,
});

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function NotificationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const listFn = useServerFn(listMyNotifications);
  const markFn = useServerFn(markNotificationsRead);
  const statusFn = useServerFn(getMyCreatorStatus);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const { data, isLoading } = useQuery({ queryKey: ["notifications"], queryFn: () => listFn() });
  const { data: status } = useQuery({ queryKey: ["creator-status"], queryFn: () => statusFn() });
  const markAll = useMutation({ mutationFn: () => markFn({ data: {} }), onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }) });

  const notifications = (data?.notifications ?? []).filter((n: any) => filter === "all" || !n.read_at);

  return (
    <AppShell isSuperAdmin={status?.is_super_admin}>
      <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            <p className="text-sm text-muted-foreground">{data?.unread_count ?? 0} unread</p>
          </div>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => markAll.mutate()} disabled={markAll.isPending || !(data?.unread_count ?? 0)}>
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Push notifications</CardTitle>
            <CardDescription className="text-xs">Get notified even when HaniLearn-QZ isn't open.</CardDescription>
          </CardHeader>
          <CardContent><EnableNotificationsButton /></CardContent>
        </Card>

        <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unread">Unread</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && !notifications.length && (
          <Card><CardContent className="py-12 text-center"><Bell className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">Nothing here</p></CardContent></Card>
        )}
        <div className="divide-y border-y">
          {notifications.map((n: any) => (
            <button
              key={n.id}
              onClick={() => {
                if (!n.read_at) markFn({ data: { ids: [n.id] } }).then(() => qc.invalidateQueries({ queryKey: ["notifications"] }));
                if (n.link) navigate({ to: n.link });
              }}
              className="flex w-full items-start gap-3 py-3 text-left hover:bg-accent/30"
            >
              {!n.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
              <div className={`min-w-0 flex-1 ${n.read_at ? "opacity-70" : ""}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{n.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(n.created_at)}</span>
                </div>
                {n.body && <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
