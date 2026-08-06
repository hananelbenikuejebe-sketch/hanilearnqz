import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { getQuizForPlayer } from "@/lib/quizzes.functions";
import { submitAttempt, getGradingPreflight } from "@/lib/attempts.functions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ArrowRight, Clock, Send } from "lucide-react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";

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
  const preflightFn = useServerFn(getGradingPreflight);
  const { data: preflight } = useQuery({
    queryKey: ["grading-preflight", quizId],
    queryFn: () => preflightFn({ data: { quiz_id: quizId } }),
    retry: false,
  });
  const { data, isLoading, error } = useQuery({
    queryKey: ["quiz-player", quizId, key ?? ""],
    queryFn: () => fetchQuiz({ data: { id: quizId, access_key: key ?? null } }),
    retry: false,
  });
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [remaining, setRemaining] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const startRef = useRef(Date.now());
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [flowMode, setFlowMode] = useState<"continuous" | "paged">(() => {
    if (typeof window === "undefined") return "continuous";
    return (localStorage.getItem("quiz-flow-mode") as "continuous" | "paged") || "continuous";
  });
  const [pageIndex, setPageIndex] = useState(0);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("quiz-flow-mode", flowMode); }, [flowMode]);

  useEffect(() => { if (data?.quiz?.enforce_time && data.quiz.duration_min) setRemaining(data.quiz.duration_min * 60); }, [data]);
  const submit = useMutation({
    mutationFn: () => submitFn({ data: { quiz_id: quizId, time_taken_sec: Math.floor((Date.now() - startRef.current) / 1000), answers } }),
    onSuccess: (res: any) => { setSubmitted(true); navigate({ to: "/quiz/$quizId/result/$attemptId", params: { quizId, attemptId: res.id }, replace: true }); },
    onError: (e: any) => { setSubmitted(false); toast.error(e.message); },
  });
  function doSubmit() { if (submit.isPending || submitted) return; setConfirmOpen(false); setSubmitted(true); submit.mutate(); }
  useEffect(() => { if (remaining === null || submitted) return; if (remaining <= 0) { doSubmit(); return; } const t = setTimeout(() => setRemaining((r) => (r ?? 0) - 1), 1000); return () => clearTimeout(t); }, [remaining, submitted]);

  const questions = data?.questions ?? [];
  const sections = data?.sections ?? [];

  const grouped = useMemo(() => {
    const bySection: Record<string, any[]> = {};
    const unassigned: any[] = [];
    for (const q of questions) {
      if (q.section_id) { (bySection[q.section_id] ||= []).push(q); }
      else unassigned.push(q);
    }
    const sortedSections = [...sections].sort((a: any, b: any) => a.position - b.position);
    const groups = sortedSections.map((s: any) => ({ section: s, questions: bySection[s.id] ?? [] })).filter((g) => g.questions.length > 0);
    if (unassigned.length) groups.push({ section: null, questions: unassigned });
    return groups;
  }, [questions, sections]);

  const flatQuestions = useMemo(() => grouped.flatMap((g) => g.questions.map((q: any) => ({ ...q, __section: g.section }))), [grouped]);
  useEffect(() => { if (pageIndex >= flatQuestions.length) setPageIndex(Math.max(0, flatQuestions.length - 1)); }, [flatQuestions.length, pageIndex]);

  const answeredCount = useMemo(() => questions.filter((q: any) => { const a = answers[q.id]; return Array.isArray(a) ? a.length > 0 : !!a; }).length, [answers, questions]);
  const timeStr = useMemo(() => remaining === null ? "" : `${Math.floor(remaining / 60)}:${(remaining % 60).toString().padStart(2, "0")}`, [remaining]);

  if (isLoading || submitted) return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">{submitted ? "Scoring and opening corrections…" : "Loading quiz…"}</div>;
  if (error) return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="max-w-md rounded-lg border bg-card p-6 text-center space-y-3">
        <div className="text-sm font-semibold">Cannot start quiz</div>
        <div className="text-sm text-muted-foreground">{(error as any)?.message ?? "Unknown error"}</div>
        <Button onClick={() => navigate({ to: "/quiz/$quizId", params: { quizId } })}>Back to quiz page</Button>
      </div>
    </div>
  );
  if (!data || questions.length === 0) return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Quiz unavailable</div>;
  const unanswered = questions.length - answeredCount;

  let runningIndex = 0;

  return <div className="min-h-screen bg-background pb-24">
    <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
      <div className="container mx-auto grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2">
        <div className="min-w-0"><div className="truncate text-sm font-semibold">{data.quiz.title}</div><div className="text-xs text-muted-foreground">Answered {answeredCount}/{questions.length}</div></div>
        <div className="flex shrink-0 items-center gap-2 text-xs">
          {remaining !== null && <span className={`inline-flex items-center gap-1 font-mono ${remaining < 60 ? "text-destructive" : ""}`}><Clock className="h-3.5 w-3.5" />{timeStr}</span>}
          <label className="hidden items-center gap-1.5 sm:flex">
            <span className="text-muted-foreground">{flowMode === "paged" ? "One at a time" : "Continuous"}</span>
            <Switch checked={flowMode === "paged"} onCheckedChange={(v) => setFlowMode(v ? "paged" : "continuous")} aria-label="Toggle question flow" />
          </label>
          <ThemeToggle />
          <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={submit.isPending}><Send className="h-3.5 w-3.5" />Submit</Button>
        </div>
      </div>
      <Progress value={(answeredCount / questions.length) * 100} className="h-1 rounded-none" />
      <div className="container mx-auto flex items-center justify-end gap-1.5 px-3 pb-1 pt-1 sm:hidden">
        <span className="text-[11px] text-muted-foreground">{flowMode === "paged" ? "One at a time" : "Continuous"}</span>
        <Switch checked={flowMode === "paged"} onCheckedChange={(v) => setFlowMode(v ? "paged" : "continuous")} aria-label="Toggle question flow" />
      </div>
      {grouped.length > 1 && (
        <div className="container mx-auto flex gap-1.5 overflow-x-auto px-3 pb-2 pt-1">
          {grouped.map((g, i) => (
            <button key={g.section?.id ?? `u-${i}`} type="button"
              onClick={() => sectionRefs.current[g.section?.id ?? `u-${i}`]?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="shrink-0 rounded-full border bg-secondary px-3 py-1 text-[11px] font-medium hover:bg-secondary/70">
              {g.section?.title ?? "General"}
            </button>
          ))}
        </div>
      )}
    </header>
    <main className="container mx-auto max-w-4xl px-3 py-4 space-y-6">
      {flowMode === "continuous" ? (
        <>
          {grouped.map((g, gi) => {
            const startIndex = runningIndex;
            runningIndex += g.questions.length;
            return (
              <section key={g.section?.id ?? `u-${gi}`} ref={(el) => { sectionRefs.current[g.section?.id ?? `u-${gi}`] = el; }} className="scroll-mt-32 space-y-3">
                {g.section && (
                  <div className="rounded-md border bg-secondary/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-sm font-bold">{g.section.title}</h2>
                      {(g.section.total_score != null) && <span className="text-xs font-semibold text-muted-foreground">{g.section.total_score} marks</span>}
                    </div>
                    {g.section.instructions && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{g.section.instructions}</p>}
                  </div>
                )}
                {g.questions.map((current: any, qi: number) => {
                  const num = startIndex + qi + 1;
                  return <QuestionCard key={current.id} current={current} num={num} answers={answers} setAnswers={setAnswers} />;
                })}
              </section>
            );
          })}
          <div className="flex flex-wrap justify-center gap-1.5">
            {questions.map((q: any, i: number) => (
              <button key={q.id} type="button" onClick={() => document.getElementById(`q-${q.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                className={`h-8 w-8 rounded-md border text-xs font-semibold ${answers[q.id] ? "border-success/40 bg-success/10" : "bg-card"}`}>{i + 1}</button>
            ))}
          </div>
          <div className="flex justify-center">
            <Button size="lg" onClick={() => setConfirmOpen(true)} disabled={submit.isPending}><Send className="h-4 w-4 mr-1" />Submit quiz</Button>
          </div>
        </>
      ) : (
        <>
          {flatQuestions[pageIndex] && (
            <div className="space-y-3">
              {flatQuestions[pageIndex].__section && (
                <div className="rounded-md border bg-secondary/40 p-3">
                  <h2 className="text-sm font-bold">{flatQuestions[pageIndex].__section.title}</h2>
                </div>
              )}
              <QuestionCard current={flatQuestions[pageIndex]} num={pageIndex + 1} answers={answers} setAnswers={setAnswers} />
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" onClick={() => setPageIndex((i) => Math.max(0, i - 1))} disabled={pageIndex === 0}>
              <ArrowLeft className="h-4 w-4 mr-1" />Previous
            </Button>
            <span className="text-sm font-medium tabular-nums text-muted-foreground">Question {pageIndex + 1} of {flatQuestions.length}</span>
            {pageIndex >= flatQuestions.length - 1 ? (
              <Button onClick={() => setConfirmOpen(true)} disabled={submit.isPending}><Send className="h-4 w-4 mr-1" />Submit</Button>
            ) : (
              <Button onClick={() => setPageIndex((i) => Math.min(flatQuestions.length - 1, i + 1))}>
                Next<ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {flatQuestions.map((q: any, i: number) => (
              <button key={q.id} type="button" onClick={() => setPageIndex(i)}
                className={`h-8 w-8 rounded-md border text-xs font-semibold ${i === pageIndex ? "border-primary bg-primary/10" : answers[q.id] ? "border-success/40 bg-success/10" : "bg-card"}`}>{i + 1}</button>
            ))}
          </div>
        </>
      )}
    </main>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Submit quiz?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-left">
              <p>{unanswered ? `${unanswered} unanswered question${unanswered === 1 ? "" : "s"}. Submit anyway?` : "Your timer stops immediately and every question — including theory — is graded right away."}</p>
              {!!preflight?.ai_marked_count && (
                <div className="rounded-md border border-accent/40 bg-accent/10 p-2 text-xs">
                  <p className="font-semibold">AI marking will run now</p>
                  <p className="mt-1">
                    {preflight.ai_marked_count} open-ended answer{preflight.ai_marked_count === 1 ? "" : "s"} will be marked by AI and
                    {" "}<strong>₦{(preflight.estimated_cost_kobo / 100).toFixed(2)} will be deducted automatically</strong> from your AI credit
                    (balance ₦{(preflight.ai_credit_kobo / 100).toFixed(2)}).
                  </p>
                  {!preflight.can_grade_all && (
                    <p className="mt-1 text-destructive">Your credit does not cover all of them — the ones that cannot be marked will score 0.</p>
                  )}
                </div>
              )}
              {!!preflight?.total_marks && <p className="text-xs text-muted-foreground">Scored out of {preflight.total_marks} marks set by the creator.</p>}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep working</AlertDialogCancel>
          <AlertDialogAction onClick={doSubmit} disabled={submit.isPending}>{submit.isPending ? "Submitting…" : "Submit now"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}


function QuestionCard({ current, num, answers, setAnswers }: { current: any; num: number; answers: Record<string, string | string[]>; setAnswers: React.Dispatch<React.SetStateAction<Record<string, string | string[]>>> }) {
  const ans = answers[current.id];
  return (
    <Card id={`q-${current.id}`} className="p-4 shadow-technical sm:p-5">
      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>Question {num}</span>
        <span className="flex items-center gap-2"><span>{current.type.toUpperCase()}</span>{current.points != null && <span className="font-semibold">[{current.points} marks]</span>}</span>
      </div>
      <h1 className="whitespace-pre-wrap text-base font-semibold leading-6">{current.text}</h1>
      <div className="mt-4 space-y-2">
        {(current.type === "mcq" || current.type === "tf") && (
          <RadioGroup value={(ans as string) ?? ""} onValueChange={(v) => setAnswers((a) => ({ ...a, [current.id]: v }))}>
            {current.options.map((o: any, i: number) => (
              <Label key={o.id} htmlFor={o.id} className="flex cursor-pointer items-start gap-3 rounded-md border bg-card p-3 text-sm shadow-sm hover:bg-secondary has-[:checked]:border-primary has-[:checked]:bg-primary/10">
                <RadioGroupItem value={o.id} id={o.id} className="mt-0.5" />
                <span className="font-mono text-xs text-muted-foreground">{String.fromCharCode(65 + i)}</span>
                <span>{o.text}</span>
              </Label>
            ))}
          </RadioGroup>
        )}
        {(current.type === "short" || current.type === "essay") && (
          <Textarea rows={current.type === "essay" ? 8 : 3} value={(ans as string) ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [current.id]: e.target.value }))} placeholder="Type your answer…" />
        )}
      </div>
    </Card>
  );
}
