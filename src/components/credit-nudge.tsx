import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "hlqz_credit_nudge_dismissed_at";

/** Persistent but dismissible low-AI-credit banner. Pass the wallet's balance in kobo. */
export function LowCreditBanner({ balanceKobo, thresholdKobo = 5000 }: { balanceKobo: number | null | undefined; thresholdKobo?: number }) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (balanceKobo == null || balanceKobo > thresholdKobo) { setDismissed(true); return; }
    try {
      const last = Number(localStorage.getItem(DISMISS_KEY) || 0);
      setDismissed(Date.now() - last < 6 * 3600 * 1000);
    } catch { setDismissed(false); }
  }, [balanceKobo, thresholdKobo]);

  if (dismissed || balanceKobo == null || balanceKobo > thresholdKobo) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* noop */ }
    setDismissed(true);
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 shrink-0 text-amber-600" />
        <span>{balanceKobo <= 0 ? "You're out of AI credit." : "Your AI credit is running low."} Top up to keep parsing and marking with AI.</span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button asChild size="sm" className="h-7 text-xs"><Link to="/wallet">Top up</Link></Button>
        <button onClick={dismiss} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
