import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getQuizAbout } from "@/lib/quizzes.functions";
import { initiateQuizPurchase, verifyAndSettle } from "@/lib/payments.functions";
import { SocialPanel } from "@/components/social-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock, FileQuestion, Lock, Play, ShieldCheck, Sparkles, User, Trophy, Timer } from "lucide-react";
import { quizBannerStyle } from "@/lib/banner-color";
import { toast } from "sonner";
import { z } from "zod";

const search = z.object({ ref: z.string().optional(), key: z.string().optional() });

export const Route = createFileRoute("/_authenticated/quiz/$quizId/")({
  validateSearch: (s) => search.parse(s),
  component: QuizAbout,
});

function QuizAbout() {
  const { quizId } = Route.useParams();
  const { ref, key: keyFromUrl } = useSearch({ from: Route.id });
  const nav = useNavigate();
  const fetchQuiz = useServerFn(getQuizAbout);
  const buyFn = useServerFn(initiateQuizPurchase);
  const verifyFn = useServerFn(verifyAndSettle);
  const { data: quiz, isLoading, refetch } = useQuery({
    queryKey: ["quiz-about", quizId],
    queryFn: () => fetchQuiz({ data: { id: quizId } }),
  });
  const [accessKey, setAccessKey] = useState(keyFromUrl ?? "");

  // If we came back from Monnify with ?ref=..., verify + settle then refresh.
  useEffect(() => {
    if (!ref) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await verifyFn({ data: { reference: ref } });
        if (cancelled) return;
        if (res.status === "paid") { toast.success("Payment confirmed. Quiz unlocked."); await refetch(); }
        else toast.info("Payment still pending. Refresh in a moment.");
      } catch (e: any) { toast.error(e.message ?? "Verification failed"); }
    })();
    return () => { cancelled = true; };
  }, [ref]);

  const buy = useMutation({
    mutationFn: () => buyFn({ data: { quiz_id: quizId } }),
    onSuccess: (r: any) => { window.location.href = r.checkoutUrl; },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading || !quiz) return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Loading quiz details…</div>;

  const priced = (quiz as any).price_kobo > 0;
  const canTake = quiz.is_owner || quiz.is_admin || (!quiz.requires_purchase);
  const creator = (quiz as any).creator;

  return <main className="min-h-screen bg-background"><div className="container mx-auto max-w-5xl px-3 py-4 sm:py-6">
    <div className="overflow-hidden rounded-lg border bg-card shadow-technical">
      <div className="grid min-h-56 place-items-end bg-secondary p-5" style={quiz.banner_url ? { backgroundImage: `linear-gradient(180deg, transparent, color-mix(in oklab, var(--card) 92%, transparent)), url(${quiz.banner_url})`, backgroundSize: "cover", backgroundPosition: "center" } : { ...quizBannerStyle(quizId, (quiz as any).banner_color).style, backgroundImage: `linear-gradient(180deg, transparent, color-mix(in oklab, var(--card) 75%, transparent)), ${quizBannerStyle(quizId, (quiz as any).banner_color).style.backgroundImage}` }}>
        <div className="w-full">
          <div className="mb-2 flex flex-wrap gap-2">
            <Badge variant="secondary">{quiz.category}</Badge>
            <Badge variant="outline">{quiz.difficulty}</Badge>
            {quiz.subject && <Badge variant="outline">{quiz.subject}</Badge>}
            {quiz.visibility === "private" && <Badge variant="outline"><Lock className="h-3 w-3 mr-1" />Private</Badge>}
            {priced && <Badge className="bg-amber-500 text-black hover:bg-amber-600">₦{((quiz as any).price_kobo/100).toLocaleString()}</Badge>}
          </div>
          <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{quiz.title}</h1>
          {quiz.description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{quiz.description}</p>}
          {creator && (
            <Link to="/profile/$userId" params={{ userId: creator.id }} className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <User className="h-3 w-3" />by {creator.full_name || creator.handle || "creator"}
            </Link>
          )}
        </div>
      </div>
      <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-2">
            <Stat icon={<FileQuestion />} label="Questions" value={`${quiz.question_count}`} />
            <Stat icon={<Clock />} label="Duration" value={`${quiz.duration_min}m`} />
            <Stat icon={<ShieldCheck />} label="Access" value={quiz.visibility} />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat icon={<Sparkles />} label="Total marks" value={`${(quiz as any).total_marks ?? 0}`} />
            <Stat icon={<Trophy />} label="Price" value={(quiz as any).price_kobo > 0 ? `₦${((quiz as any).price_kobo/100).toLocaleString()}` : "Free"} />
            {(quiz as any).competition_ends_at && <CountdownStat endsAt={(quiz as any).competition_ends_at} />}
          </div>

          {Array.isArray((quiz as any).sections) && (quiz as any).sections.length > 0 && (
            <Card><CardContent className="p-3">
              <h2 className="mb-2 text-sm font-semibold">Sections</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground"><tr className="border-b"><th className="py-1 text-left">Section</th><th className="py-1 text-right">Questions</th><th className="py-1 text-right">Marks</th></tr></thead>
                  <tbody>
                    {(quiz as any).sections.sort((a: any, b: any) => a.position - b.position).map((s: any) => (
                      <tr key={s.id} className="border-b last:border-0"><td className="py-1.5">{s.title}</td><td className="py-1.5 text-right">{s.question_count}</td><td className="py-1.5 text-right">{s.total_score ?? s.computed_points}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent></Card>
          )}

          {Array.isArray((quiz as any).prizes) && (quiz as any).prizes.length > 0 && (
            <Card><CardContent className="p-3">
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Trophy className="h-4 w-4 text-amber-500" />Prizes</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(quiz as any).prizes.sort((a: any, b: any) => a.position - b.position).map((p: any) => (
                  <div key={p.id} className="rounded-md border bg-background p-2 text-center">
                    <div className="text-[11px] uppercase text-muted-foreground">#{p.position}</div>
                    <div className="text-sm font-semibold">₦{(p.amount_kobo/100).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </CardContent></Card>
          )}

          {quiz.instructions && (
            <Card><CardContent className="p-3">
              <h2 className="mb-1 text-sm font-semibold">Instructions</h2>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{quiz.instructions}</p>
            </CardContent></Card>
          )}

          {/* Purchase CTA */}
          {quiz.requires_purchase && (
            <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-950/20">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-amber-500" />Paid quiz</div>
                <p className="text-sm text-muted-foreground">This quiz costs <span className="font-semibold text-foreground">₦{((quiz as any).price_kobo/100).toLocaleString()}</span>. After payment your access unlocks automatically.</p>
                <div className="flex gap-2">
                  <Button onClick={() => buy.mutate()} disabled={buy.isPending} className="flex-1">
                    {buy.isPending ? "Redirecting…" : `Pay & unlock — ₦${((quiz as any).price_kobo/100).toLocaleString()}`}
                  </Button>
                  <Button variant="outline" asChild><Link to="/wallet">Fund wallet</Link></Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Private key entry */}
          {quiz.requires_key && !quiz.requires_purchase && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-2"><Lock className="h-4 w-4" />Access key required</Label>
                <p className="text-xs text-muted-foreground">Enter the key the creator shared with you.</p>
                <Input value={accessKey} onChange={(e) => setAccessKey(e.target.value.toUpperCase())} placeholder="e.g. K3PQR7XY" className="uppercase tracking-wider" maxLength={40} />
                <Button
                  disabled={!accessKey.trim()}
                  onClick={() => nav({ to: "/quiz/$quizId/take", params: { quizId }, search: { key: accessKey.trim() } as any })}
                  className="w-full">
                  <Play className="h-4 w-4 mr-1" />Unlock & start
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Free / already purchased — go take it */}
          {canTake && !quiz.requires_key && (
            <Button asChild size="lg">
              <Link to="/quiz/$quizId/take" params={{ quizId }} search={quiz.requires_key ? { key: accessKey } as any : undefined}>
                <Play className="h-4 w-4 mr-1" />{quiz.purchased ? "Take (purchased)" : "Take quiz"}
              </Link>
            </Button>
          )}
        </section>
        <aside><SocialPanel quizId={quizId} quizTitle={quiz.title} shareUrl={quiz.share_url} /></aside>
      </CardContent>
    </div>
  </div></main>;
}

function CountdownStat({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const diff = new Date(endsAt).getTime() - now;
  const value = diff <= 0 ? "Ended" : (() => {
    const d = Math.floor(diff / 86400000); const h = Math.floor((diff % 86400000) / 3600000); const m = Math.floor((diff % 3600000) / 60000);
    return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
  })();
  return <Stat icon={<Timer />} label="Ends in" value={value} />;
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3 shadow-sm [&_svg]:mb-2 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-primary">
      <div>{icon}</div>
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-semibold capitalize">{value}</div>
    </div>
  );
}
