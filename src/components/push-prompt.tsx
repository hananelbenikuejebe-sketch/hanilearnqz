import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { getVapidPublicKey, savePushSubscription } from "@/lib/notifications.functions";
import { ensurePushSubscription } from "@/components/notification-bell";

const SEEN_KEY = "hlqz_push_sheet_seen_v1";

/**
 * Self-mounting push-permission funnel. Renders nothing until it decides to show
 * an in-app explainer sheet, then asks for the native permission if the user agrees.
 * Safe to mount anywhere in the authenticated tree (idempotent, no props required).
 *
 * NOTE for the agent that owns __root.tsx: mount <PushPrompt /> once in the
 * authenticated app shell so it runs on first app open.
 */
export function PushPrompt() {
  const saveFn = useServerFn(savePushSubscription);
  const vapidFn = useServerFn(getVapidPublicKey);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Register the service worker unconditionally and idempotently on every mount
  // (production AND preview) so it's ready before permission is ever granted —
  // browsers require an active SW registration before pushManager.subscribe works.
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((e) => {
      console.warn("[PushPrompt] service worker registration failed", e);
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof Notification === "undefined") return;
    if (Notification.permission !== "default") return;
    let seen = false;
    try { seen = sessionStorage.getItem(SEEN_KEY) === "1"; } catch { /* noop */ }
    if (seen) return;
    const t = setTimeout(() => {
      try { sessionStorage.setItem(SEEN_KEY, "1"); } catch { /* noop */ }
      setOpen(true);
    }, 1800);
    return () => clearTimeout(t);
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm === "granted") await ensurePushSubscription(saveFn as any, vapidFn as any);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <BellRing className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle>Never miss a quiz or a top-up reminder</DialogTitle>
          <DialogDescription>
            Turn on notifications to get pinged when new quizzes drop, your AI credit runs low, or someone challenges you — even when HaniLearn-QZ isn't open.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>Not now</Button>
          <Button size="sm" onClick={enable} disabled={busy}>{busy ? "Enabling…" : "Enable notifications"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const QUIZ_PROMPT_KEY = "hlqz_push_quiz_prompted_v1";

/**
 * Call this right before a quiz attempt starts. If permission hasn't been
 * decided yet, it fires the native prompt once per session so the ask stays
 * legal (a single explicit user gesture) without nagging on every quiz.
 */
export async function promptPushBeforeQuizStart(
  saveFn: (opts: { data: { endpoint: string; p256dh?: string; auth?: string } }) => Promise<unknown>,
  fetchVapidKey: () => Promise<{ publicKey: string | null }>,
) {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission !== "default") {
    if (Notification.permission === "granted") await ensurePushSubscription(saveFn, fetchVapidKey);
    return;
  }
  let prompted = false;
  try { prompted = sessionStorage.getItem(QUIZ_PROMPT_KEY) === "1"; } catch { /* noop */ }
  if (prompted) return;
  try { sessionStorage.setItem(QUIZ_PROMPT_KEY, "1"); } catch { /* noop */ }
  try {
    const perm = await Notification.requestPermission();
    if (perm === "granted") await ensurePushSubscription(saveFn, fetchVapidKey);
  } catch { /* noop */ }
}

/** Convenience hook wrapping promptPushBeforeQuizStart with the two server fns wired up. */
export function useQuizStartPushPrompt() {
  const saveFn = useServerFn(savePushSubscription);
  const vapidFn = useServerFn(getVapidPublicKey);
  return () => promptPushBeforeQuizStart(saveFn as any, vapidFn as any);
}
