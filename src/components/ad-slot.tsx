import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listActiveAds, recordAdEvent } from "@/lib/ads.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

type Placement = "explore" | "quiz_end" | "switch" | "wallet";

const dismissedKey = (placement: string) => `ad-dismissed:${placement}`;

function pickWeighted(ads: any[]): any | null {
  if (!ads.length) return null;
  const total = ads.reduce((s, a) => s + Math.max(1, Number(a.weight ?? 1)), 0);
  let r = Math.random() * total;
  for (const a of ads) {
    r -= Math.max(1, Number(a.weight ?? 1));
    if (r <= 0) return a;
  }
  return ads[0];
}

/** Fetches active ads for a placement and returns the raw `every_n` interleave hint. */
export function useAdEveryN(placement: Placement): number | null {
  const fetchAds = useServerFn(listActiveAds);
  const { data } = useQuery({
    queryKey: ["ads-active", placement],
    queryFn: () => fetchAds({ data: { placement } }),
    staleTime: 60_000,
  });
  const ads = data ?? [];
  if (!ads.length) return null;
  return Math.min(...ads.map((a: any) => Number(a.every_n ?? 6)));
}

/** Compact promo card. Renders nothing if no eligible ad, or once dismissed for the session. */
export function AdSlot({ placement, className }: { placement: Placement; className?: string }) {
  const fetchAds = useServerFn(listActiveAds);
  const eventFn = useServerFn(recordAdEvent);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(dismissedKey(placement)) === "1";
  });
  const [recordedImpression, setRecordedImpression] = useState(false);

  const { data } = useQuery({
    queryKey: ["ads-active", placement],
    queryFn: () => fetchAds({ data: { placement } }),
    staleTime: 60_000,
  });

  const ads = useMemo(() => (data ?? []).filter((a: any) => a.auto_show), [data]);
  const ad = useMemo(() => pickWeighted(ads), [ads]);

  if (ad && !recordedImpression) {
    setRecordedImpression(true);
    eventFn({ data: { ad_id: ad.id, kind: "impression", placement } }).catch(() => {});
  }

  if (dismissed || !ad) return null;

  function handleDismiss() {
    sessionStorage.setItem(dismissedKey(placement), "1");
    setDismissed(true);
  }

  function handleClick() {
    eventFn({ data: { ad_id: ad.id, kind: "click", placement } }).catch(() => {});
  }

  return (
    <Card className={`relative overflow-hidden ${className ?? ""}`}>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={handleDismiss}
        className="absolute right-2 top-2 z-10 rounded-full bg-background/80 p-1 text-muted-foreground hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {ad.image_url && (
        <img src={ad.image_url} alt="" className="aspect-video w-full rounded-t-xl object-cover" />
      )}
      <CardContent className="p-4 space-y-2">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sponsored</div>
        <div className="text-sm font-semibold leading-tight">{ad.title}</div>
        {ad.body && <p className="text-xs text-muted-foreground leading-snug">{ad.body}</p>}
        {ad.cta_url && (
          <Button asChild size="sm" className="mt-1 w-full sm:w-auto" onClick={handleClick}>
            <a href={ad.cta_url} target="_blank" rel="noopener noreferrer">
              {ad.cta_label || "Learn more"}
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
