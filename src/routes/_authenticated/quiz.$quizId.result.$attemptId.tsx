import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAttemptDetail } from "@/lib/attempts.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Home, RotateCw } from "lucide-react";
import { SocialPanel } from "@/components/social-panel";

export const Route = createFileRoute("/_authenticated/quiz/$quizId/result/$attemptId")({
  component: ResultPage,
});

function ResultPage() {
  const { quizId, attemptId } = Route.useParams();
  const fetchDetail = useServerFn(getAttemptDetail);
  const { data, isLoading } = useQuery({
    queryKey: ["attempt", attemptId],
    queryFn: () => fetchDetail({ data: { id: attemptId } }),
  });

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
              return (
                <Card key={q.id}>
                  <CardContent className="pt-6">
                    <div className="flex gap-2 items-start mb-3">
                      {(q.type === "mcq" || q.type === "tf") ? (
                        isCorrect ? <Check className="h-5 w-5 text-success mt-1" /> : <X className="h-5 w-5 text-destructive mt-1" />
                      ) : <Badge variant="secondary">Manual</Badge>}
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
                        <div className="p-2 border rounded">{ans || <em>blank</em>}</div>
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
      </main>
    </div>
  );
}
