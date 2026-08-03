import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Copy, Upload, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getPaymentInstructions, submitPaymentProof } from "@/lib/proofs.functions";

type Props = {
  purpose: "creator_access" | "ai_credit" | "quiz_purchase";
  amountKobo?: number;
  quizId?: string;
  label: string;
  variant?: "default" | "outline" | "secondary";
  size?: "default" | "sm";
};

const naira = (k?: number) => `₦${((k ?? 0) / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

export function PayDialog({ purpose, amountKobo, quizId, label, variant = "default", size = "default" }: Props) {
  const qc = useQueryClient();
  const infoFn = useServerFn(getPaymentInstructions);
  const submitFn = useServerFn(submitPaymentProof);
  const { data: info } = useQuery({ queryKey: ["pay-instructions"], queryFn: () => infoFn() });

  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [form, setForm] = useState({
    sender_name: "",
    paid_at: new Date().toISOString().slice(0, 10),
    bank_ref: "",
    bank_name: "",
  });

  const expected = purpose === "creator_access" ? info?.creator_access_price_kobo ?? amountKobo : amountKobo;
  const support = (info?.support_whatsapp ?? "+2349071829295").replace(/\D/g, "");

  async function submit() {
    if (!file) { toast.error("Attach your payment receipt first."); return; }
    setBusy(true);
    try {
      const { data: session } = await supabase.auth.getUser();
      const uid = session.user?.id;
      if (!uid) throw new Error("Please sign in again.");
      const path = `${uid}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
      const up = await supabase.storage.from("payment-proofs").upload(path, file, { upsert: false });
      if (up.error) throw up.error;
      const res: any = await submitFn({
        data: {
          purpose,
          amount_kobo: expected ?? 0,
          quiz_id: quizId,
          file_path: path,
          file_size: file.size,
          file_mime: file.type,
          sender_name: form.sender_name,
          paid_at: form.paid_at,
          bank_ref: form.bank_ref || undefined,
          bank_name: form.bank_name || undefined,
        },
      });
      setDone(res.message);
      qc.invalidateQueries();
      if (res.status === "approved") toast.success(res.message);
      else toast.message(res.message);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not submit your receipt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setDone(null); }}>
      <DialogTrigger asChild><Button variant={variant} size={size}>{label}</Button></DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pay {naira(expected)}</DialogTitle>
          <DialogDescription>Transfer the exact amount, then upload a clear receipt. Your purchase and wallet update after admin confirmation.</DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4 text-emerald-500" />{done}</div>
            <a className="underline text-primary" href={`https://wa.me/${support}`} target="_blank" rel="noopener noreferrer">Need help? Chat with support</a>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border p-3 space-y-1 text-sm bg-muted/40">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Bank</span><span className="font-medium">{info?.bank_name || "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Account number</span>
                <span className="font-semibold tabular-nums flex items-center gap-2">
                  {info?.account_number || "—"}
                  {info?.account_number && (
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { navigator.clipboard.writeText(info.account_number); toast.success("Copied"); }}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Account name</span><span className="font-medium">{info?.account_name || "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Amount</span><Badge>{naira(expected)}</Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2"><Label>Name you paid with</Label>
                <Input value={form.sender_name} onChange={(e) => setForm({ ...form, sender_name: e.target.value })} placeholder="e.g. Amina Yusuf" />
              </div>
              <div><Label>Date paid</Label>
                <Input type="date" value={form.paid_at} onChange={(e) => setForm({ ...form, paid_at: e.target.value })} />
              </div>
              <div><Label>Your bank</Label>
                <Input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} placeholder="Opay, GTB…" />
              </div>
              <div className="col-span-2"><Label>Transaction reference (optional)</Label>
                <Input value={form.bank_ref} onChange={(e) => setForm({ ...form, bank_ref: e.target.value })} placeholder="From your receipt" />
              </div>
              <div className="col-span-2"><Label>Receipt / screenshot</Label>
                <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Having trouble? <a className="underline" href={`https://wa.me/${support}`} target="_blank" rel="noopener noreferrer">Message support on WhatsApp</a>.
            </p>
          </div>
        )}

        {!done && (
          <DialogFooter>
            <Button onClick={submit} disabled={busy || !file || form.sender_name.trim().length < 2}>
              <Upload className="h-4 w-4 mr-1" />{busy ? "Checking…" : "Submit receipt"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
