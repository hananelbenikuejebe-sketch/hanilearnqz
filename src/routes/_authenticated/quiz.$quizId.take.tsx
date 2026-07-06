import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { getQuizForPlayer } from "@/lib/quizzes.functions";
import { submitAttempt } from "@/lib/attempts.functions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ArrowRight, Clock, Send } from "lucide-react";
import { toast } from "sonner";

const takeSearch = z.object({ key: z.string().max(40).optional() });

export const Route = createFileRoute("/_authenticated/quiz/$quizId/take")({
  validateSearch: (s) => takeSearch.parse(s),
  component: QuizPlayer,
});

function QuizPlayer() {
  const { quizId } = Route.useParams();
  const { key } = useSearch({ from: Route.id });
  const navigate = useNavigate();
  const fetchQuiz = useServerFn(getQuizForPlayer);
  const submitFn = useServerFn(submitAttempt);
  const { data, isLoading, error } = useQuery({
    queryKey: ["quiz-player", quizId, key ?? ""],
    queryFn: () => fetchQuiz({ data: { id: quizId, access_key: key ?? null } }),
    retry: false,
  });
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [remaining, setRemaining] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const startRef = useRef(Date.now());

  useEffect(() => { if (data?.quiz?.enforce_time && data.quiz.duration_min) setRemaining(data.quiz.duration_min * 60); }, [data]);
  const submit = useMutation({
    mutationFn: () => submitFn({ data: { quiz_id: quizId, time_taken_sec: Math.floor((Date.now() - startRef.current) / 1000), answers } }),
    onSuccess: (res: any) => { setSubmitted(true); navigate({ to: "/quiz/$quizId/result/$attemptId", params: { quizId, attemptId: res.id }, replace: true }); },
    onError: (e: any) => { setSubmitted(false); toast.error(e.message); },
  });
  function doSubmit() { if (submit.isPending || submitted) return; setConfirmOpen(false); setSubmitted(true); submit.mutate(); }
  useEffect(() => { if (remaining === null || submitted) return; if (remaining <= 0) { doSubmit(); return; } const t = setTimeout(() => setRemaining((r) => (r ?? 0) - 1), 1000); return () => clearTimeout(t); }, [remaining, submitted]);

  const questions = data?.questions ?? [];
  const current = questions[idx];
  const answeredCount = useMemo(() => questions.filter((q: any) => { const a = answers[q.id]; return Array.isArray(a) ? a.length > 0 : !!a; }).length, [answers, questions]);
  const timeStr = useMemo(() => remaining === null ? "" : `${Math.floor(remaining / 60)}:${(remaining % 60).toString().padStart(2, "0")}`, [remaining]);
  if (isLoading || submitted) return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">{submitted ? "Scoring and opening corrections…" : "Loading quiz…"}</div>;
  if (!data || !current) return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Quiz unavailable</div>;
  const ans = answers[current.id];
  const unanswered = questions.length - answeredCount;

  return <div className="min-h-screen bg-background pb-20">
    <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
      <div className="container mx-auto grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2">
        <div className="min-w-0"><div className="truncate text-sm font-semibold">{data.quiz.title}</div><div className="text-xs text-muted-foreground">Answered {answeredCount}/{questions.length}</div></div>
        <div className="flex shrink-0 items-center gap-2 text-xs">
          {remaining !== null && <span className={`inline-flex items-center gap-1 font-mono ${remaining < 60 ? "text-destructive" : ""}`}><Clock className="h-3.5 w-3.5" />{timeStr}</span>}
          <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={submit.isPending}><Send className="h-3.5 w-3.5" />Submit</Button>
        </div>
      </div>
      <Progress value={(answeredCount / questions.length) * 100} className="h-1 rounded-none" />
    </header>
    <main className="container mx-auto max-w-4xl px-3 py-4">
      <Card className="p-4 shadow-technical sm:p-5">
        <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground"><span>Question {idx + 1}</span><span>{current.type.toUpperCase()}</span></div>
        <h1 className="whitespace-pre-wrap text-base font-semibold leading-6">{current.text}</h1>
        <div className="mt-4 space-y-2">
          {(current.type === "mcq" || current.type === "tf") && <RadioGroup value={(ans as string) ?? ""} onValueChange={(v) => setAnswers((a) => ({ ...a, [current.id]: v }))}>{current.options.map((o: any, i: number) => <Label key={o.id} htmlFor={o.id} className="flex cursor-pointer items-start gap-3 rounded-md border bg-card p-3 text-sm shadow-sm hover:bg-secondary has-[:checked]:border-primary has-[:checked]:bg-primary/10"><RadioGroupItem value={o.id} id={o.id} className="mt-0.5" /><span className="font-mono text-xs text-muted-foreground">{String.fromCharCode(65 + i)}</span><span>{o.text}</span></Label>)}</RadioGroup>}
          {(current.type === "short" || current.type === "essay") && <Textarea rows={current.type === "essay" ? 8 : 3} value={(ans as string) ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [current.id]: e.target.value }))} placeholder="Type your answer…" />}
        </div>
      </Card>
      <div className="mt-4 flex items-center justify-between gap-2"><Button variant="outline" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)}><ArrowLeft className="h-4 w-4" />Prev</Button><Button onClick={() => idx < questions.length - 1 ? setIdx((i) => i + 1) : setConfirmOpen(true)}>{idx < questions.length - 1 ? <>Next<ArrowRight className="h-4 w-4" /></> : <>Finish<Send className="h-4 w-4" /></>}</Button></div>
      <div className="mt-4 flex flex-wrap justify-center gap-1.5">{questions.map((q: any, i: number) => <button key={q.id} type="button" onClick={() => setIdx(i)} className={`h-8 w-8 rounded-md border text-xs font-semibold ${i === idx ? "border-primary bg-primary text-primary-foreground" : answers[q.id] ? "border-success/40 bg-success/10" : "bg-card"}`}>{i + 1}</button>)}</div>
    </main>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Submit quiz?</AlertDialogTitle><AlertDialogDescription>{unanswered ? `${unanswered} unanswered question${unanswered === 1 ? "" : "s"}. Submit anyway?` : "Your timer stops immediately and corrections open next."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep working</AlertDialogCancel><AlertDialogAction onClick={doSubmit} disabled={submit.isPending}>{submit.isPending ? "Submitting…" : "Submit now"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}