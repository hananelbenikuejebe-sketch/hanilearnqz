import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouterState, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateAmbientTip, listSeenTips, markTipSeen, rankTipsByInterest } from "@/lib/tours.functions";
import { supabase } from "@/integrations/supabase/client";

type Tip = { id: string; target: string; title: string; body: string; nudgeTo?: string; nudgeLabel?: string };

/** Static fallback tips — always available even if AI is down or user is a guest. */
const TIPS: Tip[] = [
  { id: "wallet", target: "wallet", title: "Your Wallet", body: "Track AI credit and earnings, and top up any time — never get stuck mid-quiz.", nudgeTo: "/wallet", nudgeLabel: "Top up" },
  { id: "create", target: "create", title: "Create a quiz", body: "Turn any document into a quiz in minutes with AI parsing — and start earning when others take it.", nudgeTo: "/create", nudgeLabel: "Create now" },
  { id: "explore", target: "explore", title: "Explore filters", body: "Filter by subject, difficulty and price to find quizzes fast." },
  { id: "messages", target: "messages", title: "Messages", body: "Chat with creators and classmates, and get quiz help directly." },
  { id: "support", target: "support", title: "Help & guides", body: "Stuck? Guides and a walkthrough are one tap away here." },
  { id: "notifications", target: "notifications", title: "Stay in the loop", body: "Enable push notifications so you never miss a new quiz or credit top-up reminder." },
  { id: "pro", target: "wallet", title: "Go Pro", body: "Heavy user? A Pro plan gives you more AI credit for less — check plans in your Wallet.", nudgeTo: "/wallet", nudgeLabel: "See plans" },
  { id: "price", target: "create", title: "Price your quiz", body: "Creators earn credit every time someone takes a priced quiz. Try pricing yours today.", nudgeTo: "/create", nudgeLabel: "Set a price" },
];

const STORAGE_KEY = "hlqz_coachmarks_v1";
const NEXT_SHOW_KEY = "hlqz_coachmarks_next_show";
const SESSION_COUNT_KEY = "hlqz_coachmarks_session_count";
const MAX_PER_SESSION = 4;
const INTERVAL_MS = 90_000; // ~one tip per 90s, never annoying

type Store = { dismissedForever?: boolean; seen?: string[] };

function loadStore(): Store {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
function saveStore(s: Store) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* noop */ }
}
function sessionCount(): number {
  try { return Number(sessionStorage.getItem(SESSION_COUNT_KEY) || 0); } catch { return 0; }
}
function bumpSessionCount() {
  try { sessionStorage.setItem(SESSION_COUNT_KEY, String(sessionCount() + 1)); } catch { /* noop */ }
}

/** Periodic ambient spotlight: points at real UI via data-coach="<id>" targets. Never blocks quiz-taking. */
export function CoachMarks() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [active, setActive] = useState<Tip | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const generateTip = useServerFn(generateAmbientTip);
  const listSeenFn = useServerFn(listSeenTips);
  const markSeenFn = useServerFn(markTipSeen);
  const rankFn = useServerFn(rankTipsByInterest);
  const aiTipCache = useRef<Map<string, string>>(new Map());
  const remoteSeen = useRef<Set<string> | null>(null);
  const rankedOrder = useRef<string[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;
        const r = await listSeenFn();
        remoteSeen.current = new Set(r?.tipIds ?? []);
        try {
          const ranked = await rankFn({ data: { tipIds: TIPS.map((t) => t.id) } });
          rankedOrder.current = ranked?.tipIds ?? null;
        } catch { /* ranking is optional */ }
      } catch { /* stay on local-only rotation */ }
    })();
  }, [listSeenFn, rankFn]);

  const isQuizInProgress = /\/(quiz|attempt|exam)s?\/[^/]+\/(take|play|attempt)/.test(pathname) || pathname.includes("/take");

  const pickNext = useCallback(() => {
    if (isQuizInProgress) return;
    if (sessionCount() >= MAX_PER_SESSION) return;
    const store = loadStore();
    if (store.dismissedForever) return;
    const seen = new Set([...(store.seen ?? []), ...(remoteSeen.current ?? [])]);
    let candidates = TIPS.filter((t) => document.querySelector(`[data-coach="${t.target}"]`));
    if (!candidates.length) return;
    if (rankedOrder.current) {
      const order = rankedOrder.current;
      candidates = [...candidates].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    }
    const unseen = candidates.filter((t) => !seen.has(t.id));
    // Rotate: always prefer a fresh tip so returning users see something new.
    const pool = unseen.length ? unseen : candidates;
    const tip = rankedOrder.current ? pool[0] : pool[Math.floor(Math.random() * pool.length)];
    const el = document.querySelector(`[data-coach="${tip.target}"]`) as HTMLElement | null;
    if (!el) return;
    setActive(tip);
    setRect(el.getBoundingClientRect());
    bumpSessionCount();

    // Best-effort: try to enrich with a freshly-generated AI tip for signed-in users.
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;
        const cacheKey = `${pathname}:${tip.id}`;
        const cached = aiTipCache.current.get(cacheKey);
        if (cached) {
          setActive((prev) => (prev && prev.id === tip.id ? { ...prev, body: cached } : prev));
          return;
        }
        const r = await generateTip({ data: { pageContext: `${pathname} — ${tip.title}` } });
        if (r?.tip) {
          aiTipCache.current.set(cacheKey, r.tip);
          setActive((prev) => (prev && prev.id === tip.id ? { ...prev, body: r.tip! } : prev));
        }
      } catch {
        // silent — static fallback body already showing
      }
    })();
  }, [isQuizInProgress, pathname, generateTip]);

  useEffect(() => {
    let lastShown = 0;
    try { lastShown = Number(localStorage.getItem(NEXT_SHOW_KEY) || 0); } catch { /* noop */ }
    const dueIn = Math.max(6000, lastShown - Date.now());
    const t = setTimeout(pickNext, dueIn);
    const interval = setInterval(pickNext, INTERVAL_MS);
    return () => { clearTimeout(t); clearInterval(interval); };
  }, [pickNext, pathname]);

  const dismiss = (forever: boolean) => {
    if (active) {
      const store = loadStore();
      const seen = new Set(store.seen ?? []);
      seen.add(active.id);
      saveStore({ dismissedForever: forever, seen: Array.from(seen) });
      remoteSeen.current = new Set([...(remoteSeen.current ?? []), active.id]);
      markSeenFn({ data: { tipId: active.id } }).catch(() => { /* best-effort */ });
    }
    try { localStorage.setItem(NEXT_SHOW_KEY, String(Date.now() + INTERVAL_MS)); } catch { /* noop */ }
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
        {active.nudgeTo && (
          <Link to={active.nudgeTo} onClick={() => dismiss(false)} className="mt-1 inline-block text-[11px] font-medium text-primary underline underline-offset-2">
            {active.nudgeLabel ?? "Learn more"} →
          </Link>
        )}
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
    try { sessionStorage.setItem(SESSION_COUNT_KEY, "0"); } catch { /* noop */ }
    window.dispatchEvent(new Event("hlqz-coach-restart"));
    // Simplest reliable way to kick the periodic picker immediately.
    setTimeout(() => window.location.reload(), 50);
  }, []);
}
