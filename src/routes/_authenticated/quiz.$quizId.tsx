import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useMemo } from "react";
import { getQuizForPlayer } from "@/lib/quizzes.functions";
import { submitAttempt } from "@/lib/attempts.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Clock, ArrowLeft, ArrowRight, Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/quiz/$quizId")({
  component: QuizPlayer,
});

function QuizPlayer() {
  const { quizId } = Route.useParams();
  const navigate = useNavigate();
  const fetchQuiz = useServerFn(getQuizForPlayer);
  const submitFn = useServerFn(submitAttempt);
  const { data, isLoading } = useQuery({
    queryKey: ["quiz-player", quizId],
    queryFn: () => fetchQuiz({ data: { id: quizId } }),
  });

  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [startTime] = useState(Date.now());
  const [remaining, setRemaining] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (data?.quiz?.enforce_time && data.quiz.duration_min) {
      setRemaining(data.quiz.duration_min * 60);
    }
  }, [data]);

  const submit = useMutation({
    mutationFn: async () => submitFn({ data: {
      quiz_id: quizId,
      time_taken_sec: Math.floor((Date.now() - startTime) / 1000),
      answers,
    }}),
    onSuccess: (res: any) => {
      toast.success(`Score: ${res.score_pct}%`);
      navigate({ to: "/quiz/$quizId/result/$attemptId", params: { quizId, attemptId: res.id }, replace: true });
    },
    onError: (e: any) => toast.error(e.message),
  });

  function doSubmit() { setConfirmOpen(false); if (!submit.isPending) submit.mutate(); }

  useEffect(() => {
    if (remaining === null) return;
    if (remaining <= 0) { doSubmit(); return; }
    const t = setTimeout(() => setRemaining((r) => (r ?? 0) - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  const questions = data?.questions ?? [];
  const current = questions[idx];
  const answeredCount = useMemo(() => questions.filter((q: any) => {
    const a = answers[q.id];
    return Array.isArray(a) ? a.length > 0 : !!a;
  }).length, [answers, questions]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!current || (current.type !== "mcq" && current.type !== "tf")) return;
      const num = parseInt(e.key);
      if (num >= 1 && num <= current.options.length) {
        setAnswers((a) => ({ ...a, [current.id]: current.options[num - 1].id }));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current]);

  const timeStr = useMemo(() => {
    if (remaining === null) return "";
    const m = Math.floor(remaining / 60); const s = remaining % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, [remaining]);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading…</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center">Quiz not found</div>;
  if (!current) return <div className="min-h-screen flex items-center justify-center">No questions in this quiz</div>;

  const ans = answers[current.id];
  const unanswered = questions.length - answeredCount;

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="font-semibold truncate text-sm sm:text-base min-w-0">{data.quiz.title}</div>
          <div className="flex items-center gap-3 text-sm shrink-0">
            {remaining !== null && (
              <div className={`flex items-center gap-1 font-mono ${remaining < 60 ? "text-destructive" : ""}`}><Clock className="h-4 w-4" />{timeStr}</div>
            )}
            <div className="text-muted-foreground tabular-nums">{idx + 1}/{questions.length}</div>
            <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={submit.isPending}>
              <Send className="h-3.5 w-3.5 mr-1" />Submit
            </Button>
          </div>
        </div>
        <Progress value={(answeredCount / questions.length) * 100} className="rounded-none h-1" />
      </header>

      <main className="flex-1 container mx-auto px-4 py-6 max-w-3xl w-full">
        <Card className="p-5 sm:p-7 shadow-md">
          <h2 className="text-lg sm:text-xl font-medium leading-relaxed whitespace-pre-wrap">{current.text}</h2>
          <div className="mt-5">
            {(current.type === "mcq" || current.type === "tf") && (
              <RadioGroup value={(ans as string) ?? ""} onValueChange={(v) => setAnswers((a) => ({ ...a, [current.id]: v }))}>
                {current.options.map((o: any, i: number) => (
                  <Label key={o.id} htmlFor={o.id} className="flex items-start gap-3 p-3 rounded-md border cursor-pointer hover:bg-accent/10 has-[:checked]:bg-accent/20 has-[:checked]:border-accent">
                    <RadioGroupItem value={o.id} id={o.id} className="mt-1" />
                    <span className="text-muted-foreground font-mono text-sm w-6">{i + 1}.</span>
                    <span className="flex-1">{o.text}</span>
                  </Label>
                ))}
              </RadioGroup>
            )}
            {(current.type === "short" || current.type === "essay") && (
              <Textarea
                rows={current.type === "essay" ? 8 : 3}
                placeholder="Type your answer…"
                value={(ans as string) ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [current.id]: e.target.value }))}
              />
            )}
          </div>
        </Card>

        <div className="flex items-center justify-between mt-5 gap-2">
          <Button variant="outline" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)}><ArrowLeft className="h-4 w-4 mr-1" />Prev</Button>
          {idx < questions.length - 1 ? (
            <Button onClick={() => setIdx((i) => i + 1)}>Next<ArrowRight className="h-4 w-4 ml-1" /></Button>
          ) : (
            <Button onClick={() => setConfirmOpen(true)} disabled={submit.isPending}><Send className="h-4 w-4 mr-1" />Finish</Button>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-1.5 justify-center">
          {questions.map((q: any, i: number) => (
            <button key={q.id} type="button" onClick={() => setIdx(i)}
              className={`h-8 w-8 rounded text-xs font-medium border transition ${i === idx ? "bg-primary text-primary-foreground border-primary" : answers[q.id] ? "bg-accent/30 border-accent/40" : "bg-card hover:bg-accent/10"}`}>{i + 1}</button>
          ))}
        </div>
      </main>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit quiz?</AlertDialogTitle>
            <AlertDialogDescription>
              {unanswered > 0
                ? `You have ${unanswered} unanswered question${unanswered === 1 ? "" : "s"}. Submit anyway?`
                : "All questions answered. Submit your responses now?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={doSubmit} disabled={submit.isPending}>
              {submit.isPending ? "Submitting…" : "Submit now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
