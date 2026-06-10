import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listQuizzesAdmin, deleteQuiz, duplicateQuiz, updateQuiz } from "@/lib/quizzes.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Copy, BarChart3, KeyRound } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/quizzes/")({
  component: AdminQuizzes,
});

function AdminQuizzes() {
  const qc = useQueryClient();
  const fetchQuizzes = useServerFn(listQuizzesAdmin);
  const delFn = useServerFn(deleteQuiz);
  const dupFn = useServerFn(duplicateQuiz);
  const updFn = useServerFn(updateQuiz);
  const { data: quizzes } = useQuery({ queryKey: ["admin-quizzes"], queryFn: () => fetchQuizzes() });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["admin-quizzes"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const dup = useMutation({
    mutationFn: (id: string) => dupFn({ data: { id } }),
    onSuccess: () => { toast.success("Duplicated"); qc.invalidateQueries({ queryKey: ["admin-quizzes"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const togglePublish = useMutation({
    mutationFn: ({ id, is_published }: { id: string; is_published: boolean }) =>
      updFn({ data: { id, patch: { is_published } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-quizzes"] }),
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Quizzes</h1>
          <p className="text-sm text-muted-foreground">Public and private assessments, drafts, and scheduled work.</p>
        </div>
        <Button asChild><Link to="/admin/quizzes/new"><Plus className="h-4 w-4 mr-1" />New quiz</Link></Button>
      </div>
      <Card><CardContent className="p-0">
        <div className="divide-y">
          {(quizzes ?? []).map((q: any) => (
            <div key={q.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{q.title}</div>
                <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-2 mt-1">
                  <Badge variant="secondary">{q.category}</Badge>
                  {q.subject && <Badge variant="outline">{q.subject}</Badge>}
                  {q.visibility === "private" && <span className="inline-flex items-center gap-1"><KeyRound className="h-3 w-3" />Private</span>}
                  <span>{q.questions ?? 0} Qs · {q.duration_min}m · {q.attempts ?? 0} attempts</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <Switch checked={q.is_published} onCheckedChange={(v) => togglePublish.mutate({ id: q.id, is_published: v })} />
                  <span className="text-muted-foreground">{q.is_published ? "Live" : "Draft"}</span>
                </div>
                <Button size="icon" variant="ghost" asChild><Link to="/admin/quizzes/$id/edit" params={{ id: q.id }} aria-label="Edit quiz"><Pencil className="h-4 w-4" /></Link></Button>
                <Button size="icon" variant="ghost" asChild><Link to="/admin/quizzes/$id/results" params={{ id: q.id }} aria-label="View results"><BarChart3 className="h-4 w-4" /></Link></Button>
                <Button size="icon" variant="ghost" onClick={() => dup.mutate(q.id)} aria-label="Duplicate quiz"><Copy className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => { if (confirm("Delete this quiz?")) del.mutate(q.id); }} aria-label="Delete quiz"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
          {quizzes?.length === 0 && <div className="p-8 text-center text-muted-foreground">No quizzes yet. Create your first one.</div>}
        </div>
      </CardContent></Card>
    </div>
  );
}