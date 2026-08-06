import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, Link2, X, ImageIcon } from "lucide-react";
import { toast } from "sonner";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Reusable image field: upload a file (via the given uploader) with a
 * live preview, plus an optional "paste URL" fallback for advanced use.
 */
export function ImageUploadField({
  label = "Image",
  value,
  onChange,
  upload,
  className,
}: {
  label?: string;
  value: string;
  onChange: (url: string) => void;
  upload: (file: File) => Promise<string>;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image file"); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error("Image must be under 8MB"); return; }
    setUploading(true);
    try {
      const url = await upload(file);
      onChange(url);
      toast.success("Image uploaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <button
          type="button"
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => setAdvanced((v) => !v)}
        >
          <Link2 className="h-3 w-3" /> {advanced ? "Hide URL field" : "Paste URL instead"}
        </button>
      </div>

      {value ? (
        <div className="relative overflow-hidden rounded-lg border">
          <img src={value} alt="" className="aspect-video w-full object-cover" />
          <button
            type="button"
            aria-label="Remove image"
            onClick={() => onChange("")}
            className="absolute right-2 top-2 rounded-full bg-background/90 p-1 text-muted-foreground hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex aspect-video w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-muted-foreground hover:bg-muted/50 disabled:opacity-60"
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
          <span className="text-xs">{uploading ? "Uploading…" : "Click to upload an image"}</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {value && (
        <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading} className="gap-1.5">
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Replace image
        </Button>
      )}

      {advanced && (
        <Input
          placeholder="https://…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="text-xs"
        />
      )}
    </div>
  );
}

export { fileToBase64 };
