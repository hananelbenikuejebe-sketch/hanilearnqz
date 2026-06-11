import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPublishedQuizzes } from "@/lib/quizzes.functions";
import { getMyRole } from "@/lib/role.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { Clock, FileQuestion, LayoutDashboard, LogOut, Play, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Quizzes — HaniLearn-QZ" }] }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const fetchQuizzes = useServerFn(listPublishedQuizzes);
  const fetchRole = useServerFn(getMyRole);
  const { data: role } = useQuery({ queryKey: ["role"], queryFn: () => fetchRole() });
  const { data: quizzes, isLoading } = useQuery({ queryKey: ["published-quizzes"], queryFn: () => fetchQuizzes() });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">HQ</div>
            <span className="font-bold">HaniLearn-QZ</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/results"><BarChart3 className="h-4 w-4 mr-1" />My results</Link>
            </Button>
            {role?.isAdmin && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin"><LayoutDashboard className="h-4 w-4 mr-1" />Admin</Link>
              </Button>
            )}
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out"><LogOut className="h-4 w-4" /></Button>
          </div>

        </div>
      </header>
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <h1 className="text-3xl font-bold mb-2">Available quizzes</h1>
        <p className="text-muted-foreground mb-6">Pick a quiz to begin.</p>
        {isLoading && <p className="text-muted-foreground">Loading…</p>}
        {!isLoading && quizzes && quizzes.length === 0 && (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            No published quizzes yet. {role?.isAdmin && <Link to="/admin" className="text-primary underline">Create one in admin →</Link>}
          </CardContent></Card>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(quizzes ?? []).map((q: any) => (
            <Card key={q.id} className="hover:shadow-md transition">
              <CardHeader>
                <div className="flex items-center justify-between"><Badge variant="secondary">{q.category}</Badge><Badge>{q.difficulty}</Badge></div>
                <CardTitle className="mt-2">{q.title}</CardTitle>
                {q.description && <CardDescription className="line-clamp-2">{q.description}</CardDescription>}
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                  <span className="flex items-center gap-1"><FileQuestion className="h-4 w-4" />{q.question_count} Qs</span>
                  <span className="flex items-center gap-1"><Clock className="h-4 w-4" />{q.duration_min} min</span>
                </div>
                <Button asChild className="w-full"><Link to="/quiz/$quizId" params={{ quizId: q.id }}><Play className="h-4 w-4 mr-1" />Take quiz</Link></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
