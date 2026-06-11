import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getStudentAnalytics, generateStudentAiSummary } from "@/lib/analytics.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { ArrowLeft, Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/results")({
  head: () => ({ meta: [{ title: "My results — HaniLearn-QZ" }] }),
  component: ResultsPage,
});

function ResultsPage() {
  const fetchFn = useServerFn(getStudentAnalytics);
  const aiFn = useServerFn(generateStudentAiSummary);
  const { data, isLoading } = useQuery({ queryKey: ["my-analytics"], queryFn: () => fetchFn({ data: {} }) });
  const [summary, setSummary] = useState<string | null>(null);
  const ai = useMutation({
    mutationFn: () => aiFn({ data: {} }),
    onSuccess: (r: any) => setSummary(r.summary),
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild><Link to="/"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link></Button>
          <span className="font-bold">My Results</span>
          <ThemeToggle />
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 max-w-5xl space-y-6">
        {isLoading && <p className="text-muted-foreground">Loading…</p>}
        {data && (
          <>
            <div className="grid sm:grid-cols-4 gap-3">
              <Stat label="Attempts" value={data.summary.attempts} />
              <Stat label="Avg score" value={`${data.summary.avg_score}%`} />
              <Stat label="Best" value={`${data.summary.best_score}%`} />
              <Stat label="Pass rate" value={`${data.summary.pass_rate}%`} />
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" />AI Coach summary</CardTitle>
                <Button type="button" size="sm" onClick={() => ai.mutate()} disabled={ai.isPending || !data.summary.attempts}>
                  {ai.isPending ? "Thinking…" : summary ? "Regenerate" : "Generate"}
                </Button>
              </CardHeader>
              <CardContent>
                {summary
                  ? <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">{summary}</pre>
                  : <p className="text-sm text-muted-foreground">Get a personalised study summary based on your last 30 attempts.</p>}
              </CardContent>
            </Card>

            {data.categories.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Performance by category</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {data.categories.map((c) => (
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
                    {data.trend.map((t, i) => (
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
      </main>
    </div>
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
