import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { AppShell } from "@/components/app-nav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Wallet as WalletIcon, ArrowUpRight, ArrowDownRight, Link2, Copy, Sparkles } from "lucide-react";
import { getMyWallet, saveBankAccount, requestWithdrawal } from "@/lib/wallet.functions";
import { getPaymentSettings, initiatePayment, verifyAndSettle } from "@/lib/payments.functions";
import { getOrCreateMyAffiliate } from "@/lib/affiliate.functions";
import { getMyCreatorStatus } from "@/lib/creators.functions";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/wallet")({
  head: () => ({ meta: [{ title: "Wallet — HaniLearn-QZ" }] }),
  validateSearch: (s: any) => z.object({ ref: z.string().optional() }).parse(s),
  component: WalletPage,
});

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

function WalletPage() {
  const search = useSearch({ from: "/_authenticated/wallet" });
  const qc = useQueryClient();
  const walletFn = useServerFn(getMyWallet);
  const settingsFn = useServerFn(getPaymentSettings);
  const affFn = useServerFn(getOrCreateMyAffiliate);
  const statusFn = useServerFn(getMyCreatorStatus);
  const initFn = useServerFn(initiatePayment);
  const verifyFn = useServerFn(verifyAndSettle);
  const saveBank = useServerFn(saveBankAccount);
  const withdrawFn = useServerFn(requestWithdrawal);

  const { data: wallet } = useQuery({ queryKey: ["my-wallet"], queryFn: () => walletFn() });
  const { data: settings } = useQuery({ queryKey: ["payment-settings"], queryFn: () => settingsFn() });
  const { data: aff } = useQuery({ queryKey: ["my-affiliate"], queryFn: () => affFn() });
  const { data: status } = useQuery({ queryKey: ["creator-status"], queryFn: () => statusFn() });

  // Verify redirect from Monnify
  useEffect(() => {
    if (search.ref) {
      verifyFn({ data: { reference: search.ref } })
        .then((r: any) => {
          if (r.status === "paid") { toast.success("Payment confirmed — access granted!"); qc.invalidateQueries(); }
          else toast.message("Payment is still pending. Refresh in a moment.");
        })
        .catch((e: any) => toast.error(e.message ?? "Verification failed"));
    }
  }, [search.ref, verifyFn, qc]);

  const buy = useMutation({
    mutationFn: (v: { purpose: "creator_access" | "ai_credit"; amount_kobo?: number }) => initFn({ data: v }),
    onSuccess: (r: any) => { window.location.href = r.checkoutUrl; },
    onError: (e: any) => toast.error(e.message),
  });

  const [aiAmount, setAiAmount] = useState(30000);

  return (
    <AppShell isSuperAdmin={status?.is_super_admin}>
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <WalletIcon className="h-6 w-6" />
          <h1 className="text-2xl font-bold tracking-tight">Wallet</h1>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardDescription>Earnings (withdrawable)</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{naira(wallet?.wallet?.balance_kobo ?? 0)}</CardTitle>
            </CardHeader>
            <CardContent><WithdrawDialog wallet={wallet} settings={settings} onSave={saveBank} onWithdraw={withdrawFn} /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>AI credit</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{naira(wallet?.wallet?.ai_credit_balance_kobo ?? 0)}</CardTitle>
              {wallet?.wallet?.ai_credit_expires_at && <p className="text-xs text-muted-foreground">Expires {new Date(wallet.wallet.ai_credit_expires_at).toLocaleDateString()}</p>}
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input type="number" min={settings?.ai_credit_min_topup_kobo ? settings.ai_credit_min_topup_kobo / 100 : 300} value={aiAmount / 100} onChange={(e) => setAiAmount(Math.floor(parseFloat(e.target.value) * 100) || 0)} className="w-28" />
                <Button size="sm" disabled={buy.isPending} onClick={() => buy.mutate({ purpose: "ai_credit", amount_kobo: aiAmount })}>Top up</Button>
                <ContactAdmin purpose="AI credit" amount={aiAmount} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Min ₦{((settings?.ai_credit_min_topup_kobo ?? 30000)/100).toFixed(0)} · expires {settings?.ai_credit_expiry_days ?? 30}d</p>
            </CardContent>
          </Card>
        </div>

        {!status?.can_create && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" />Become a creator</CardTitle>
              <CardDescription>{settings ? `₦${(settings.creator_access_price_kobo/100).toFixed(0)} for ${settings.creator_access_duration_days} days · ${settings.creator_access_quiz_cap} quiz cap${settings.creator_access_includes_ai ? " · includes AI" : " · AI billed separately"}` : "…"}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button disabled={buy.isPending} onClick={() => buy.mutate({ purpose: "creator_access" })}>{buy.isPending ? "Redirecting…" : "Pay & unlock creator"}</Button>
              <ContactAdmin purpose="creator access" amount={settings?.creator_access_price_kobo} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Link2 className="h-4 w-4" />Your affiliate link</CardTitle>
            <CardDescription>Earn {settings?.affiliate_pct ?? 20}% of every creator/AI purchase from people you invite. Earned so far: <span className="font-semibold">{naira(aff?.earned_kobo ?? 0)}</span></CardDescription>
          </CardHeader>
          <CardContent>
            {aff && (
              <div className="flex flex-wrap items-center gap-2">
                <Input readOnly value={aff.link} className="max-w-md" />
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(aff.link); toast.success("Copied"); }}><Copy className="h-3 w-3 mr-1" />Copy</Button>
                <Badge variant="secondary">Code: {aff.code}</Badge>
                <Badge variant="outline">{aff.signups} signups</Badge>
                <Badge variant="outline">{aff.clicks} clicks</Badge>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Recent transactions</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {(wallet?.transactions ?? []).length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No transactions yet.</div>}
              {(wallet?.transactions ?? []).map((t: any) => (
                <div key={t.id} className="p-3 flex items-center gap-3 text-sm">
                  {t.amount_kobo >= 0 ? <ArrowDownRight className="h-4 w-4 text-emerald-500" /> : <ArrowUpRight className="h-4 w-4 text-rose-500" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium capitalize">{t.kind.replace(/_/g, " ")}</div>
                    <div className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()} · <span className="capitalize">{t.bucket}</span></div>
                  </div>
                  <div className={"tabular-nums font-semibold " + (t.amount_kobo >= 0 ? "text-emerald-600" : "text-rose-600")}>{t.amount_kobo >= 0 ? "+" : ""}{naira(t.amount_kobo)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function WithdrawDialog({ wallet, settings, onSave, onWithdraw }: any) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const bank = wallet?.bank_account;
  const [form, setForm] = useState({ bank_name: bank?.bank_name ?? "", account_number: bank?.account_number ?? "", account_name: bank?.account_name ?? "" });
  const [amount, setAmount] = useState(0);
  const balance = wallet?.wallet?.balance_kobo ?? 0;
  const min = settings?.withdrawal_min_kobo ?? 100000;

  useEffect(() => { if (bank) setForm({ bank_name: bank.bank_name, account_number: bank.account_number, account_name: bank.account_name }); }, [bank]);

  async function submit() {
    try {
      await onSave({ data: form });
      const r: any = await onWithdraw({ data: { amount_kobo: amount } });
      window.open(r.whatsappUrl, "_blank");
      toast.success("Request logged — WhatsApp opened to notify admin.");
      qc.invalidateQueries({ queryKey: ["my-wallet"] });
      setOpen(false);
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline" disabled={balance <= 0}>Withdraw</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Withdraw earnings</DialogTitle>
          <DialogDescription>Min {`₦${(min/100).toFixed(0)}`}. Available {`₦${(balance/100).toFixed(2)}`}. On submit, a WhatsApp message is opened to notify the admin who processes payouts manually.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Amount (₦)</Label><Input type="number" min={min/100} max={balance/100} value={amount / 100 || ""} onChange={(e) => setAmount(Math.floor(parseFloat(e.target.value) * 100) || 0)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Bank</Label><Input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} /></div>
            <div><Label>Account #</Label><Input value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} /></div>
          </div>
          <div><Label>Account name</Label><Input value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} /></div>
        </div>
        <DialogFooter><Button onClick={submit} disabled={!amount || !form.bank_name || !form.account_number}>Send request</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContactAdmin({ purpose, amount }: { purpose: string; amount?: number }) {
  const amt = amount ? `₦${(amount / 100).toLocaleString("en-NG")}` : "";
  const msg = encodeURIComponent(`Hi, I'd like to pay for ${purpose}${amt ? ` (${amt})` : ""} manually on HaniLearn-QZ. My account email is:`);
  const url = `https://wa.me/2349071829295?text=${msg}`;
  return (
    <Button size="sm" variant="outline" asChild>
      <a href={url} target="_blank" rel="noopener noreferrer">Contact on WhatsApp</a>
    </Button>
  );
}
