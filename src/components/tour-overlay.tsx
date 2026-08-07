import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, ArrowLeft, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTour, type Tour } from "@/lib/tour-content";
import { listCompletedTours, markTourComplete } from "@/lib/tours.functions";
import { supabase } from "@/integrations/supabase/client";

const LOCAL_KEY = "hlqz_tours_completed_v1";

function loadLocalCompleted(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]")); } catch { return new Set(); }
}
function saveLocalCompleted(s: Set<string>) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(Array.from(s))); } catch { /* noop */ }
}

/** Resolve a step target: plain CSS selector, or `text:Label` fuzzy text match. */
function resolveTarget(target: string | undefined): HTMLElement | null {
  if (!target) return null;
  if (target.startsWith("text:")) {
    const needle = target.slice(5).trim().toLowerCase();
    const candidates = Array.from(
      document.querySelectorAll("h1, h2, h3, button, a, [role='tab']"),
    ) as HTMLElement[];
    return (
      candidates.find(
        (el) => el.offsetParent !== null && (el.textContent || "").trim().toLowerCase().includes(needle),
      ) ?? null
    );
  }
  try {
    const el = document.querySelector(target) as HTMLElement | null;
    return el && el.offsetParent !== null ? el : null;
  } catch {
    return null;
  }
}

let externalCompletedCache: Set<string> | null = null;
let externalCompletedPromise: Promise<Set<string>> | null = null;

/** Replay a tour by key from anywhere (e.g. a help/support page). */
export function replayTour(key: string) {
  window.dispatchEvent(new CustomEvent("hlqz-tour-replay", { detail: { key } }));
}

export function TourOverlay({ tour: forcedKey }: { tour?: string } = {}) {
  const listCompletedFn = useServerFn(listCompletedTours);
  const markCompleteFn = useServerFn(markTourComplete);

  const [authed, setAuthed] = useState(false);
  const [completed, setCompleted] = useState<Set<string>>(() => loadLocalCompleted());
  const [activeTour, setActiveTour] = useState<Tour | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setAuthed(!!data.session);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (authed) {
        if (!externalCompletedPromise) {
          externalCompletedPromise = listCompletedFn()
            .then((r) => new Set(r.tourKeys))
            .catch(() => new Set<string>());
        }
        const remote = externalCompletedCache ?? (await externalCompletedPromise);
        externalCompletedCache = remote;
        if (cancelled) return;
        const merged = new Set<string>([...loadLocalCompleted(), ...remote]);
        setCompleted(merged);
        saveLocalCompleted(merged);
      }
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [authed, listCompletedFn]);

  const openTour = useCallback((key: string) => {
    const tour = getTour(key);
    if (!tour) return;
    setActiveTour(tour);
    setStepIdx(0);
  }, []);

  // Auto-trigger on first visit once we know completion state.
  useEffect(() => {
    if (!ready || !forcedKey || activeTour) return;
    if (completed.has(forcedKey)) return;
    const t = setTimeout(() => openTour(forcedKey), 500);
    return () => clearTimeout(t);
  }, [ready, forcedKey, completed, activeTour, openTour]);

  // Manual replay event (help button, support page, etc.)
  useEffect(() => {
    const handler = (e: Event) => {
      const key = (e as CustomEvent).detail?.key as string | undefined;
      if (key) openTour(key);
    };
    window.addEventListener("hlqz-tour-replay", handler);
    return () => window.removeEventListener("hlqz-tour-replay", handler);
  }, [openTour]);

  const step = activeTour?.steps[stepIdx];

  useEffect(() => {
    if (!step) { setRect(null); return; }
    const update = () => {
      const el = resolveTarget(step.target);
      setRect(el ? el.getBoundingClientRect() : null);
      if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    update();
    const onResize = () => update();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    const raf = requestAnimationFrame(update);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      cancelAnimationFrame(raf);
    };
  }, [step]);

  const finish = useCallback(async () => {
    if (!activeTour) return;
    const key = activeTour.key;
    const next = new Set(completed);
    next.add(key);
    setCompleted(next);
    saveLocalCompleted(next);
    externalCompletedCache = next;
    setActiveTour(null);
    setRect(null);
    if (authed) {
      try { await markCompleteFn({ data: { tourKey: key } }); } catch { /* best-effort */ }
    }
  }, [activeTour, completed, authed, markCompleteFn]);

  const next = () => {
    if (!activeTour) return;
    if (stepIdx >= activeTour.steps.length - 1) { void finish(); return; }
    setStepIdx((i) => i + 1);
  };
  const back = () => setStepIdx((i) => Math.max(0, i - 1));

  const cardStyle = useMemo(() => {
    if (typeof window === "undefined" || !rect) return {};
    const width = 300;
    const cardHeight = 180;
    const spaceBelow = window.innerHeight - rect.bottom;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    if (spaceBelow >= cardHeight + 16) {
      return { top: rect.bottom + 12, left };
    }
    const spaceAbove = rect.top;
    if (spaceAbove >= cardHeight + 16) {
      return { top: Math.max(8, rect.top - cardHeight - 12), left };
    }
    return { top: Math.max(8, Math.min(window.innerHeight - cardHeight - 8, rect.bottom + 12)), left };
  }, [rect]);

  if (typeof document === "undefined" || !activeTour || !step) return null;

  const isLast = stepIdx === activeTour.steps.length - 1;
  const total = activeTour.steps.length;

  return createPortal(
    <div className="fixed inset-0 z-[100]" data-testid="tour-overlay">
      {/* dim backdrop, clickable to skip */}
      <div className="absolute inset-0 bg-background/70 backdrop-blur-[1px]" />
      {rect && (
        <div
          className="pointer-events-none absolute rounded-lg ring-4 ring-primary ring-offset-2 ring-offset-background transition-all duration-300"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}
      <div
        className={rect ? "absolute w-[300px] max-w-[calc(100vw-16px)] rounded-xl border bg-popover p-4 text-popover-foreground shadow-xl" : "absolute left-1/2 top-1/2 w-[calc(100vw-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-popover p-4 text-popover-foreground shadow-xl"}
        style={rect ? cardStyle : undefined}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="flex items-center gap-1 text-sm font-semibold">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> {step.title}
          </p>
          <button aria-label="Skip tour" onClick={() => void finish()} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
        {step.nudge && (
          <Link to={step.nudge.to} onClick={() => void finish()} className="mt-2 inline-block text-xs font-medium text-primary underline underline-offset-2">
            {step.nudge.label} →
          </Link>
        )}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">{stepIdx + 1} / {total}</span>
          <div className="flex items-center gap-1">
            {stepIdx > 0 && (
              <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={back}>
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void finish()}>Skip</Button>
            <Button size="sm" className="h-7 gap-1 text-xs" onClick={next}>
              {isLast ? "Done" : "Next"} {!isLast && <ArrowRight className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
