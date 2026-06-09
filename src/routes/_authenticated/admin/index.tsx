import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listQuizzesAdmin } from "@/lib/quizzes.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: Dashboard,
});

function Dashboard() {
  const fetchQuizzes = useServerFn(listQuizzesAdmin);
  const { data: quizzes } = useQuery({ queryKey: ["admin-quizzes"], queryFn: () => fetchQuizzes() });
  const totalQuizzes = quizzes?.length ?? 0;
  const published = quizzes?.filter((q: any) => q.is_published).length ?? 0;
  const totalAttempts = quizzes?.reduce((s: number, q: any) => s + (q.attempts ?? 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">Dashboard</h1><p className="text-muted-foreground">Quick overview</p></div>
        <Button asChild><Link to="/admin/quizzes/new"><Plus className="h-4 w-4 mr-1" />New quiz</Link></Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Total quizzes</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{totalQuizzes}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Published</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{published}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Total attempts</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{totalAttempts}</CardContent></Card>
      </div>
    </div>
  );
}
