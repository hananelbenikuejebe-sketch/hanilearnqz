import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouterState } from "@tanstack/react-router";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Tip = { id: string; target: string; title: string; body: string };

const TIPS: Tip[] = [
  { id: "wallet", target: "wallet", title: "Your Wallet", body: "Track AI credit and earnings, and top up any time — never get stuck mid-quiz." },
  { id: "create", target: "create", title: "Create a quiz", body: "Turn any document into a quiz in minutes with AI parsing." },
  { id: "explore", target: "explore", title: "Explore filters", body: "Filter by subject, difficulty and price to find quizzes fast." },
  { id: "messages", target: "messages", title: "Messages", body: "Chat with creators and classmates, and get quiz help directly." },
  { id: "support", target: "support", title: "Help & guides", body: "Stuck? Guides and a walkthrough are one tap away here." },
  { id: "notifications", target: "notifications", title: "Stay in the loop", body: "Enable push notifications so you never miss a new quiz or credit top-up reminder." },
];

const STORAGE_KEY = "hlqz_coachmarks_v1";
const NEXT_SHOW_KEY = "hlqz_coachmarks_next_show";

type Store = { dismissedForever?: boolean; seen?: string[] };

function loadStore(): Store {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
function saveStore(s: Store) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* noop */ }
}

/** Periodic spotlight tour: points at real UI via data-coach="<id>" targets. Never blocks quiz-taking. */
export function CoachMarks() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [active, setActive] = useState<Tip | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const isQuizInProgress = /\/(quiz|attempt|exam)s?\/[^/]+\/(take|play|attempt)/.test(pathname) || pathname.includes("/take");

  const pickNext = useCallback(() => {
    if (isQuizInProgress) return;
    const store = loadStore();
    if (store.dismissedForever) return;
    const seen = new Set(store.seen ?? []);
    const candidates = TIPS.filter((t) => document.querySelector(`[data-coach="${t.target}"]`));
    if (!candidates.length) return;
    const unseen = candidates.filter((t) => !seen.has(t.id));
    const tip = (unseen.length ? unseen : candidates)[Math.floor(Math.random() * (unseen.length ? unseen.length : candidates.length))];
    const el = document.querySelector(`[data-coach="${tip.target}"]`) as HTMLElement | null;
    if (!el) return;
    setActive(tip);
    setRect(el.getBoundingClientRect());
  }, [isQuizInProgress]);

  useEffect(() => {
    let lastShown = 0;
    try { lastShown = Number(localStorage.getItem(NEXT_SHOW_KEY) || 0); } catch { /* noop */ }
    const dueIn = Math.max(4000, lastShown - Date.now());
    const t = setTimeout(pickNext, dueIn);
    const interval = setInterval(pickNext, 45000);
    return () => { clearTimeout(t); clearInterval(interval); };
  }, [pickNext, pathname]);

  const dismiss = (forever: boolean) => {
    if (active) {
      const store = loadStore();
      const seen = new Set(store.seen ?? []);
      seen.add(active.id);
      saveStore({ dismissedForever: forever, seen: Array.from(seen) });
    }
    try { localStorage.setItem(NEXT_SHOW_KEY, String(Date.now() + 40000)); } catch { /* noop */ }
    setActive(null);
    setRect(null);
  };

  if (typeof document === "undefined" || !active || !rect) return null;

  const top = Math.min(window.innerHeight - 160, Math.max(8, rect.bottom + 10));
  const left = Math.min(window.innerWidth - 300, Math.max(8, rect.left));

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[70]">
      <div
        className="pointer-events-none absolute rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background transition-all"
        style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }}
      />
      <div
        className="pointer-events-auto absolute w-[280px] rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg"
        style={{ top, left }}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold">{active.title}</p>
          <button onClick={() => dismiss(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{active.body}</p>
        <div className="mt-2 flex justify-between gap-2">
          <button className="text-[11px] text-muted-foreground underline" onClick={() => dismiss(true)}>Don't show again</button>
          <Button size="sm" className="h-7 text-xs" onClick={() => dismiss(false)}>Got it</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Runs the full tour back-to-back (used by the Support walkthrough button). */
export function useLaunchCoachTour() {
  return useCallback(() => {
    saveStore({ dismissedForever: false, seen: [] });
    try { localStorage.setItem(NEXT_SHOW_KEY, "0"); } catch { /* noop */ }
    window.dispatchEvent(new Event("hlqz-coach-restart"));
    // Simplest reliable way to kick the periodic picker immediately.
    setTimeout(() => window.location.reload(), 50);
  }, []);
}
