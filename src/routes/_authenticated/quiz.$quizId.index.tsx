import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getQuizAbout } from "@/lib/quizzes.functions";
import { SocialPanel } from "@/components/social-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, FileQuestion, Play, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/quiz/$quizId/")({ component: QuizAbout });

function QuizAbout() {
  const { quizId } = Route.useParams();
  const fetchQuiz = useServerFn(getQuizAbout);
  const { data: quiz, isLoading } = useQuery({ queryKey: ["quiz-about", quizId], queryFn: () => fetchQuiz({ data: { id: quizId } }) });
  if (isLoading || !quiz) return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Loading quiz details…</div>;
  return <main className="min-h-screen bg-background"><div className="container mx-auto max-w-5xl px-3 py-4 sm:py-6">
    <div className="overflow-hidden rounded-lg border bg-card shadow-technical">
      <div className="grid min-h-56 place-items-end bg-secondary p-5" style={quiz.banner_url ? { backgroundImage: `linear-gradient(180deg, transparent, color-mix(in oklab, var(--card) 92%, transparent)), url(${quiz.banner_url})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
        <div className="w-full"><div className="mb-2 flex flex-wrap gap-2"><Badge variant="secondary">{quiz.category}</Badge><Badge variant="outline">{quiz.difficulty}</Badge>{quiz.subject && <Badge variant="outline">{quiz.subject}</Badge>}</div><h1 className="text-2xl font-bold leading-tight sm:text-3xl">{quiz.title}</h1>{quiz.description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{quiz.description}</p>}</div>
      </div>
      <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-3 text-sm"><div className="grid grid-cols-3 gap-2"><Stat icon={<FileQuestion />} label="Questions" value={`${quiz.question_count}`} /><Stat icon={<Clock />} label="Duration" value={`${quiz.duration_min}m`} /><Stat icon={<ShieldCheck />} label="Access" value={quiz.visibility} /></div>{quiz.instructions && <Card><CardContent className="p-3"><h2 className="mb-1 text-sm font-semibold">Instructions</h2><p className="whitespace-pre-wrap text-sm text-muted-foreground">{quiz.instructions}</p></CardContent></Card>}<Button asChild size="lg"><Link to="/quiz/$quizId/take" params={{ quizId }}><Play className="h-4 w-4" />Take quiz</Link></Button></section>
        <aside><SocialPanel quizId={quizId} quizTitle={quiz.title} shareUrl={quiz.share_url} /></aside>
      </CardContent>
    </div>
  </div></main>;
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-md border bg-background p-3 shadow-sm [&_svg]:mb-2 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-primary"><div>{icon}</div><div className="text-[11px] uppercase text-muted-foreground">{label}</div><div className="truncate text-sm font-semibold capitalize">{value}</div></div>;
}