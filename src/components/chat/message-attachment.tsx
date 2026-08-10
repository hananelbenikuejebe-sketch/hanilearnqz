import { useState } from "react";
import { Play, Pause, ImageOff } from "lucide-react";
import { formatDuration } from "@/components/chat/chat-utils";

function AudioBubblePlayer({ url, durationSec, mine }: { url: string; durationSec?: number | null; mine: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [audio] = useState(() => (typeof window !== "undefined" ? new Audio(url) : null));

  const toggle = () => {
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else {
      audio.play().catch(() => {});
      setPlaying(true);
      audio.onended = () => setPlaying(false);
    }
  };

  return (
    <div className="flex items-center gap-2 py-0.5">
      <button
        type="button"
        onClick={toggle}
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${mine ? "bg-primary-foreground/20" : "bg-primary/15 text-primary"}`}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 translate-x-[1px]" />}
      </button>
      <div className={`h-1 flex-1 min-w-[64px] rounded-full ${mine ? "bg-primary-foreground/30" : "bg-foreground/15"}`} />
      {typeof durationSec === "number" && <span className="text-[10px] tabular-nums opacity-80">{formatDuration(durationSec)}</span>}
    </div>
  );
}

export function MessageAttachment({
  type,
  url,
  durationSec,
  mine,
}: {
  type: "image" | "audio" | null | undefined;
  url: string | null | undefined;
  durationSec?: number | null;
  mine: boolean;
}) {
  if (!type || !url) return null;
  if (type === "image") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl">
        <img src={url} alt="Shared image" loading="lazy" className="max-h-72 w-full max-w-[240px] object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      </a>
    );
  }
  return <AudioBubblePlayer url={url} durationSec={durationSec} mine={mine} />;
}
