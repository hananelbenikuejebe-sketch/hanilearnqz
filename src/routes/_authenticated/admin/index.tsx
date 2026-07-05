import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAdminAnalytics, getMyCreatorAnalytics } from "@/lib/analytics.functions";
import { getMyRole } from "@/lib/role.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, TrendingUp, Trophy, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: Dashboard,
});

function Dashboard() {
  const roleFn = useServerFn(getMyRole);
  const { data: role } = useQuery({ queryKey: ["role"], queryFn: () => roleFn() });
  const isAdmin = !!role?.isAdmin;
  const adminFn = useServerFn(getAdminAnalytics);
  const creatorFn = useServerFn(getMyCreatorAnalytics);
  const { data, isLoading } = useQuery({
    queryKey: ["dash-analytics", isAdmin ? "admin" : "creator"],
    queryFn: () => (isAdmin ? adminFn() : creatorFn()),
    enabled: !!role,
  });

  const summary: any = data?.summary ?? {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{isAdmin ? "Dashboard" : "My dashboard"}</h1>
          <p className="text-muted-foreground">{isAdmin ? "Live performance across all quizzes" : "Performance across your own quizzes"}</p>
        </div>
        <Button asChild><Link to="/admin/quizzes/new"><Plus className="h-4 w-4 mr-1" />New quiz</Link></Button>
      </div>

      {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Quizzes" value={summary.quizzes} />
            <Stat label="Published" value={summary.published} />
            {isAdmin && <Stat label="Students" value={summary.students} />}
            <Stat label="Attempts" value={summary.attempts} />
            <Stat label="Avg score" value={`${summary.avg_score}%`} />
            <Stat label="Pass rate" value={`${summary.pass_rate}%`} />
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" />Attempts — last 30 days</CardTitle></CardHeader>
            <CardContent>
              {(data.trend ?? []).every((t: any) => t.attempts === 0)
                ? <p className="text-sm text-muted-foreground">No attempts yet.</p>
                : (
                  <div className="flex items-end gap-[2px] h-32">
                    {(data.trend ?? []).map((t: any) => {
                      const max = Math.max(...data.trend.map((x: any) => x.attempts), 1);
                      const h = (t.attempts / max) * 100;
                      return <div key={t.date} title={`${t.date}: ${t.attempts} attempts, ${t.avg}% avg`} className="flex-1 bg-primary/70 hover:bg-primary rounded-t" style={{ height: `${Math.max(2, h)}%` }} />;
                    })}
                  </div>
                )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4" />Top quizzes</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {(data.top_quizzes ?? []).length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No attempts yet.</div>}
                  {(data.top_quizzes ?? []).map((q: any) => (
                    <Link key={q.id} to="/admin/quizzes/$id/results" params={{ id: q.id }}
                      className="flex items-center gap-3 p-3 hover:bg-accent/40 text-sm">
                      <div className="flex-1 min-w-0 truncate font-medium">{q.title}</div>
                      <div className="text-right text-xs tabular-nums text-muted-foreground">{q.attempts} attempts · {q.avg}%</div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            {isAdmin && (data as any).categories && (
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" />By category</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {(data as any).categories.length === 0 && <p className="text-sm text-muted-foreground">No data yet.</p>}
                  {(data as any).categories.map((c: any) => (
                    <div key={c.category} className="flex items-center gap-3">
                      <div className="w-28 text-sm truncate">{c.category}</div>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-accent" style={{ width: `${Math.min(100, c.avg)}%` }} />
                      </div>
                      <div className="w-24 text-right text-xs tabular-nums">{c.avg}% · {c.attempts}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <Card><CardContent className="pt-6">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold tabular-nums">{value ?? 0}</div>
    </CardContent></Card>
  );
}
