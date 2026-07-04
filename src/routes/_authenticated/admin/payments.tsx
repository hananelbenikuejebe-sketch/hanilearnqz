import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { getPaymentSettings, updatePaymentSettings } from "@/lib/payments.functions";
import { listWithdrawals, resolveWithdrawal } from "@/lib/wallet.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/payments")({
  component: AdminPayments,
});

const naira = (k: number) => `₦${(k/100).toLocaleString("en-NG")}`;

function AdminPayments() {
  const qc = useQueryClient();
  const getSettings = useServerFn(getPaymentSettings);
  const updateSettings = useServerFn(updatePaymentSettings);
  const listWd = useServerFn(listWithdrawals);
  const resolve = useServerFn(resolveWithdrawal);
  const { data: settings } = useQuery({ queryKey: ["payment-settings-admin"], queryFn: () => getSettings() });
  const { data: wds } = useQuery({ queryKey: ["withdrawals"], queryFn: () => listWd() });
  const [form, setForm] = useState<any>(null);
  useEffect(() => { if (settings) setForm(settings); }, [settings]);

  const save = useMutation({
    mutationFn: (patch: any) => updateSettings({ data: patch }),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["payment-settings-admin"] }); qc.invalidateQueries({ queryKey: ["payment-settings"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!form) return <p>Loading…</p>;
  const locks = form.feature_locks || {};

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Payments</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">Creator access</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <Money label="Price" value={form.creator_access_price_kobo} onChange={(v) => setForm({ ...form, creator_access_price_kobo: v })} />
          <Num label="Duration (days)" value={form.creator_access_duration_days} onChange={(v) => setForm({ ...form, creator_access_duration_days: v })} />
          <Num label="Quiz cap" value={form.creator_access_quiz_cap} onChange={(v) => setForm({ ...form, creator_access_quiz_cap: v })} />
          <Row label="Includes AI" v={form.creator_access_includes_ai} set={(b) => setForm({ ...form, creator_access_includes_ai: b })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">AI credit pricing</CardTitle>
          <CardDescription>Result AI &amp; Essay AI are fixed per call. Parser AI is metered per 1k tokens.</CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <Money label="Result AI (per call)" value={form.ai_result_price_kobo} onChange={(v) => setForm({ ...form, ai_result_price_kobo: v })} />
          <Money label="Essay AI (per call)" value={form.ai_essay_price_kobo} onChange={(v) => setForm({ ...form, ai_essay_price_kobo: v })} />
          <Money label="Parser: per 1k input tokens" value={form.ai_parser_rate_per_1k_input_kobo} onChange={(v) => setForm({ ...form, ai_parser_rate_per_1k_input_kobo: v })} />
          <Money label="Parser: per 1k output tokens" value={form.ai_parser_rate_per_1k_output_kobo} onChange={(v) => setForm({ ...form, ai_parser_rate_per_1k_output_kobo: v })} />
          <Money label="Min AI top-up" value={form.ai_credit_min_topup_kobo} onChange={(v) => setForm({ ...form, ai_credit_min_topup_kobo: v })} />
          <Num label="AI credit expiry (days)" value={form.ai_credit_expiry_days} onChange={(v) => setForm({ ...form, ai_credit_expiry_days: v })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Feature locks (global kill switches)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {[["ai_result","Result AI"],["ai_essay","Essay AI"],["ai_parser","Parser AI"]].map(([k, label]) => (
            <Row key={k} label={`Lock ${label}`} v={!!locks[k]} set={(b) => setForm({ ...form, feature_locks: { ...locks, [k]: b } })} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Affiliate &amp; payouts</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <Num label="Affiliate %" value={form.affiliate_pct} onChange={(v) => setForm({ ...form, affiliate_pct: v })} />
          <Money label="Min withdrawal" value={form.withdrawal_min_kobo} onChange={(v) => setForm({ ...form, withdrawal_min_kobo: v })} />
          <div className="col-span-2"><Label>Withdrawal WhatsApp</Label><Input value={form.withdrawal_whatsapp} onChange={(e) => setForm({ ...form, withdrawal_whatsapp: e.target.value })} /></div>
        </CardContent>
      </Card>

      <Button onClick={() => save.mutate(form)} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save all"}</Button>

      <Card>
        <CardHeader><CardTitle className="text-base">Withdrawal requests</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {(wds ?? []).length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No requests.</div>}
            {(wds ?? []).map((w: any) => (
              <div key={w.id} className="p-3 flex flex-wrap items-center gap-3 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{naira(w.amount_kobo)} · {w.profiles?.full_name ?? w.user_id}</div>
                  <div className="text-xs text-muted-foreground">{w.bank_name} · {w.account_number} · {w.account_name}</div>
                  <div className="text-xs text-muted-foreground">{new Date(w.created_at).toLocaleString()}</div>
                </div>
                <Badge variant={w.status === "requested" ? "default" : w.status === "paid" ? "secondary" : "destructive"}>{w.status}</Badge>
                {w.status === "requested" && (
                  <>
                    <Button size="sm" variant="outline" onClick={async () => { await resolve({ data: { id: w.id, action: "paid" } }); qc.invalidateQueries({ queryKey: ["withdrawals"] }); }}>Mark paid</Button>
                    <Button size="sm" variant="ghost" onClick={async () => { await resolve({ data: { id: w.id, action: "reject", note: "Rejected" } }); qc.invalidateQueries({ queryKey: ["withdrawals"] }); }}>Reject</Button>
                  </>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Money({ label, value, onChange }: any) {
  return <div><Label>{label} (₦)</Label><Input type="number" value={value / 100} onChange={(e) => onChange(Math.round(parseFloat(e.target.value) * 100) || 0)} /></div>;
}
function Num({ label, value, onChange }: any) {
  return <div><Label>{label}</Label><Input type="number" value={value ?? ""} onChange={(e) => onChange(parseInt(e.target.value) || 0)} /></div>;
}
function Row({ label, v, set }: any) {
  return <div className="flex items-center justify-between"><span className="text-sm">{label}</span><Switch checked={v} onCheckedChange={set} /></div>;
}
