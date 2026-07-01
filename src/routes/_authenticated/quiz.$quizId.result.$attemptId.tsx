import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getAttemptDetail } from "@/lib/attempts.functions";
import { gradeOpenAnswer } from "@/lib/ai-parse.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Home, RotateCw, Sparkles, Loader2 } from "lucide-react";
import { SocialPanel } from "@/components/social-panel";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/quiz/$quizId/result/$attemptId")({
  component: ResultPage,
});

type Grade = { score: number; percent: number; feedback: string; strengths: string[]; weaknesses: string[] };

function ResultPage() {
  const { quizId, attemptId } = Route.useParams();
  const fetchDetail = useServerFn(getAttemptDetail);
  const gradeFn = useServerFn(gradeOpenAnswer);
  const { data, isLoading } = useQuery({
    queryKey: ["attempt", attemptId],
    queryFn: () => fetchDetail({ data: { id: attemptId } }),
  });
  const [grades, setGrades] = useState<Record<string, Grade | "loading" | { error: string }>>({});

  async function runGrade(q: any, ans: string) {
    setGrades((g) => ({ ...g, [q.id]: "loading" }));
    try {
      const res = await gradeFn({ data: {
        question: q.text,
        sample_answer: q.sample_answer ?? null,
        student_answer: ans,
        max_points: Number(q.points) || 10,
      }});
      setGrades((g) => ({ ...g, [q.id]: res as Grade }));
    } catch (e: any) {
      setGrades((g) => ({ ...g, [q.id]: { error: e?.message ?? "Grading failed" } }));
      toast.error(e?.message ?? "Grading failed");
    }
  }

  if (isLoading || !data) return <div className="min-h-screen flex items-center justify-center">Loading…</div>;
  const { attempt, quiz, questions } = data;
  const pass = Number(attempt.score_pct) >= 50;
  const showAnswers = quiz?.show_answers_after;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <Card className="mb-6">
          <CardHeader><CardTitle>{quiz?.title}</CardTitle></CardHeader>
          <CardContent>
            <div className="text-center py-6">
              <div className={`text-6xl font-bold ${pass ? "text-success" : "text-destructive"}`}>{Number(attempt.score_pct).toFixed(0)}%</div>
              <Badge variant={pass ? "default" : "destructive"} className="mt-2">{pass ? "Passed" : "Failed"}</Badge>
              <div className="text-sm text-muted-foreground mt-3">
                {attempt.correct_count}/{attempt.total} correct · {Math.floor(attempt.time_taken_sec / 60)}m {attempt.time_taken_sec % 60}s
              </div>
            </div>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" asChild><Link to="/"><Home className="h-4 w-4 mr-1" />Home</Link></Button>
              {quiz?.allow_retakes && (
                <Button asChild><Link to="/quiz/$quizId" params={{ quizId }}><RotateCw className="h-4 w-4 mr-1" />Retake</Link></Button>
              )}
            </div>
          </CardContent>
        </Card>

        {showAnswers && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Review</h2>
            {questions.map((q: any, i: number) => {
              const ans = (attempt.answers as any)[q.id];
              const correctIds = q.options.filter((o: any) => o.is_correct).map((o: any) => o.id);
              const ansArr = Array.isArray(ans) ? ans : ans ? [ans] : [];
              const isCorrect = correctIds.length === ansArr.length && correctIds.every((c: string) => ansArr.includes(c));
              const grade = grades[q.id];
              return (
                <Card key={q.id}>
                  <CardContent className="pt-6">
                    <div className="flex gap-2 items-start mb-3">
                      {(q.type === "mcq" || q.type === "tf") ? (
                        isCorrect ? <Check className="h-5 w-5 text-success mt-1" /> : <X className="h-5 w-5 text-destructive mt-1" />
                      ) : <Badge variant="secondary">AI-graded</Badge>}
                      <div className="flex-1">
                        <p className="font-medium">{i + 1}. {q.text}</p>
                      </div>
                    </div>
                    {(q.type === "mcq" || q.type === "tf") && (
                      <div className="space-y-1 ml-7">
                        {q.options.map((o: any) => (
                          <div key={o.id} className={`text-sm px-3 py-2 rounded border ${
                            o.is_correct ? "border-success bg-success/10" : ansArr.includes(o.id) ? "border-destructive bg-destructive/10" : "border-border"
                          }`}>{o.text}</div>
                        ))}
                      </div>
                    )}
                    {(q.type === "short" || q.type === "essay") && (
                      <div className="ml-7 text-sm space-y-2">
                        <div className="text-muted-foreground">Your answer:</div>
                        <div className="p-2 border rounded whitespace-pre-wrap">{ans || <em>blank</em>}</div>
                        {q.sample_answer && (
                          <>
                            <div className="text-muted-foreground">Model answer:</div>
                            <div className="p-2 border rounded bg-muted/40 whitespace-pre-wrap">{q.sample_answer}</div>
                          </>
                        )}
                        {!grade && ans && (
                          <Button size="sm" variant="outline" type="button" onClick={() => runGrade(q, String(ans))}>
                            <Sparkles className="h-3 w-3 mr-1" />AI grade this answer
                          </Button>
                        )}
                        {grade === "loading" && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Marking…</div>
                        )}
                        {grade && typeof grade === "object" && "percent" in grade && (
                          <div className="border rounded p-3 space-y-2 bg-accent/5">
                            <div className="flex items-center gap-2">
                              <Badge variant={grade.percent >= 50 ? "default" : "destructive"}>{grade.percent}% · {grade.score}/{Number(q.points) || 10} pts</Badge>
                            </div>
                            <div className="text-sm">{grade.feedback}</div>
                            {grade.strengths?.length > 0 && (
                              <div className="text-xs"><strong className="text-emerald-600 dark:text-emerald-400">Strengths:</strong> {grade.strengths.join(" · ")}</div>
                            )}
                            {grade.weaknesses?.length > 0 && (
                              <div className="text-xs"><strong className="text-amber-600 dark:text-amber-400">Improve:</strong> {grade.weaknesses.join(" · ")}</div>
                            )}
                          </div>
                        )}
                        {grade && typeof grade === "object" && "error" in grade && (
                          <div className="text-xs text-destructive">{grade.error}</div>
                        )}
                      </div>
                    )}
                    {quiz?.show_explanations && q.explanation && (
                      <div className="ml-7 mt-3 text-sm bg-accent/10 p-3 rounded border-l-2 border-accent">
                        <strong>Explanation:</strong> {q.explanation}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div className="mt-6">
          <SocialPanel quizId={quizId} quizTitle={quiz?.title} />
        </div>
      </main>
    </div>
  );
}
