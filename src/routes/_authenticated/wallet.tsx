import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { AppShell } from "@/components/app-nav";
import { AdSlot } from "@/components/ad-slot";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Wallet as WalletIcon, ArrowUpRight, ArrowDownRight, Link2, Copy, Sparkles } from "lucide-react";
import { getMyWallet, saveBankAccount, requestWithdrawal, buyAiCreditFromWallet, buyCreatorAccessFromWallet } from "@/lib/wallet.functions";
import { getPaymentSettings, initiatePayment, verifyAndSettle } from "@/lib/payments.functions";
import { getOrCreateMyAffiliate } from "@/lib/affiliate.functions";
import { getMyCreatorStatus } from "@/lib/creators.functions";
import { PayDialog } from "@/components/pay-dialog";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/wallet")({
  head: () => ({ meta: [
    { title: "Wallet — HaniLearn-QZ" },
    { name: "description", content: "Manage AI credit, creator access, earnings and payment history." },
    { property: "og:title", content: "Wallet — HaniLearn-QZ" },
    { property: "og:description", content: "Manage AI credit, creator access, earnings and payments." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
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
  const buyAiFn = useServerFn(buyAiCreditFromWallet);
  const buyCreatorFn = useServerFn(buyCreatorAccessFromWallet);

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

  const [aiAmountRaw, setAiAmountRaw] = useState(30000);
  void aiAmountRaw;


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
              {wallet?.wallet?.ai_credit_expires_at && (
                <p className="text-xs text-muted-foreground">
                  Expires {new Date(wallet.wallet.ai_credit_expires_at).toLocaleDateString()}
                  {" · "}{Math.max(0, Math.ceil((new Date(wallet.wallet.ai_credit_expires_at).getTime() - Date.now()) / 86_400_000))}d remaining
                </p>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input type="number" min={settings?.ai_credit_min_topup_kobo ? settings.ai_credit_min_topup_kobo / 100 : 300} value={aiAmount / 100} onChange={(e) => setAiAmount(Math.floor(parseFloat(e.target.value) * 100) || 0)} className="w-28" />
                <PayDialog purpose="ai_credit" amountKobo={aiAmount} label="Top up" size="sm" />
                <ContactAdmin purpose="AI credit" amount={aiAmount} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Min ₦{((settings?.ai_credit_min_topup_kobo ?? 30000)/100).toFixed(0)} · expires {settings?.ai_credit_expiry_days ?? 30}d</p>
            </CardContent>
          </Card>
        </div>

        <AdSlot placement="wallet" />

        <ProPlans settings={settings} status={status} />

        <FundWalletCard settings={settings} />

        <SpendCard wallet={wallet} settings={settings} buyAiFn={buyAiFn} buyCreatorFn={buyCreatorFn} />

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
  const [link, setLink] = useState<string | null>(null);
  const balance = wallet?.wallet?.balance_kobo ?? 0;
  const min = settings?.withdrawal_min_kobo ?? 100000;

  useEffect(() => { if (bank) setForm({ bank_name: bank.bank_name, account_number: bank.account_number, account_name: bank.account_name }); }, [bank]);

  async function submit() {
    try {
      await onSave({ data: form });
      const r: any = await onWithdraw({ data: { amount_kobo: amount } });
      setLink(r.whatsappUrl);
      toast.success("Request logged — tap the WhatsApp link to notify the admin.");
      qc.invalidateQueries({ queryKey: ["my-wallet"] });
    } catch (e: any) { toast.error(e?.message ?? "Withdrawal request failed"); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setLink(null); }}>
      <DialogTrigger asChild><Button size="sm" variant="outline" disabled={balance <= 0}>Withdraw</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Withdraw earnings</DialogTitle>
          <DialogDescription>Min {`₦${(min/100).toFixed(0)}`}. Available {`₦${(balance/100).toFixed(2)}`}. After submitting, send the WhatsApp message so the admin can process your payout.</DialogDescription>
        </DialogHeader>
        {link ? (
          <div className="space-y-3 text-sm">
            <p>Your request was logged and the funds are on hold. Send this message to complete it:</p>
            <Button asChild className="w-full"><a href={link} target="_blank" rel="noopener noreferrer">Open WhatsApp to notify admin</a></Button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div><Label>Amount (₦)</Label><Input type="number" min={min/100} max={balance/100} value={amount / 100 || ""} onChange={(e) => setAmount(Math.floor(parseFloat(e.target.value) * 100) || 0)} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Bank</Label><Input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} /></div>
                <div><Label>Account #</Label><Input value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} /></div>
              </div>
              <div><Label>Account name</Label><Input value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={submit} disabled={!amount || !form.bank_name || !form.account_number}>Send request</Button></DialogFooter>
          </>
        )}
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

function ProPlans({ settings, status }: any) {
  const base = settings?.creator_access_price_kobo ?? 0;
  const plans = (settings?.creator_plan_prices ?? {}) as Record<string, number>;
  const priceFor = (m: number) => (Number(plans[String(m)] ?? 0) > 0 ? Number(plans[String(m)]) : base * m);
  const active = !!status?.permissions;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" />{active ? "Extend Pro creator access" : "Upgrade to Pro creator"}</CardTitle>
        <CardDescription>
          {settings
            ? `${settings.creator_access_quiz_cap} quiz cap · unlimited questions · AI parsing & analytics${settings.creator_access_includes_ai ? " · AI included" : " · AI billed from credit"}`
            : "…"}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 3, 6, 12].map((m) => (
          <div key={m} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="font-medium">{m} month{m > 1 ? "s" : ""}</span>
              <span className="text-lg font-bold tabular-nums">{naira(priceFor(m))}</span>
            </div>
            <PayDialog purpose="creator_access" months={m as any} amountKobo={priceFor(m)} label="Pay with receipt" size="sm" />
            <ContactAdmin purpose={`${m}-month creator access`} amount={priceFor(m)} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}


function FundWalletCard({ settings }: any) {
  const [amount, setAmount] = useState(500000);
  const initFn = useServerFn(initiatePayment);
  const feePct = Number(settings?.topup_fee_pct ?? 5);
  const fee = Math.floor((amount * feePct) / 100);
  const net = amount - fee;
  const [busy, setBusy] = useState(false);

  async function fund() {
    setBusy(true);
    try {
      const r: any = await initFn({ data: { purpose: "wallet_topup", amount_kobo: amount } });
      window.location.href = r.checkoutUrl;
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start top-up");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Fund wallet</CardTitle>
        <CardDescription>Top up your spendable balance via Monnify. A {feePct}% platform fee applies.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div><Label>Amount (₦)</Label><Input type="number" min={100} value={amount / 100 || ""} onChange={(e) => setAmount(Math.floor(parseFloat(e.target.value) * 100) || 0)} className="w-32" /></div>
          <Button onClick={fund} disabled={busy || amount < 10000}>{busy ? "Starting…" : "Top up wallet"}</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          You pay {naira(amount)} · fee {naira(fee)} ({feePct}%) · credited to wallet <span className="font-semibold text-foreground">{naira(net)}</span>
        </p>
      </CardContent>
    </Card>
  );
}

function SpendCard({ wallet, settings, buyAiFn, buyCreatorFn }: any) {
  const qc = useQueryClient();
  const balance = wallet?.wallet?.balance_kobo ?? 0;
  const [aiAmt, setAiAmt] = useState(settings?.ai_credit_min_topup_kobo ?? 30000);
  const [months, setMonths] = useState(1);
  const base = settings?.creator_access_price_kobo ?? 0;
  const plans = (settings?.creator_plan_prices ?? {}) as Record<string, number>;
  const priceFor = (m: number) => (Number(plans[String(m)] ?? 0) > 0 ? Number(plans[String(m)]) : base * m);

  const buyAi = useMutation({
    mutationFn: () => buyAiFn({ data: { amount_kobo: aiAmt } }),
    onSuccess: () => { toast.success("AI credit purchased from wallet"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });
  const buyCreator = useMutation({
    mutationFn: () => buyCreatorFn({ data: { months } }),
    onSuccess: () => { toast.success("Creator access purchased from wallet"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Spend from wallet</CardTitle>
        <CardDescription>Use your wallet balance ({naira(balance)}) directly — no extra fees on internal spending.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div><Label>AI credit amount (₦)</Label><Input type="number" value={aiAmt / 100 || ""} onChange={(e) => setAiAmt(Math.floor(parseFloat(e.target.value) * 100) || 0)} className="w-28" /></div>
          <Button size="sm" variant="outline" onClick={() => buyAi.mutate()} disabled={buyAi.isPending || balance < aiAmt}>Buy AI credit</Button>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div><Label>Creator access (months)</Label>
            <select className="border rounded-md h-9 px-2 text-sm w-28" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              {[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} mo — {naira(priceFor(m))}</option>)}
            </select>
          </div>
          <Button size="sm" variant="outline" onClick={() => buyCreator.mutate()} disabled={buyCreator.isPending || balance < priceFor(months)}>Buy creator access</Button>
        </div>
        <p className="text-xs text-muted-foreground">Wallet money can also be used to pay for individual quizzes and to fund prize pools when creating a competition quiz.</p>
      </CardContent>
    </Card>
  );
}
