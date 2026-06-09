import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAttemptsForQuiz } from "@/lib/attempts.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/quizzes/$id/results")({
  component: Results,
});

function Results() {
  const { id } = Route.useParams();
  const fetchFn = useServerFn(listAttemptsForQuiz);
  const { data } = useQuery({ queryKey: ["attempts", id], queryFn: () => fetchFn({ data: { quiz_id: id } }) });
  const attempts = data ?? [];
  const avg = attempts.length ? attempts.reduce((s: number, a: any) => s + Number(a.score_pct), 0) / attempts.length : 0;
  const pass = attempts.filter((a: any) => Number(a.score_pct) >= 50).length;

  function exportCsv() {
    const rows = [["Student", "Email", "Score%", "Correct", "Total", "Time (s)", "Submitted"]];
    for (const a of attempts) {
      rows.push([a.student?.full_name ?? "", a.student?.email ?? "", a.score_pct, a.correct_count, a.total, a.time_taken_sec, a.submitted_at ?? ""]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `results-${id}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild><Link to="/admin/quizzes"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link></Button>
        <h1 className="text-2xl font-bold flex-1">Results</h1>
        <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Attempts</div><div className="text-2xl font-bold">{attempts.length}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Avg score</div><div className="text-2xl font-bold">{avg.toFixed(1)}%</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Pass rate</div><div className="text-2xl font-bold">{attempts.length ? Math.round((pass/attempts.length)*100) : 0}%</div></CardContent></Card>
      </div>
      <Card><CardContent className="p-0">
        <div className="divide-y">
          {attempts.map((a: any) => (
            <div key={a.id} className="p-3 flex items-center justify-between text-sm">
              <div><div className="font-medium">{a.student?.full_name ?? "Unknown"}</div><div className="text-muted-foreground text-xs">{a.student?.email}</div></div>
              <div className="text-right">
                <div className="font-bold">{Number(a.score_pct).toFixed(0)}%</div>
                <div className="text-xs text-muted-foreground">{new Date(a.submitted_at).toLocaleString()}</div>
              </div>
            </div>
          ))}
          {!attempts.length && <div className="p-8 text-center text-muted-foreground">No attempts yet.</div>}
        </div>
      </CardContent></Card>
    </div>
  );
}
