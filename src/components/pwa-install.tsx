import { useEffect, useState } from "react";
import { Download, Share, X, PlusSquare, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { usePwaInstall } from "@/lib/pwa";

const DISMISS_KEY = "hlqz_pwa_banner_dismissed_until";
const DISMISS_MS = 3 * 24 * 60 * 60 * 1000; // reappears after 3 days, never gone forever

function isDismissed() {
  try {
    const until = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() < until;
  } catch { return false; }
}
function dismissForNow() {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS)); } catch { /* noop */ }
}

/** Manual step-by-step instructions per browser, for platforms without a native prompt. */
function ManualInstructions({ isIOS, isSamsungInternet }: { isIOS: boolean; isSamsungInternet: boolean }) {
  if (isIOS) {
    return (
      <ol className="list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
        <li>Tap the <Share className="inline h-3.5 w-3.5" /> Share icon in Safari's toolbar.</li>
        <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
        <li>Tap <strong>Add</strong> in the top right.</li>
      </ol>
    );
  }
  if (isSamsungInternet) {
    return (
      <ol className="list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
        <li>Tap the menu icon (☰) at the bottom of Samsung Internet.</li>
        <li>Tap <strong>Add page to</strong> → <strong>Home screen</strong>.</li>
        <li>Confirm by tapping <strong>Add</strong>.</li>
      </ol>
    );
  }
  return (
    <ol className="list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
      <li>Tap the <MoreVertical className="inline h-3.5 w-3.5" /> menu in Chrome (top right).</li>
      <li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
      <li>Confirm by tapping <strong>Install</strong>.</li>
    </ol>
  );
}

/** One-tap install button — triggers the native prompt where available, else opens instructions. */
export function InstallAppButton({ className }: { className?: string }) {
  const { canInstall, isInstalled, promptInstall, isIOS, isSamsungInternet } = usePwaInstall();
  const [showManual, setShowManual] = useState(false);

  if (isInstalled) return null;

  return (
    <>
      <Button
        size="sm"
        className={className}
        onClick={async () => {
          if (canInstall) {
            const ok = await promptInstall();
            if (!ok) setShowManual(true);
          } else {
            setShowManual(true);
          }
        }}
      >
        <Download className="mr-1 h-4 w-4" /> Install app
      </Button>
      <Dialog open={showManual} onOpenChange={setShowManual}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add HaniLearn-QZ to your home screen</DialogTitle>
            <DialogDescription>Install the app for a faster, full-screen experience with offline access.</DialogDescription>
          </DialogHeader>
          <ManualInstructions isIOS={isIOS} isSamsungInternet={isSamsungInternet} />
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Persistent-but-dismissible install banner. Mount once near the root of the
 * authenticated app; it re-shows every few days until the app is installed.
 */
export function PwaInstallBanner() {
  const { canInstall, isInstalled, promptInstall, isIOS, isSamsungInternet } = usePwaInstall();
  const [dismissed, setDismissed] = useState(true);
  const [showManual, setShowManual] = useState(false);

  useEffect(() => { setDismissed(isDismissed()); }, []);

  if (isInstalled || dismissed) return null;
  // Only show the persistent banner once we have some install signal (native
  // prompt available, or a platform with known manual steps).
  if (!canInstall && !isIOS && !isSamsungInternet) return null;

  return (
    <>
      <div className="fixed inset-x-3 bottom-20 z-[55] flex items-center gap-3 rounded-xl border bg-popover p-3 text-popover-foreground shadow-xl md:bottom-4 md:left-auto md:right-4 md:w-[340px]">
        <PlusSquare className="h-8 w-8 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Install HaniLearn-QZ</p>
          <p className="text-xs text-muted-foreground">Add it to your home screen for quick, full-screen access.</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={async () => {
              if (canInstall) {
                const ok = await promptInstall();
                if (!ok) setShowManual(true);
                else { dismissForNow(); setDismissed(true); }
              } else {
                setShowManual(true);
              }
            }}
          >
            Install
          </Button>
          <button
            aria-label="Dismiss install banner"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => { dismissForNow(); setDismissed(true); }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <Dialog open={showManual} onOpenChange={setShowManual}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add HaniLearn-QZ to your home screen</DialogTitle>
            <DialogDescription>Install the app for a faster, full-screen experience with offline access.</DialogDescription>
          </DialogHeader>
          <ManualInstructions isIOS={isIOS} isSamsungInternet={isSamsungInternet} />
        </DialogContent>
      </Dialog>
    </>
  );
}
