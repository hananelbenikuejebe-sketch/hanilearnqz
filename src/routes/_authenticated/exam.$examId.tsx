import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getExam } from "@/lib/exams.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Clock, GraduationCap, Play, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/exam/$examId")({
  component: ExamPlayer,
});

function ExamPlayer() {
  const { examId } = Route.useParams();
  const fetchExam = useServerFn(getExam);
  const { data: exam, isLoading, error } = useQuery({
    queryKey: ["exam-player", examId],
    queryFn: () => fetchExam({ data: { id: examId } }),
  });

  if (isLoading) return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Loading exam…</div>;
  if (error || !exam) return (
    <div className="min-h-screen grid place-items-center p-6">
      <Card className="max-w-md text-center"><CardContent className="p-6 space-y-3">
        <ShieldAlert className="h-10 w-10 mx-auto text-muted-foreground" />
        <h2 className="font-semibold">Exam unavailable</h2>
        <p className="text-sm text-muted-foreground">{(error as any)?.message ?? "This exam is not published or does not exist."}</p>
        <Button asChild variant="outline"><Link to="/exams">Back to exams</Link></Button>
      </CardContent></Card>
    </div>
  );

  const quizzes = (exam.exam_quizzes ?? [])
    .slice()
    .sort((a: any, b: any) => a.position - b.position)
    .map((eq: any) => eq.quizzes)
    .filter(Boolean);
  const totalDuration = quizzes.reduce((s: number, q: any) => s + (q.duration_min ?? 0), 0);

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-3 py-4 sm:py-6 space-y-4">
        <Button asChild variant="ghost" size="sm"><Link to="/exams"><ArrowLeft className="h-4 w-4 mr-1" />All exams</Link></Button>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-2xl flex items-center gap-2"><GraduationCap className="h-6 w-6" />{exam.title}</CardTitle>
                {exam.description && <CardDescription className="mt-1">{exam.description}</CardDescription>}
              </div>
              <Badge variant={exam.is_published ? "default" : "outline"}>{exam.is_published ? "Live" : "Draft"}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 text-sm mb-4">
              <Stat label="Quizzes" value={`${quizzes.length}`} />
              <Stat label="Total time" value={`~${totalDuration}m`} icon={<Clock className="h-4 w-4" />} />
              <Stat label="Order" value={exam.order_mode === "random" ? "Random" : "Sequential"} />
            </div>
            <p className="text-sm text-muted-foreground">Take each quiz below in order. Your progress is saved per quiz; you can return here to continue the exam.</p>
          </CardContent>
        </Card>

        <div className="space-y-2">
          {quizzes.length === 0 && (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">This exam has no quizzes yet.</CardContent></Card>
          )}
          {quizzes.map((q: any, i: number) => (
            <Card key={q.id} className="hover:shadow-md transition">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-md bg-primary text-primary-foreground font-bold shrink-0">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{q.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{q.category} · {q.difficulty} · {q.duration_min}m
                    {q.price_kobo > 0 && <span className="ml-2 text-amber-600 font-medium">₦{(q.price_kobo/100).toLocaleString()}</span>}
                    {q.visibility === "private" && <span className="ml-2">· Private</span>}
                  </div>
                </div>
                <Button asChild size="sm">
                  <Link to="/quiz/$quizId" params={{ quizId: q.id }}>
                    <Play className="h-4 w-4 mr-1" />Start
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-[11px] uppercase text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className="text-sm font-semibold mt-1">{value}</div>
    </div>
  );
}
