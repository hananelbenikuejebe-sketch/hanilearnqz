import { useEffect, useMemo, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeAdCard, useActiveAds, useAdEvents, pickWeighted } from "@/components/ad-slot";

const SESSION_KEY = "ad-popup:last-shown-at";
const SESSION_COUNT_KEY = "ad-popup:shown-count";
const FIRST_DELAY_MS = 45_000;
const MAX_PER_SESSION = 4;

function isSuppressedRoute(pathname: string) {
  return pathname.startsWith("/quiz/") && pathname.includes("/take");
}

/**
 * Global popup/interstitial ad. Mounted once in the authenticated layout.
 * Shows a dismissible bottom-sheet-style dialog after an initial delay, then
 * periodically based on the lowest `frequency_minutes` among active popup
 * ads. Suppressed while a quiz is being taken and rate-limited per session.
 */
export function AdInterstitial() {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;
  const ads = useActiveAds("popup");
  const { impression, click } = useAdEvents();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<any>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const frequencyMs = useMemo(() => {
    if (!ads.length) return null;
    const mins = Math.min(...ads.map((a: any) => Number(a.frequency_minutes ?? 5)));
    return Math.max(1, mins) * 60_000;
  }, [ads]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!ads.length || !frequencyMs) return;
    if (isSuppressedRoute(pathname)) return;

    const shownCount = Number(sessionStorage.getItem(SESSION_COUNT_KEY) ?? "0");
    if (shownCount >= MAX_PER_SESSION) return;

    const lastShown = Number(sessionStorage.getItem(SESSION_KEY) ?? "0");
    const now = Date.now();
    const elapsedSinceLast = lastShown ? now - lastShown : null;
    const delay = elapsedSinceLast == null
      ? FIRST_DELAY_MS
      : Math.max(0, frequencyMs - elapsedSinceLast);

    timerRef.current = setTimeout(() => {
      if (isSuppressedRoute(window.location.pathname)) return;
      const eligible = ads.filter((a: any) => a.auto_show !== false);
      const ad = pickWeighted(eligible);
      if (!ad) return;
      setCurrent(ad);
      setOpen(true);
      sessionStorage.setItem(SESSION_KEY, String(Date.now()));
      sessionStorage.setItem(SESSION_COUNT_KEY, String(shownCount + 1));
      impression(ad.id, "popup");
    }, delay);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ads.length, frequencyMs, pathname]);

  if (!current) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm gap-3 overflow-hidden p-0 sm:rounded-2xl">
        <DialogHeader className="sr-only"><DialogTitle>{current.title}</DialogTitle></DialogHeader>
        <NativeAdCard
          ad={current}
          className="border-0 shadow-none"
          onClick={() => click(current.id, "popup")}
        />
      </DialogContent>
    </Dialog>
  );
}
