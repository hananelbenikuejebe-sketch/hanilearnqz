import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getUserAnalytics } from "@/lib/behavior.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/analytics/$userId")({
  component: UserAnalytics,
  head: () => ({
    meta: [
      { title: "User analytics — HaniLearn-QZ admin" },
      { name: "description", content: "Full activity, engagement, AI spend and money movement for a single HaniLearn-QZ account." },
      { property: "og:title", content: "User analytics — HaniLearn-QZ admin" },
      { property: "og:description", content: "Full activity, engagement, AI spend and money movement for a single account." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const naira = (k = 0) => `₦${(Number(k || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <Card><CardContent className="pt-6">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value ?? 0}</div>
    </CardContent></Card>
  );
}

function UserAnalytics() {
  const { userId } = useParams({ from: "/_authenticated/admin/analytics/$userId" });
  const fn = useServerFn(getUserAnalytics);
  const { data, isLoading, error } = useQuery({ queryKey: ["user-analytics", userId], queryFn: () => fn({ data: { user_id: userId } }) });

  const p: any = data?.profile;
  const t: any = data?.totals;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm"><Link to="/admin/analytics"><ArrowLeft className="mr-1 h-4 w-4" />Analytics</Link></Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading analytics…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      {data && (
        <>
          <div>
            <h1 className="text-2xl font-bold">{p?.full_name || p?.handle || userId}</h1>
            <p className="text-sm text-muted-foreground">
              {p?.email || "no email"} · {p?.school || "no school"} · {p?.level || "no level"}
              {p?.is_guest && <Badge variant="outline" className="ml-2">guest</Badge>}
            </p>
            <Button asChild size="sm" variant="outline" className="mt-2">
              <Link to="/profile/$userId" params={{ userId }}>View public profile</Link>
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Quizzes" value={`${t.quizzes} (${t.published} live)`} />
            <Stat label="Attempts" value={t.attempts} />
            <Stat label="Avg score" value={`${t.avg_score}%`} />
            <Stat label="AI calls" value={t.ai_calls} />
            <Stat label="AI spend" value={naira(t.ai_spend_kobo)} />
            <Stat label="Wallet" value={naira(data.wallet?.balance_kobo)} />
            <Stat label="AI credit" value={naira(data.wallet?.ai_credit_balance_kobo)} />
            <Stat label="Purchases" value={`${t.purchases} · ${naira(t.purchase_spend_kobo)}`} />
            <Stat label="Events" value={t.events} />
            <Stat label="Last active" value={t.last_active ? new Date(t.last_active).toLocaleDateString() : "never"} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">AI spend by feature</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="divide-y text-sm">
                  {data.ai_by_feature.map((r: any) => (
                    <div key={r.feature} className="flex items-center gap-3 p-3">
                      <Badge variant="outline">{r.feature}</Badge>
                      <span className="flex-1 text-xs text-muted-foreground">{r.calls} calls</span>
                      <span className="tabular-nums font-medium">{naira(r.cost_kobo)}</span>
                    </div>
                  ))}
                  {!data.ai_by_feature.length && <p className="p-6 text-center text-sm text-muted-foreground">No AI usage yet.</p>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Interests</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {((data.interests as any)?.categories ?? []).map((c: any) => (
                  <Badge key={typeof c === "string" ? c : c.category} variant="secondary">
                    {typeof c === "string" ? c : `${c.category} (${c.score ?? c.attempts ?? 0})`}
                  </Badge>
                ))}
                {!((data.interests as any)?.categories ?? []).length && <p className="text-sm text-muted-foreground">Not enough signal yet.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Recent attempts</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="divide-y text-sm">
                  {data.recent_attempts.map((a: any) => (
                    <div key={a.id} className="flex items-center gap-3 p-3">
                      <span className="flex-1 truncate text-xs text-muted-foreground">{a.submitted_at ? new Date(a.submitted_at).toLocaleString() : "in progress"}</span>
                      <span className="tabular-nums font-medium">{Math.round(Number(a.score_pct ?? 0))}%</span>
                    </div>
                  ))}
                  {!data.recent_attempts.length && <p className="p-6 text-center text-sm text-muted-foreground">No attempts yet.</p>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Money movement</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="divide-y text-sm">
                  {data.recent_transactions.map((tx: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-3">
                      <Badge variant="outline">{tx.kind}</Badge>
                      <span className="flex-1 truncate text-xs text-muted-foreground">{tx.bucket} · {new Date(tx.created_at).toLocaleString()}</span>
                      <span className="tabular-nums font-medium">{naira(tx.amount_kobo)}</span>
                    </div>
                  ))}
                  {!data.recent_transactions.length && <p className="p-6 text-center text-sm text-muted-foreground">No transactions yet.</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
