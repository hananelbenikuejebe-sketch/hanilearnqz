import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { updateMyProfile } from "@/lib/profiles.functions";

type ProfileRow = {
  bio?: string | null;
  whatsapp_number?: string | null;
  school?: string | null;
  level?: string | null;
  social_links?: Record<string, string> | null;
};

const SOCIALS: Array<{ key: string; label: string; placeholder: string }> = [
  { key: "twitter", label: "X / Twitter", placeholder: "https://x.com/you" },
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/you" },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@you" },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@you" },
  { key: "website", label: "Website", placeholder: "https://yoursite.com" },
];

/** Lets the signed-in user edit their own public profile (bio, school, WhatsApp, socials). */
export function ProfileEditDialog({ profile }: { profile?: ProfileRow | null }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(updateMyProfile);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    bio: profile?.bio ?? "",
    whatsapp_number: profile?.whatsapp_number ?? "",
    school: profile?.school ?? "",
    level: profile?.level ?? "",
  });
  const [socials, setSocials] = useState<Record<string, string>>((profile?.social_links as any) ?? {});

  useEffect(() => {
    if (!open) return;
    setForm({
      bio: profile?.bio ?? "",
      whatsapp_number: profile?.whatsapp_number ?? "",
      school: profile?.school ?? "",
      level: profile?.level ?? "",
    });
    setSocials((profile?.social_links as any) ?? {});
  }, [open, profile]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: { ...form, social_links: socials } }),
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["public-profile"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save profile"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Pencil className="mr-1 h-4 w-4" />Edit profile</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit your profile</DialogTitle>
          <DialogDescription>This is what other learners see on your public profile.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="bio">Bio</Label>
            <Textarea id="bio" rows={3} maxLength={500} value={form.bio} placeholder="Tell people what you teach or study…"
              onChange={(e) => setForm({ ...form, bio: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="school">School</Label>
              <Input id="school" value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="level">Level</Label>
              <Input id="level" placeholder="e.g. SS3, 200L" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} />
            </div>
          </div>
          <div>
            <Label htmlFor="wa">WhatsApp number</Label>
            <Input id="wa" placeholder="0803…" value={form.whatsapp_number} onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Social links</Label>
            {SOCIALS.map((s) => (
              <Input key={s.key} placeholder={`${s.label} — ${s.placeholder}`} value={socials[s.key] ?? ""}
                onChange={(e) => setSocials({ ...socials, [s.key]: e.target.value })} />
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save profile"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
