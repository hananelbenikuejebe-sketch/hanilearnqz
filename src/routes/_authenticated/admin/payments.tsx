import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { getPaymentSettings, updatePaymentSettings } from "@/lib/payments.functions";
import { supabase } from "@/integrations/supabase/client";
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
function ageLabel(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "<1h ago";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function AdminPayments() {
  const qc = useQueryClient();
  const getSettings = useServerFn(getPaymentSettings);
  const updateSettings = useServerFn(updatePaymentSettings);
  const listWd = useServerFn(listWithdrawals);
  const resolve = useServerFn(resolveWithdrawal);
  const { data: settings } = useQuery({ queryKey: ["payment-settings-admin"], queryFn: () => getSettings() });
  const { data: wds } = useQuery({ queryKey: ["withdrawals"], queryFn: () => listWd() });
  const { data: feeRevenue } = useQuery({
    queryKey: ["fee-revenue-30d"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { data, error } = await supabase.from("wallet_transactions").select("amount_kobo").eq("kind", "platform_fee").gte("created_at", since);
      if (error) throw error;
      return (data ?? []).reduce((sum: number, t: any) => sum + Math.abs(t.amount_kobo), 0);
    },
  });
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

      <WithdrawalRequests wds={wds} resolve={resolve} qc={qc} />

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
        <CardHeader><CardTitle className="text-base">Affiliate, quiz sales &amp; payouts</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <Num label="Affiliate %" value={form.affiliate_pct} onChange={(v) => setForm({ ...form, affiliate_pct: v })} />
          <Num label="Quiz sale platform fee %" value={form.quiz_platform_fee_pct ?? 10} onChange={(v) => setForm({ ...form, quiz_platform_fee_pct: Math.max(0, Math.min(90, v)) })} />
          <Money label="Min withdrawal" value={form.withdrawal_min_kobo} onChange={(v) => setForm({ ...form, withdrawal_min_kobo: v })} />
          <div className="col-span-2"><Label>Withdrawal WhatsApp</Label><Input value={form.withdrawal_whatsapp} onChange={(e) => setForm({ ...form, withdrawal_whatsapp: e.target.value })} /></div>
          <Num label="Wallet top-up fee %" value={form.topup_fee_pct ?? 5} onChange={(v) => setForm({ ...form, topup_fee_pct: Math.max(0, Math.min(20, v)) })} />
          <Num label="Withdrawal fee %" value={form.withdrawal_fee_pct ?? 5} onChange={(v) => setForm({ ...form, withdrawal_fee_pct: Math.max(0, Math.min(20, v)) })} />
          <p className="col-span-2 text-xs text-muted-foreground">Platform fee is deducted from each paid-quiz sale; the remainder is credited to the creator's earnings wallet. Top-up/withdrawal fees are deducted from wallet flows accordingly.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Fee revenue (last 30 days)</CardTitle></CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tabular-nums">{naira(feeRevenue ?? 0)}</p>
          <p className="text-xs text-muted-foreground">Sum of all platform_fee ledger rows across top-ups, withdrawals and quiz sales.</p>
        </CardContent>
      </Card>

      <Button onClick={() => save.mutate(form)} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save all"}</Button>
    </div>
  );
}

/** Prominent withdrawal-approval queue, rendered above settings in AdminPayments. */
function WithdrawalRequests({ wds, resolve, qc }: any) {
  const pendingCount = (wds ?? []).filter((w: any) => w.status === "requested").length;
  return (
    <Card className="border-primary/40 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base">Withdrawal requests</CardTitle>
          <CardDescription>Approve or reject in-app payout requests from users.</CardDescription>
        </div>
        {pendingCount > 0 && <Badge>{pendingCount} pending</Badge>}
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {(wds ?? []).length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No requests.</div>}
          {(wds ?? []).map((w: any) => (
            <div key={w.id} className="p-3 flex flex-wrap items-center gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <div className="font-medium">{naira(w.amount_kobo)} · {w.profiles?.full_name ?? w.user_id}</div>
                <div className="text-xs text-muted-foreground">{w.bank_name} · {w.account_number} · {w.account_name}</div>
                <div className="text-xs text-muted-foreground">{ageLabel(w.created_at)} · {new Date(w.created_at).toLocaleString()}</div>
              </div>
              <Badge variant={w.status === "requested" ? "default" : w.status === "paid" ? "secondary" : "destructive"}>{w.status}</Badge>
              {w.status === "requested" && (
                <>
                  <Button size="sm" onClick={async () => { await resolve({ data: { id: w.id, action: "paid" } }); qc.invalidateQueries({ queryKey: ["withdrawals"] }); }}>Approve &amp; mark paid</Button>
                  <Button size="sm" variant="ghost" onClick={async () => { await resolve({ data: { id: w.id, action: "reject", note: "Rejected" } }); qc.invalidateQueries({ queryKey: ["withdrawals"] }); }}>Reject</Button>
                </>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Money({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return <div><Label>{label} (₦)</Label><Input type="number" value={value / 100} onChange={(e) => onChange(Math.round(parseFloat(e.target.value) * 100) || 0)} /></div>;
}
function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return <div><Label>{label}</Label><Input type="number" value={value ?? ""} onChange={(e) => onChange(parseInt(e.target.value) || 0)} /></div>;
}
function Row({ label, v, set }: { label: string; v: boolean; set: (b: boolean) => void }) {
  return <div className="flex items-center justify-between"><span className="text-sm">{label}</span><Switch checked={v} onCheckedChange={set} /></div>;
}
