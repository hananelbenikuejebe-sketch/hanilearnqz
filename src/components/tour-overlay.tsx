import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
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
      document.querySelectorAll("h1, h2, h3, button, a, [role='tab'], label"),
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
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [authed, setAuthed] = useState(false);
  const [completed, setCompleted] = useState<Set<string>>(() => loadLocalCompleted());
  const [activeTour, setActiveTour] = useState<Tour | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [ready, setReady] = useState(false);
  const skipGuard = useRef(0);

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
            .then((r: any) => new Set<string>((r?.tourKeys ?? []) as Array<string>))
            .catch(() => new Set<string>());
        }
        const remote = externalCompletedCache ?? (await externalCompletedPromise);
        externalCompletedCache = remote;
        if (cancelled) return;
        const merged = new Set<string>([...loadLocalCompleted(), ...(remote ?? [])]);
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

  // Escape key closes the tour.
  useEffect(() => {
    if (!activeTour) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") void finish(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTour]);

  const step = activeTour?.steps[stepIdx];

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
    setStepIdx(0);
    if (authed) {
      try { await markCompleteFn({ data: { tourKey: key } }); } catch { /* best-effort */ }
    }
  }, [activeTour, completed, authed, markCompleteFn]);

  const goToStep = useCallback((idx: number) => {
    if (!activeTour) return;
    if (idx < 0) { setStepIdx(0); return; }
    if (idx >= activeTour.steps.length) { void finish(); return; }
    setStepIdx(idx);
  }, [activeTour, finish]);

  // Navigate/act/measure on every step change. Recomputed live via
  // ResizeObserver + scroll/resize listeners so exactly the current target
  // is ever highlighted.
  useEffect(() => {
    if (!step || !activeTour) { setRect(null); return; }
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    let raf = 0;
    const mySkipToken = ++skipGuard.current;

    const measure = () => {
      if (cancelled) return;
      const el = resolveTarget(step.target);
      if (el) {
        setRect(el.getBoundingClientRect());
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        if (ro) ro.disconnect();
        ro = new ResizeObserver(() => {
          const fresh = resolveTarget(step.target);
          if (fresh) setRect(fresh.getBoundingClientRect());
        });
        ro.observe(el);
      } else if (step.target) {
        // Never advance without the user. Some screens render their target
        // after queries/tabs settle; keep the step open and retry instead of
        // racing through every unresolved target.
        setRect(null);
      } else {
        setRect(null);
      }
    };

    const run = async () => {
      if (step.route && pathname !== step.route) {
        navigate({ to: step.route });
        await new Promise((r) => setTimeout(r, 260));
      }
      if (step.action) {
        const actionEl = resolveTarget(step.action);
        actionEl?.click();
        await new Promise((r) => setTimeout(r, 180));
      }
      if (step.waitMs) await new Promise((r) => setTimeout(r, step.waitMs));
      if (cancelled) return;
       measure();
       if (step.target && !resolveTarget(step.target)) {
         for (let attempt = 0; attempt < 20 && !cancelled; attempt++) {
           await new Promise((r) => setTimeout(r, 250));
           if (resolveTarget(step.target)) { measure(); break; }
         }
       }
    };
    void run();

    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    raf = requestAnimationFrame(measure);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, activeTour, stepIdx]);

  const next = () => goToStep(stepIdx + 1);
  const back = () => goToStep(stepIdx - 1);

  const cardStyle = useMemo(() => {
    if (typeof window === "undefined" || !rect) return {};
    const width = 300;
    const cardHeight = 200;
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
      {/* Spotlight: when we have a target we blur/dim everything AROUND it with
          four panels, so the highlighted control itself stays perfectly sharp. */}
      {rect ? (
        <>
          <div className="absolute inset-x-0 top-0 bg-background/70 backdrop-blur-sm transition-all duration-200" style={{ height: Math.max(0, rect.top - 6) }} />
          <div className="absolute inset-x-0 bottom-0 bg-background/70 backdrop-blur-sm transition-all duration-200" style={{ top: rect.bottom + 6 }} />
          <div className="absolute left-0 bg-background/70 backdrop-blur-sm transition-all duration-200" style={{ top: Math.max(0, rect.top - 6), height: rect.height + 12, width: Math.max(0, rect.left - 6) }} />
          <div className="absolute right-0 bg-background/70 backdrop-blur-sm transition-all duration-200" style={{ top: Math.max(0, rect.top - 6), height: rect.height + 12, left: rect.right + 6 }} />
          <div
            className="pointer-events-none absolute rounded-lg ring-4 ring-primary ring-offset-2 ring-offset-transparent transition-all duration-300"
            style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-background/70 backdrop-blur-[1px]" />
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
        {/* Progress dots */}
        <div className="mt-3 flex items-center justify-center gap-1">
          {activeTour.steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === stepIdx ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30"}`}
            />
          ))}
        </div>
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
