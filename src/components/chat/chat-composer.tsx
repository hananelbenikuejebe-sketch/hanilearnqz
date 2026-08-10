import { useRef, useState } from "react";
import { Send, Paperclip, Mic, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { fileToBase64, formatDuration } from "@/components/chat/chat-utils";

export type PendingAttachment = { path: string; type: "image" | "audio"; mime: string; previewUrl: string; durationSec?: number };

/** Sticky, WhatsApp-style composer: text input + attach + voice-note recorder. */
export function ChatComposer({
  onSend,
  uploadFn,
  sending,
}: {
  onSend: (body: string, attachment?: PendingAttachment) => void;
  uploadFn: (args: { filename: string; content_type: string; base64: string; kind: "image" | "audio" }) => Promise<{ path: string; type: string }>;
  sending: boolean;
}) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState<PendingAttachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioFileRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function uploadFile(file: File | Blob, kind: "image" | "audio", filename: string) {
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await uploadFn({ filename, content_type: (file as any).type || (kind === "image" ? "image/jpeg" : "audio/webm"), base64, kind });
      const previewUrl = URL.createObjectURL(file);
      setPending({ path: res.path, type: kind, mime: (file as any).type || "", previewUrl });
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image file."); return; }
    void uploadFile(file, "image", file.name);
  }

  function onPickAudio(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("audio/")) { toast.error("Please choose an audio file."); return; }
    void uploadFile(file, "audio", file.name);
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const duration = recSeconds;
        setUploading(true);
        try {
          const base64 = await fileToBase64(blob);
          const res = await uploadFn({ filename: "voice-note.webm", content_type: "audio/webm", base64, kind: "audio" });
          const previewUrl = URL.createObjectURL(blob);
          setPending({ path: res.path, type: "audio", mime: "audio/webm", previewUrl, durationSec: duration });
        } catch (e: any) {
          toast.error(e.message ?? "Upload failed");
        } finally {
          setUploading(false);
        }
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
      setRecSeconds(0);
      timerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch {
      toast.error("Microphone access is unavailable — pick an audio file instead.");
      audioFileRef.current?.click();
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() && !pending) return;
    onSend(body.trim(), pending ?? undefined);
    setBody("");
    setPending(null);
  }

  return (
    <div className="border-t bg-background px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      {pending && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border bg-muted/50 px-2 py-1.5 text-xs">
          {pending.type === "image" ? (
            <img src={pending.previewUrl} alt="Attachment preview" className="h-10 w-10 rounded-md object-cover" />
          ) : (
            <span className="text-muted-foreground">Voice note {pending.durationSec ? `(${formatDuration(pending.durationSec)})` : ""} ready</span>
          )}
          <span className="flex-1 truncate text-muted-foreground">{pending.type === "image" ? "Image attached" : ""}</span>
          <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setPending(null)}><X className="h-3.5 w-3.5" /></Button>
        </div>
      )}
      <form className="flex items-center gap-1.5" onSubmit={submit}>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
        <input ref={audioFileRef} type="file" accept="audio/*" className="hidden" onChange={onPickAudio} />
        {!recording ? (
          <>
            <Button type="button" size="icon" variant="ghost" className="shrink-0 rounded-full" disabled={uploading} onClick={() => fileRef.current?.click()} aria-label="Attach image">
              <Paperclip className="h-4 w-4" />
            </Button>
            <Input className="rounded-full" value={body} onChange={(e) => setBody(e.target.value)} placeholder={uploading ? "Uploading…" : "Write a message…"} disabled={uploading} />
            <Button type="button" size="icon" variant="ghost" className="shrink-0 rounded-full" disabled={uploading} onClick={startRecording} aria-label="Record voice note">
              <Mic className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <div className="flex flex-1 items-center gap-2 rounded-full bg-destructive/10 px-4 py-2 text-sm text-destructive">
            <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
            Recording… {formatDuration(recSeconds)}
            <Button type="button" size="icon" variant="ghost" className="ml-auto h-7 w-7 rounded-full text-destructive" onClick={stopRecording} aria-label="Stop recording">
              <Square className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        <Button type="submit" size="icon" className="rounded-full shrink-0" disabled={(!body.trim() && !pending) || sending || uploading}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
