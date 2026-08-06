import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getUsersOverview, grantCreatorMonths } from "@/lib/admin-overview.functions";
import { adminGrantCredit } from "@/lib/wallet.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Infinity as InfinityIcon, Coins } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: Users,
});

const naira = (k = 0) => `₦${(Number(k || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function formatExpiry(label: string, iso: string | null | undefined) {
  if (!iso) return "None";
  const t = new Date(iso).getTime();
  if (t > new Date("2900-01-01").getTime()) return `${label} — lifetime`;
  const days = Math.ceil((t - Date.now()) / 86_400_000);
  const dateStr = new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  if (days < 0) return `Expired (${dateStr})`;
  return `${label} until ${dateStr} (${days}d left)`;
}

function Users() {
  const qc = useQueryClient();
  const overviewFn = useServerFn(getUsersOverview);
  const grantPlanFn = useServerFn(grantCreatorMonths);
  const grantCreditFn = useServerFn(adminGrantCredit);
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["users-overview", q], queryFn: () => overviewFn({ data: { q } }) });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["users-overview"] });
  const plan = useMutation({
    mutationFn: (v: any) => grantPlanFn({ data: v }),
    onSuccess: () => { toast.success("Creator access updated"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const credit = useMutation({
    mutationFn: (v: any) => grantCreditFn({ data: v }),
    onSuccess: () => { toast.success("Credit granted"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const t: any = data?.totals ?? {};

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold">Users & money</h1>
        <p className="text-muted-foreground">Every account, their plan, wallet, AI spend and activity in one place.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Users" value={t.users} />
        <Stat label="Guests" value={t.guests} />
        <Stat label="Pro creators" value={t.creators_active} />
        <Stat label="Wallet balances" value={naira(t.earnings_kobo)} />
        <Stat label="AI credit held" value={naira(t.ai_credit_kobo)} />
        <Stat label="AI spent" value={naira(t.ai_spent_kobo)} />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search name, email, handle or id…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Accounts</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading && <p className="p-6 text-sm text-muted-foreground">Loading…</p>}
          <div className="divide-y">
            {(data?.users ?? []).map((u: any) => (
              <div key={u.user_id} className="space-y-2 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to="/profile/$userId" params={{ userId: u.user_id }} className="font-medium hover:underline">
                    {u.full_name || u.handle || "Unnamed"}
                  </Link>
                  {u.is_guest && <Badge variant="outline">guest</Badge>}
                  {u.plan_active ? <Badge>{formatExpiry("Pro", u.plan_expires_at)}</Badge> : <Badge variant="outline">Pro: none</Badge>}
                  {u.roles.map((r: string) => <Badge key={r} variant="secondary">{r}</Badge>)}
                  <span className="text-xs text-muted-foreground">{u.email || "—"}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-6">
                  <span>Earnings <b className="text-foreground tabular-nums">{naira(u.balance_kobo)}</b></span>
                  <span>AI credit <b className="text-foreground tabular-nums">{naira(u.ai_credit_kobo)}</b> <span className="text-muted-foreground">({formatExpiry("credit", u.ai_credit_expires_at)})</span></span>
                  <span>AI spent <b className="text-foreground tabular-nums">{naira(u.ai_spent_kobo)}</b></span>
                  <span>AI calls <b className="text-foreground tabular-nums">{u.ai_calls}</b></span>
                  <span>Quizzes <b className="text-foreground tabular-nums">{u.quizzes} ({u.published} live)</b></span>
                  <span>Attempts <b className="text-foreground tabular-nums">{u.attempts}</b></span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {[1, 3, 6, 12].map((m) => (
                    <Button key={m} size="sm" variant="outline" disabled={plan.isPending}
                      onClick={() => plan.mutate({ user_id: u.user_id, months: m, infinite: false })}>+{m}m</Button>
                  ))}
                  <Button size="sm" variant="outline" disabled={plan.isPending}
                    onClick={() => plan.mutate({ user_id: u.user_id, months: 1, infinite: true })}>
                    <InfinityIcon className="mr-1 h-3.5 w-3.5" />Lifetime
                  </Button>
                  <Button size="sm" variant="ghost" disabled={plan.isPending}
                    onClick={() => plan.mutate({ user_id: u.user_id, months: 0, infinite: false })}>Revoke</Button>
                  <Button size="sm" variant="outline" disabled={credit.isPending}
                    onClick={() => {
                      const amount = window.prompt("Grant AI credit (₦)", "10");
                      if (amount) credit.mutate({ user_id: u.user_id, bucket: "ai_credit", amount_kobo: Math.round(parseFloat(amount) * 100) });
                    }}>
                    <Coins className="mr-1 h-3.5 w-3.5" />Credit
                  </Button>
                </div>
              </div>
            ))}
            {!isLoading && !(data?.users ?? []).length && <p className="p-6 text-center text-sm text-muted-foreground">No accounts match.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent money movement</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y text-sm">
            {(data?.recent_transactions ?? []).slice(0, 40).map((tx: any, i: number) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <Badge variant="outline">{tx.kind}</Badge>
                <span className="flex-1 truncate text-xs text-muted-foreground">{tx.bucket} · {new Date(tx.created_at).toLocaleString()}</span>
                <span className="tabular-nums font-medium">{naira(tx.amount_kobo)}</span>
              </div>
            ))}
            {!(data?.recent_transactions ?? []).length && <p className="p-6 text-center text-sm text-muted-foreground">No transactions yet.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <Card><CardContent className="pt-6">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value ?? 0}</div>
    </CardContent></Card>
  );
}
