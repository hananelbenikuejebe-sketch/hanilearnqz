import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { getStudentAnalytics, generateStudentAiSummary } from "@/lib/analytics.functions";
import { getMyCreatorStatus } from "@/lib/creators.functions";
import { getPublicProfile } from "@/lib/profiles.functions";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sparkles, TrendingUp, LogOut, Lock, ListChecks } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/profile/")({
  head: () => ({ meta: [
    { title: "My profile — HaniLearn-QZ" },
    { name: "description", content: "View your learning activity, quiz history and creator status." },
    { property: "og:title", content: "My profile — HaniLearn-QZ" },
    { property: "og:description", content: "View your learning activity, quiz history and creator status." },
    { property: "og:type", content: "profile" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Profile,
});

function PrivateNote({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-normal text-muted-foreground">
      <Lock className="h-3 w-3" />{children}
    </span>
  );
}

function Profile() {
  const navigate = useNavigate();
  const fetchFn = useServerFn(getStudentAnalytics);
  const statusFn = useServerFn(getMyCreatorStatus);
  const aiFn = useServerFn(generateStudentAiSummary);
  const publicFn = useServerFn(getPublicProfile);
  const { data, isLoading } = useQuery({ queryKey: ["my-analytics"], queryFn: () => fetchFn({ data: {} }) });
  const { data: status } = useQuery({ queryKey: ["creator-status"], queryFn: () => statusFn() });
  const [summary, setSummary] = useState<string | null>(null);
  const [me, setMe] = useState<{ id: string; name: string; email: string; guest: boolean; joined?: string } | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data: u }) => {
      if (u.user) setMe({
        id: u.user.id,
        name: (u.user.user_metadata?.full_name as string) || u.user.email || "Guest",
        email: u.user.email || "—",
        guest: (u.user.user_metadata?.guest as boolean) ?? !u.user.email,
        joined: u.user.created_at,
      });
    });
  }, []);
  const { data: pub } = useQuery({
    queryKey: ["public-profile", me?.id],
    queryFn: () => publicFn({ data: { user_id: me!.id } }),
    enabled: !!me?.id,
  });
  const ai = useMutation({ mutationFn: () => aiFn({ data: {} }), onSuccess: (r: any) => setSummary(r.summary), onError: (e: any) => toast.error(e.message) });

  const initials = (me?.name || "?").split(" ").filter(Boolean).map((s) => s[0]).join("").slice(0, 2).toUpperCase();

  return (
    <AppShell isSuperAdmin={status?.is_super_admin}>
      <div className="mx-auto max-w-5xl space-y-4 p-3 md:p-8">
        <Card>
          <CardContent className="p-4 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start">
              <div className="flex min-w-0 flex-1 items-start gap-3 md:gap-4">
                <Avatar className="h-14 w-14 shrink-0 md:h-16 md:w-16"><AvatarFallback className="text-base">{initials}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="min-w-0 break-words text-xl md:text-2xl">{me?.name ?? "…"}</h1>
                    {me?.guest && <Badge variant="outline">Guest</Badge>}
                    {status?.is_super_admin && <Badge>Super admin</Badge>}
                    {/* Earned, not granted: the Creator title only appears after a first quiz. */}
                    {!status?.is_super_admin && (status?.quizzes_created ?? 0) > 0 && <Badge variant="secondary">Creator</Badge>}
                  </div>
                  {pub?.profile?.handle && <p className="text-sm text-muted-foreground">@{pub.profile.handle}</p>}
                  <p className="break-all text-sm text-muted-foreground">{me?.email}</p>
                  {me?.joined && <p className="text-xs text-muted-foreground">Joined {new Date(me.joined).toLocaleDateString()}</p>}
                  {status?.effective?.tier === "free" && (
                    <p className="mt-1 text-xs text-muted-foreground">Free creator · {status.effective.max_quizzes} quizzes/month · {status.effective.max_questions_per_quiz} questions/quiz</p>
                  )}
                  {pub && (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="tabular-nums"><b className="text-foreground">{pub.quizzes.length}</b> quizzes created</span>
                      <span className="tabular-nums"><b className="text-foreground">{pub.followers}</b> followers</span>
                      <span className="tabular-nums"><b className="text-foreground">{pub.following}</b> following</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {me?.guest && <Button size="sm" onClick={() => navigate({ to: "/auth" })}>Sign up</Button>}
                <Button size="sm" variant="outline" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}>
                  <LogOut className="mr-1 h-4 w-4" />Sign out
                </Button>
              </div>
            </div>

          </CardContent>
        </Card>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {data && (
          <>
            <div>
              <h2 className="mb-2 flex items-center gap-2">Overview <PrivateNote>Only you can see this</PrivateNote></h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Attempts" value={data.summary.attempts} />
                <Stat label="Avg score" value={`${data.summary.avg_score}%`} />
                <Stat label="Best" value={`${data.summary.best_score}%`} />
                <Stat label="Pass rate" value={`${data.summary.pass_rate}%`} />
              </div>
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
                  ? <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{summary}</pre>
                  : <p className="text-sm text-muted-foreground">Personalised study summary based on your recent attempts.</p>}
              </CardContent>
            </Card>

            {data.categories.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">By category</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {data.categories.map((c: any) => (
                    <div key={c.category} className="flex items-center gap-3">
                      <div className="w-24 truncate text-sm font-medium md:w-32">{c.category}</div>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary" style={{ width: `${Math.min(100, c.avg)}%` }} />
                      </div>
                      <div className="w-20 shrink-0 text-right text-sm tabular-nums md:w-24">{c.avg}% · {c.attempts}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {data.trend.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" />Recent trend</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex h-32 items-end gap-1">
                    {data.trend.map((t: any, i: number) => (
                      <div key={i} title={`${t.title} · ${t.score}%`} className="flex-1 rounded-t bg-primary/70 transition hover:bg-primary" style={{ height: `${Math.max(4, t.score)}%` }} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {pub && pub.quizzes.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><ListChecks className="h-4 w-4" />My quizzes</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {pub.quizzes.map((q: any) => (
                      <Link key={q.id} to="/quiz/$quizId" params={{ quizId: q.id }} className="flex items-center gap-3 p-3 text-sm hover:bg-accent/40">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{q.title}</div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="secondary">{q.category}</Badge>
                            <span className="capitalize">{q.difficulty}</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2">Activity <PrivateNote>Only you can see this</PrivateNote></CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {data.history.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No attempts yet.</div>}
                  {data.history.map((a: any) => (
                    <Link key={a.id} to="/quiz/$quizId/result/$attemptId" params={{ quizId: a.quiz_id, attemptId: a.id }}
                      className="flex items-center gap-3 p-3 text-sm hover:bg-accent/40">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{a.quizzes?.title ?? "Untitled"}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {a.quizzes?.category && <Badge variant="secondary">{a.quizzes.category}</Badge>}
                          {a.submitted_at && <span>{new Date(a.submitted_at).toLocaleString()}</span>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-bold tabular-nums">{Number(a.score_pct).toFixed(0)}%</div>
                        <div className="text-xs text-muted-foreground tabular-nums">{a.correct_count}/{a.total}</div>
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
    <Card><CardContent className="pt-4 md:pt-6">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums md:text-2xl">{value}</div>
    </CardContent></Card>
  );
}
