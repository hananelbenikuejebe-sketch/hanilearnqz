import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Activity } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getBehaviorInsights } from "@/lib/behavior.functions";

const naira = (k = 0) => `₦${(Number(k || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

/** Super-admin rollup of what users actually do: top content, interests, retention and AI spend. */
export function BehaviorInsightsPanel() {
  const fn = useServerFn(getBehaviorInsights);
  const { data, isLoading, error } = useQuery({ queryKey: ["behavior-insights"], queryFn: () => fn(), staleTime: 60_000 });

  if (error) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4" />Behavior &amp; interests</CardTitle>
        <CardDescription>What people engage with, who is most active, and where AI credit goes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading && <p className="text-sm text-muted-foreground">Crunching activity…</p>}
        {data && (
          <>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Mini label="Active (7d)" value={data.retention.active_7d} />
              <Mini label="Active (30d)" value={data.retention.active_30d} />
              <Mini label="Dormant" value={data.retention.dormant} />
              <Mini label="AI calls" value={data.ai_usage.total_calls} />
              <Mini label="AI spend" value={naira(data.ai_usage.total_cost_kobo)} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-semibold">Top quizzes by engagement</h3>
                <div className="divide-y rounded-md border">
                  {data.top_quizzes.map((q: any) => (
                    <Link key={q.id} to="/quiz/$quizId" params={{ quizId: q.id }} className="flex items-center gap-2 p-2 text-sm hover:bg-muted/50">
                      <span className="min-w-0 flex-1 truncate">{q.title}</span>
                      <Badge variant="outline" className="text-[10px]">{q.category}</Badge>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{q.attempts}a · {q.likes}♥ · {q.shares}↗</span>
                    </Link>
                  ))}
                  {!data.top_quizzes.length && <p className="p-3 text-sm text-muted-foreground">No engagement yet.</p>}
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold">Top categories</h3>
                <div className="space-y-1.5">
                  {data.top_categories.map((c: any) => {
                    const max = data.top_categories[0]?.attempts || 1;
                    return (
                      <div key={c.category} className="flex items-center gap-2 text-sm">
                        <span className="w-28 shrink-0 truncate">{c.category}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full bg-primary" style={{ width: `${Math.max(4, (c.attempts / max) * 100)}%` }} />
                        </span>
                        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{c.attempts}</span>
                      </div>
                    );
                  })}
                  {!data.top_categories.length && <p className="text-sm text-muted-foreground">No attempts yet.</p>}
                </div>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">Most active users &amp; their interests</h3>
              <div className="divide-y rounded-md border">
                {data.most_active_users.map((u: any) => (
                  <div key={u.user_id} className="flex flex-wrap items-center gap-2 p-2 text-sm">
                    <Link to="/profile/$userId" params={{ userId: u.user_id }} className="font-medium hover:underline">{u.name}</Link>
                    {u.is_guest && <Badge variant="outline" className="text-[10px]">guest</Badge>}
                    <span className="text-xs text-muted-foreground">{u.attempts} attempts · {u.events} events{u.days_since_active != null ? ` · ${u.days_since_active}d ago` : ""}</span>
                    <span className="flex flex-wrap gap-1">
                      {(u.interest_tags ?? []).slice(0, 5).map((t: string) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                    </span>
                  </div>
                ))}
                {!data.most_active_users.length && <p className="p-3 text-sm text-muted-foreground">No activity yet.</p>}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">AI usage by feature</h3>
              <div className="flex flex-wrap gap-2">
                {data.ai_usage.by_feature.map((f: any) => (
                  <Badge key={f.feature} variant="outline">{f.feature}: {f.calls}</Badge>
                ))}
                {!data.ai_usage.by_feature.length && <p className="text-sm text-muted-foreground">No AI calls logged yet.</p>}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value ?? 0}</div>
    </div>
  );
}
