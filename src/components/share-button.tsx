import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * One share control for the whole app: native share sheet where available
 * (Android/iOS, which is where virality actually happens), clipboard fallback
 * everywhere else. Used for quizzes, scores and profiles.
 */
export function ShareButton({
  url,
  title,
  text,
  label = "Share",
  size = "sm",
  variant = "outline",
  className,
  onShared,
}: {
  url: string;
  title?: string;
  text?: string;
  label?: string;
  size?: "sm" | "default" | "icon";
  variant?: "outline" | "default" | "ghost" | "secondary";
  className?: string;
  onShared?: (channel: "native" | "clipboard") => void;
}) {
  const [done, setDone] = useState(false);

  const share = async () => {
    const absolute = url.startsWith("http") || typeof window === "undefined" ? url : `${window.location.origin}${url}`;
    const nav = typeof navigator !== "undefined" ? (navigator as any) : null;
    if (nav?.share) {
      try {
        await nav.share({ title, text, url: absolute });
        onShared?.("native");
        return;
      } catch {
        // user dismissed, or share failed — fall through to clipboard
      }
    }
    try {
      await nav?.clipboard?.writeText(`${text ? `${text}\n` : ""}${absolute}`);
      setDone(true);
      toast.success("Link copied — paste it anywhere");
      onShared?.("clipboard");
      setTimeout(() => setDone(false), 2000);
    } catch {
      toast.error("Couldn't share automatically. Copy the link from your address bar.");
    }
  };

  return (
    <Button type="button" size={size} variant={variant} className={className} onClick={() => void share()}>
      {done ? <Check className="mr-1 h-4 w-4" /> : <Share2 className="mr-1 h-4 w-4" />}
      {size === "icon" ? null : label}
    </Button>
  );
}
