import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, BellRing, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getVapidPublicKey, listMyNotifications, markNotificationsRead, savePushSubscription } from "@/lib/notifications.functions";
import { supabase } from "@/integrations/supabase/client";

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function NotificationBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const listFn = useServerFn(listMyNotifications);
  const markFn = useServerFn(markNotificationsRead);
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const { data } = useQuery({ queryKey: ["notifications"], queryFn: () => listFn(), refetchInterval: 30000 });
  const markAll = useMutation({
    mutationFn: () => markFn({ data: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    supabase.auth.getUser().then(({ data: u }) => setUserId(u.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !userId) return;
    // Unique topic per mounted bell (mobile + desktop nav both render one),
    // otherwise the second mount calls .on() on an already-subscribed channel.
    const channel = supabase
      .channel(`notifications-${userId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload) => {
        qc.invalidateQueries({ queryKey: ["notifications"] });
        try {
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            const row: any = payload.new;
            new Notification(row.title, { body: row.body ?? undefined });
          }
        } catch { /* noop */ }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, qc]);

  const notifications = data?.notifications ?? [];
  const unread = data?.unread_count ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className="relative">
          {unread > 0 ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
          {unread > 0 && (
            <Badge className="absolute -right-1 -top-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]">
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b p-2">
          <span className="text-sm font-semibold">Notifications</span>
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => markAll.mutate()} disabled={markAll.isPending || unread === 0}>
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </Button>
        </div>
        <ScrollArea className="h-80">
          {!notifications.length && <p className="p-4 text-center text-xs text-muted-foreground">No notifications yet.</p>}
          <div className="divide-y">
            {notifications.map((n: any) => (
              <button
                key={n.id}
                onClick={() => {
                  setOpen(false);
                  if (!n.read_at) markFn({ data: { ids: [n.id] } }).then(() => qc.invalidateQueries({ queryKey: ["notifications"] }));
                  if (n.link) navigate({ to: n.link });
                }}
                className="flex w-full items-start gap-2 p-3 text-left text-sm hover:bg-accent/40"
              >
                {!n.read_at && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                <div className={`min-w-0 flex-1 ${n.read_at ? "opacity-70" : ""}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">{n.title}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                  </div>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

let cachedVapidKey: string | null | undefined;

/** Subscribes (or re-subscribes with the correct VAPID key) and persists the subscription. */
export async function ensurePushSubscription(
  saveFn: (opts: { data: { endpoint: string; p256dh?: string; auth?: string } }) => Promise<unknown>,
  fetchVapidKey: () => Promise<{ publicKey: string | null }>,
): Promise<"granted" | "denied" | "unsupported" | "error"> {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  try {
    if (Notification.permission !== "granted") return Notification.permission === "denied" ? "denied" : "error";
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    let vapidKey = (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY as string | undefined;
    if (!vapidKey) {
      if (cachedVapidKey === undefined) {
        const r = await fetchVapidKey().catch(() => ({ publicKey: null }));
        cachedVapidKey = r.publicKey;
      }
      vapidKey = cachedVapidKey ?? undefined;
    }

    let sub = await reg.pushManager.getSubscription();
    // A subscription created before VAPID was wired up has no applicationServerKey — recreate it.
    const hasKeyMismatch = sub && vapidKey && !(sub.options as any)?.applicationServerKey;
    if (sub && (hasKeyMismatch || !vapidKey)) {
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        ...(vapidKey ? { applicationServerKey: urlBase64ToUint8Array(vapidKey) } : {}),
      });
    }
    const json = sub.toJSON() as any;
    if (!json.endpoint) return "error";
    await saveFn({ data: { endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth } });
    return "granted";
  } catch (e) {
    console.warn("[ensurePushSubscription] failed", e);
    return "error";
  }
}

const AUTO_PROMPT_KEY = "hlqz_push_prompt_attempted_v1";

/** Mounted once in the authenticated shell: silently asks for notification permission on first visit. */
export function AutoPushPrompt() {
  const saveFn = useServerFn(savePushSubscription);
  const vapidFn = useServerFn(getVapidPublicKey);

  useEffect(() => {
    if (typeof window === "undefined" || typeof Notification === "undefined") return;
    if (Notification.permission !== "default") {
      if (Notification.permission === "granted") void ensurePushSubscription(saveFn as any, vapidFn as any);
      return;
    }
    let attempted = false;
    try { attempted = localStorage.getItem(AUTO_PROMPT_KEY) === "1"; } catch { /* noop */ }
    if (attempted) return;
    const t = setTimeout(async () => {
      try { localStorage.setItem(AUTO_PROMPT_KEY, "1"); } catch { /* noop */ }
      try {
        const perm = await Notification.requestPermission();
        if (perm === "granted") await ensurePushSubscription(saveFn as any, vapidFn as any);
      } catch { /* denial or unsupported: fail silently, never spam again */ }
    }, 1500);
    return () => clearTimeout(t);
  }, [saveFn, vapidFn]);

  return null;
}

export function EnableNotificationsButton({ className }: { className?: string }) {
  const saveFn = useServerFn(savePushSubscription);
  const vapidFn = useServerFn(getVapidPublicKey);
  const [status, setStatus] = useState<"idle" | "granted" | "denied" | "unsupported">("idle");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof Notification === "undefined") { setStatus("unsupported"); return; }
    if (Notification.permission === "granted") setStatus("granted");
    else if (Notification.permission === "denied") setStatus("denied");
  }, []);

  const enable = async () => {
    if (typeof window === "undefined" || typeof Notification === "undefined") { setStatus("unsupported"); return; }
    try {
      const perm = await Notification.requestPermission();
      setStatus(perm === "granted" ? "granted" : perm === "denied" ? "denied" : "idle");
      if (perm !== "granted") return;
      await ensurePushSubscription(saveFn as any, vapidFn as any);
    } catch (e) {
      console.warn("[EnableNotificationsButton] falling back to in-app only", e);
    }
  };

  if (status === "granted") return null;
  return (
    <Button size="sm" className={className} onClick={enable} disabled={status === "denied"}>
      {status === "denied" ? "Notifications blocked" : "Enable notifications"}
    </Button>
  );
}
