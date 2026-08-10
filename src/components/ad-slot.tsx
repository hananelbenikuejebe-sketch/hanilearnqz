import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listActiveAds, recordAdEvent } from "@/lib/ads.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, Sparkles } from "lucide-react";

export type Placement = "explore" | "quiz_end" | "switch" | "wallet" | "notifications" | "messages" | "popup";

const dismissedKey = (placement: string) => `ad-dismissed:${placement}`;

function pickWeighted(ads: any[], seed?: number): any | null {
  if (!ads.length) return null;
  if (seed != null) return ads[seed % ads.length];
  const total = ads.reduce((s, a) => s + Math.max(1, Number(a.weight ?? 1)), 0);
  let r = Math.random() * total;
  for (const a of ads) {
    r -= Math.max(1, Number(a.weight ?? 1));
    if (r <= 0) return a;
  }
  return ads[0];
}

/** Fetches active ads for a placement. */
export function useActiveAds(placement: Placement) {
  const fetchAds = useServerFn(listActiveAds);
  const { data } = useQuery({
    queryKey: ["ads-active", placement],
    queryFn: () => fetchAds({ data: { placement } }),
    staleTime: 60_000,
  });
  return (data ?? []) as any[];
}

/** Fetches active ads for a placement and returns the raw `every_n` interleave hint. */
export function useAdEveryN(placement: Placement): number | null {
  const ads = useActiveAds(placement);
  if (!ads.length) return null;
  return Math.min(...ads.map((a: any) => Number(a.every_n ?? 6)));
}

/** Records ad impressions/clicks. */
export function useAdEvents() {
  const eventFn = useServerFn(recordAdEvent);
  return {
    impression: (ad_id: string, placement: string) => eventFn({ data: { ad_id, kind: "impression", placement } }).catch(() => {}),
    click: (ad_id: string, placement: string) => eventFn({ data: { ad_id, kind: "click", placement } }).catch(() => {}),
  };
}

/** Polished native ad card look, shared by feed cards and slot cards. */
export function NativeAdCard({
  ad,
  onClick,
  onDismiss,
  className,
}: {
  ad: any;
  onClick?: () => void;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <Card className={`relative overflow-hidden border-primary/10 shadow-sm transition hover:shadow-md ${className ?? ""}`}>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="absolute right-2 top-2 z-10 rounded-full bg-background/80 p-1 text-muted-foreground backdrop-blur hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {ad.image_url ? (
        <div className="relative aspect-video w-full overflow-hidden bg-muted">
          <img src={ad.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur">
            <Sparkles className="h-2.5 w-2.5 text-primary" /> Sponsored
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-1 px-4 pt-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <Sparkles className="h-2.5 w-2.5 text-primary" /> Sponsored
        </div>
      )}
      <CardContent className="space-y-1.5 p-4">
        <div className="text-sm font-semibold leading-tight">{ad.title}</div>
        {ad.body && <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">{ad.body}</p>}
        {ad.cta_url && (
          <Button asChild size="sm" className="mt-2 w-full" onClick={onClick}>
            <a href={ad.cta_url} target="_blank" rel="noopener noreferrer">
              {ad.cta_label || "Learn more"}
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** Compact promo card for a fixed placement. Renders nothing if no eligible ad, or once dismissed for the session. */
export function AdSlot({ placement, className }: { placement: Placement; className?: string }) {
  const { impression, click } = useAdEvents();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(dismissedKey(placement)) === "1";
  });
  const [recordedImpression, setRecordedImpression] = useState(false);
  const [rotateIdx, setRotateIdx] = useState(0);

  const data = useActiveAds(placement);
  const ads = useMemo(() => data.filter((a: any) => a.auto_show), [data]);
  const ad = useMemo(() => (ads.length ? ads[rotateIdx % ads.length] : null), [ads, rotateIdx]);

  // Auto-rotate through eligible ads on an interval derived from the
  // fastest `frequency_minutes` among active ads (min 20s, so it never spams).
  const rotateMs = useMemo(() => {
    if (ads.length < 2) return null;
    const mins = Math.min(...ads.map((a: any) => Number(a.frequency_minutes ?? 5)));
    return Math.max(15_000, Math.max(1, mins) * 60_000);
  }, [ads]);

  useEffect(() => {
    if (!rotateMs) return;
    const id = setInterval(() => setRotateIdx((i) => i + 1), rotateMs);
    return () => clearInterval(id);
  }, [rotateMs]);

  useEffect(() => {
    setRecordedImpression(false);
  }, [ad?.id]);

  useEffect(() => {
    if (ad && !recordedImpression) {
      setRecordedImpression(true);
      impression(ad.id, placement);
    }
  }, [ad, recordedImpression, placement, impression]);

  if (dismissed || !ad) return null;

  function handleDismiss() {
    sessionStorage.setItem(dismissedKey(placement), "1");
    setDismissed(true);
  }

  return (
    <NativeAdCard
      ad={ad}
      className={className}
      onDismiss={handleDismiss}
      onClick={() => click(ad.id, placement)}
    />
  );
}

/** Native ad card meant to be interleaved directly into a scrolling feed. */
export function FeedAdCard({ ad, placement = "explore" as Placement, className }: { ad: any; placement?: Placement; className?: string }) {
  const { impression, click } = useAdEvents();
  useEffect(() => {
    if (ad?.id) impression(ad.id, placement);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad?.id]);
  if (!ad) return null;
  return <NativeAdCard ad={ad} className={className} onClick={() => click(ad.id, placement)} />;
}

/**
 * Builds a feed array with a native ad card injected every `every` items,
 * cycling through the active ad pool indefinitely (repeating ads if there
 * are fewer ads than slots needed).
 */
export function interleaveAds<T>(items: T[], ads: any[], every = 4): Array<{ type: "item"; item: T } | { type: "ad"; ad: any; key: string }> {
  const out: Array<{ type: "item"; item: T } | { type: "ad"; ad: any; key: string }> = [];
  if (!items.length) return out;
  let adCursor = 0;
  items.forEach((item, i) => {
    out.push({ type: "item", item });
    if (ads.length && (i + 1) % every === 0) {
      const ad = ads[adCursor % ads.length];
      out.push({ type: "ad", ad, key: `ad-${i}-${ad.id}` });
      adCursor += 1;
    }
  });
  return out;
}

export { pickWeighted };
