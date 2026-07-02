import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPublishedExams } from "@/lib/exams.functions";
import { getMyCreatorStatus } from "@/lib/creators.functions";
import { AppShell } from "@/components/app-nav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GraduationCap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/exams")({
  head: () => ({ meta: [
    { title: "Exams — HaniLearn-QZ" },
    { name: "description", content: "Multi-quiz exam bundles combining several quizzes into a full assessment." },
  ] }),
  component: Exams,
});

function Exams() {
  const fetchExams = useServerFn(listPublishedExams);
  const fetchStatus = useServerFn(getMyCreatorStatus);
  const { data: exams, isLoading } = useQuery({ queryKey: ["published-exams"], queryFn: () => fetchExams() });
  const { data: status } = useQuery({ queryKey: ["creator-status"], queryFn: () => fetchStatus() });

  return (
    <AppShell isSuperAdmin={status?.is_super_admin}>
      <div className="max-w-5xl mx-auto p-4 md:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Exams</h1>
            <p className="text-muted-foreground">Multi-quiz bundles for full-length assessments.</p>
          </div>
          <Badge variant="outline" className="hidden sm:flex">Beta</Badge>
        </div>
        {isLoading && <p className="text-muted-foreground">Loading…</p>}
        {!isLoading && (!exams || exams.length === 0) && (
          <Card className="border-dashed"><CardContent className="py-16 text-center">
            <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h2 className="font-semibold text-lg">No exams yet</h2>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1">Creators can bundle multiple quizzes into a single exam. This feature is now live for creators.</p>
          </CardContent></Card>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {(exams ?? []).map((e: any) => (
            <Card key={e.id} className="hover:shadow-md transition">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><GraduationCap className="h-5 w-5" />{e.title}</CardTitle>
                {e.description && <CardDescription>{e.description}</CardDescription>}
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <Badge variant="secondary">{e.quiz_count} quizzes</Badge>
                  <span>{new Date(e.created_at).toLocaleDateString()}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
