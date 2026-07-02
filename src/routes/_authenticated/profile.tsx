import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { getStudentAnalytics, generateStudentAiSummary } from "@/lib/analytics.functions";
import { getMyCreatorStatus } from "@/lib/creators.functions";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sparkles, TrendingUp, LogOut, User as UserIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — HaniLearn-QZ" }] }),
  component: Profile,
});

function Profile() {
  const navigate = useNavigate();
  const fetchFn = useServerFn(getStudentAnalytics);
  const statusFn = useServerFn(getMyCreatorStatus);
  const aiFn = useServerFn(generateStudentAiSummary);
  const { data, isLoading } = useQuery({ queryKey: ["my-analytics"], queryFn: () => fetchFn({ data: {} }) });
  const { data: status } = useQuery({ queryKey: ["creator-status"], queryFn: () => statusFn() });
  const [summary, setSummary] = useState<string | null>(null);
  const [me, setMe] = useState<{ name: string; email: string; guest: boolean } | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data: u }) => {
      if (u.user) setMe({
        name: (u.user.user_metadata?.full_name as string) || u.user.email || "Guest",
        email: u.user.email || "—",
        guest: (u.user.user_metadata?.guest as boolean) ?? !u.user.email,
      });
    });
  }, []);
  const ai = useMutation({ mutationFn: () => aiFn({ data: {} }), onSuccess: (r: any) => setSummary(r.summary), onError: (e: any) => toast.error(e.message) });

  const initials = (me?.name || "?").split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();

  return (
    <AppShell isSuperAdmin={status?.is_super_admin}>
      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <Avatar className="h-16 w-16"><AvatarFallback className="text-lg">{initials}</AvatarFallback></Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold truncate">{me?.name ?? "…"}</h1>
                {me?.guest && <Badge variant="outline">Guest</Badge>}
                {status?.is_super_admin && <Badge>Super admin</Badge>}
                {status?.can_create && !status?.is_super_admin && <Badge variant="secondary">Creator</Badge>}
              </div>
              <p className="text-sm text-muted-foreground truncate">{me?.email}</p>
            </div>
            <div className="flex gap-2">
              {me?.guest && <Button size="sm" onClick={() => navigate({ to: "/auth" })}>Sign up</Button>}
              <Button size="sm" variant="outline" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}>
                <LogOut className="h-4 w-4 mr-1" />Sign out
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading && <p className="text-muted-foreground">Loading…</p>}
        {data && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Attempts" value={data.summary.attempts} />
              <Stat label="Avg score" value={`${data.summary.avg_score}%`} />
              <Stat label="Best" value={`${data.summary.best_score}%`} />
              <Stat label="Pass rate" value={`${data.summary.pass_rate}%`} />
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" />AI Coach</CardTitle>
                <Button type="button" size="sm" onClick={() => ai.mutate()} disabled={ai.isPending || !data.summary.attempts}>
                  {ai.isPending ? "Thinking…" : summary ? "Regenerate" : "Generate"}
                </Button>
              </CardHeader>
              <CardContent>
                {summary
                  ? <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">{summary}</pre>
                  : <p className="text-sm text-muted-foreground">Personalised study summary based on your recent attempts.</p>}
              </CardContent>
            </Card>

            {data.categories.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">By category</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {data.categories.map((c: any) => (
                    <div key={c.category} className="flex items-center gap-3">
                      <div className="w-32 text-sm font-medium truncate">{c.category}</div>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${Math.min(100, c.avg)}%` }} />
                      </div>
                      <div className="w-24 text-right text-sm tabular-nums">{c.avg}% · {c.attempts}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {data.trend.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" />Recent trend</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex items-end gap-1 h-32">
                    {data.trend.map((t: any, i: number) => (
                      <div key={i} title={`${t.title} · ${t.score}%`} className="flex-1 bg-primary/70 rounded-t hover:bg-primary transition" style={{ height: `${Math.max(4, t.score)}%` }} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle className="text-base">History</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {data.history.length === 0 && <div className="p-6 text-center text-muted-foreground text-sm">No attempts yet.</div>}
                  {data.history.map((a: any) => (
                    <Link key={a.id} to="/quiz/$quizId/result/$attemptId" params={{ quizId: a.quiz_id, attemptId: a.id }}
                      className="flex items-center gap-3 p-3 hover:bg-accent/40 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{a.quizzes?.title ?? "Untitled"}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          {a.quizzes?.category && <Badge variant="secondary">{a.quizzes.category}</Badge>}
                          {a.submitted_at && <span>{new Date(a.submitted_at).toLocaleString()}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold tabular-nums">{Number(a.score_pct).toFixed(0)}%</div>
                        <div className="text-xs text-muted-foreground">{a.correct_count}/{a.total}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <Card><CardContent className="pt-6">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
    </CardContent></Card>
  );
}
