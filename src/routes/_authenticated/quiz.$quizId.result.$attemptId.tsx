import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef } from "react";
import { getAttemptDetail, finalizeGrading } from "@/lib/attempts.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Home, RotateCw, Loader2, AlertTriangle, Sparkles, Wallet } from "lucide-react";
import { SocialPanel } from "@/components/social-panel";
import { AdSlot } from "@/components/ad-slot";

export const Route = createFileRoute("/_authenticated/quiz/$quizId/result/$attemptId")({
  component: ResultPage,
});

function ResultPage() {
  const { quizId, attemptId } = Route.useParams();
  const fetchDetail = useServerFn(getAttemptDetail);
  const finalize = useServerFn(finalizeGrading);
  const qc = useQueryClient();
  const startedRef = useRef(false);

  const { data, isLoading } = useQuery({
    queryKey: ["attempt", attemptId],
    queryFn: () => fetchDetail({ data: { id: attemptId } }),
  });

  const feedback = (data?.attempt?.ai_feedback ?? {}) as any;
  const per: Record<string, any> = feedback.per_question ?? {};
  const pendingAi = feedback.grading_status === "pending_ai";

  // Finish AI marking as soon as the corrections page opens, then refresh.
  useEffect(() => {
    if (!pendingAi || startedRef.current) return;
    startedRef.current = true;
    finalize({ data: { attempt_id: attemptId } })
      .catch(() => {})
      .finally(() => { void qc.invalidateQueries({ queryKey: ["attempt", attemptId] }); });
  }, [pendingAi, attemptId, finalize, qc]);

  if (isLoading || !data) {
    return (
      <div className="min-h-screen grid place-items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />Loading your corrections…
      </div>
    );
  }

  const { attempt, quiz, questions } = data as any;
  const pointsAwarded = Number(attempt.points_awarded ?? 0);
  const pointsMax = Number(attempt.points_max ?? 0);
  const pct = Number(attempt.score_pct ?? 0);
  const pass = pct >= 50;
  const showAnswers = quiz?.show_answers_after !== false;
  const ungradable = Object.values(per).filter((r: any) => r?.status === "ungradable").length;

  return (
    <div className="min-h-screen bg-background pb-24">
      <main className="container mx-auto max-w-3xl px-3 py-6">
        <Card className="mb-5">
          <CardHeader className="pb-2"><CardTitle className="text-base">{quiz?.title}</CardTitle></CardHeader>
          <CardContent>
            <div className="py-4 text-center">
              <div className={`text-5xl font-bold ${pass ? "text-success" : "text-destructive"}`}>
                {pointsAwarded}<span className="text-2xl text-muted-foreground">/{pointsMax}</span>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">marks · {pct.toFixed(1)}%</div>
              <Badge variant={pass ? "default" : "destructive"} className="mt-2">{pass ? "Passed" : "Failed"}</Badge>
              <div className="mt-3 text-xs text-muted-foreground">
                {attempt.correct_count}/{attempt.total} objective correct · {Math.floor(attempt.time_taken_sec / 60)}m {attempt.time_taken_sec % 60}s
              </div>
            </div>

            {pendingAi && (
              <div className="mb-3 flex items-center gap-2 rounded-md border border-accent/40 bg-accent/10 p-3 text-xs">
                <Loader2 className="h-4 w-4 animate-spin" />
                Marking your open-ended answers with AI — your score updates here in a moment.
              </div>
            )}
            {feedback.note && !pendingAi && (
              <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  <p>{feedback.note}</p>
                  <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                    <Link to="/wallet"><Wallet className="mr-1 h-3 w-3" />Top up AI credit</Link>
                  </Button>
                </div>
              </div>
            )}
            {ungradable > 0 && (
              <div className="mb-3 rounded-md border bg-secondary/40 p-3 text-xs text-muted-foreground">
                {ungradable} question{ungradable === 1 ? "" : "s"} had no answer key set by the creator, so {ungradable === 1 ? "it was" : "they were"} left out of your score.
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" asChild><Link to="/"><Home className="mr-1 h-4 w-4" />Home</Link></Button>
              {quiz?.allow_retakes && (
                <Button asChild><Link to="/quiz/$quizId" params={{ quizId }}><RotateCw className="mr-1 h-4 w-4" />Retake</Link></Button>
              )}
            </div>
          </CardContent>
        </Card>

        {showAnswers && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Corrections</h2>
            {questions.map((q: any, i: number) => {
              const row = per[q.id] ?? {};
              const selected: string[] = row.selected_ids ?? [];
              const correctIds: string[] = row.correct_ids ?? (q.options ?? []).filter((o: any) => o.is_correct).map((o: any) => o.id);
              const ans = (attempt.answers as any)?.[q.id];
              const objective = q.type === "mcq" || q.type === "tf";
              const isPending = row.status === "pending_ai";
              const score = Number(row.score ?? 0);
              const max = Number(row.max ?? q.points ?? 0);
              return (
                <Card key={q.id}>
                  <CardContent className="space-y-3 pt-5">
                    <div className="flex items-start gap-2">
                      {row.status === "ungradable" ? <AlertTriangle className="mt-0.5 h-5 w-5 text-muted-foreground" />
                        : isPending ? <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-muted-foreground" />
                        : objective ? (row.status === "correct" ? <Check className="mt-0.5 h-5 w-5 text-success" /> : <X className="mt-0.5 h-5 w-5 text-destructive" />)
                        : score >= max * 0.5 ? <Check className="mt-0.5 h-5 w-5 text-success" /> : <X className="mt-0.5 h-5 w-5 text-destructive" />}
                      <div className="min-w-0 flex-1">
                        <p className="whitespace-pre-wrap font-medium">{i + 1}. {q.text}</p>
                      </div>
                      <Badge variant={row.status === "ungradable" ? "secondary" : score > 0 ? "default" : "destructive"} className="shrink-0">
                        {row.status === "ungradable" ? "not scored" : `${score}/${max}`}
                      </Badge>
                    </div>

                    {objective && (
                      <div className="space-y-1">
                        {(q.options ?? []).map((o: any) => {
                          const isKey = correctIds.includes(o.id);
                          const picked = selected.includes(o.id);
                          return (
                            <div key={o.id} className={`rounded border px-3 py-2 text-sm ${
                              isKey ? "border-success bg-success/10" : picked ? "border-destructive bg-destructive/10" : "border-border"
                            }`}>
                              {o.text}
                              {isKey && <span className="ml-2 text-xs font-semibold text-success">correct answer</span>}
                              {picked && !isKey && <span className="ml-2 text-xs font-semibold text-destructive">your answer</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {!objective && (
                      <div className="space-y-2 text-sm">
                        <div className="text-xs text-muted-foreground">Your answer</div>
                        <div className="whitespace-pre-wrap rounded border p-2">{ans ? String(ans) : <em>blank</em>}</div>
                        {q.sample_answer && (
                          <>
                            <div className="text-xs text-muted-foreground">Model answer</div>
                            <div className="whitespace-pre-wrap rounded border bg-muted/40 p-2">{q.sample_answer}</div>
                          </>
                        )}
                      </div>
                    )}

                    {row.feedback && !isPending && (
                      <div className="flex items-start gap-2 rounded-md border-l-2 border-accent bg-accent/10 p-3 text-sm">
                        {row.marked_by === "ai" && <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />}
                        <div>
                          <span className="font-semibold">{row.marked_by === "ai" ? "AI marker: " : "Reason: "}</span>
                          {row.feedback}
                        </div>
                      </div>
                    )}

                    {quiz?.show_explanations && q.explanation && (
                      <div className="rounded border-l-2 border-primary bg-primary/5 p-3 text-sm">
                        <strong>Explanation:</strong> {q.explanation}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div className="mt-6"><SocialPanel quizId={quizId} quizTitle={quiz?.title} /></div>
        <div className="mt-6"><AdSlot placement="quiz_end" /></div>
      </main>
    </div>
  );
}
