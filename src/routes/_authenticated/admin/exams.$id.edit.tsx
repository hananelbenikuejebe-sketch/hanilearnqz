import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useMemo } from "react";
import { getExam, setExamQuizzes, publishExam } from "@/lib/exams.functions";
import { listQuizzesAdmin } from "@/lib/quizzes.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, ArrowUp, ArrowDown, Trash2, Plus, Eye } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/exams/$id/edit")({
  component: EditExam,
});

function EditExam() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(getExam);
  const listFn = useServerFn(listQuizzesAdmin);
  const setFn = useServerFn(setExamQuizzes);
  const pubFn = useServerFn(publishExam);
  const { data: exam } = useQuery({ queryKey: ["exam", id], queryFn: () => getFn({ data: { id } }) });
  const { data: myQuizzes } = useQuery({ queryKey: ["admin-quizzes"], queryFn: () => listFn() });

  const [selected, setSelected] = useState<string[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (exam?.exam_quizzes) {
      const sorted = [...exam.exam_quizzes].sort((a: any, b: any) => a.position - b.position);
      setSelected(sorted.map((eq: any) => eq.quizzes?.id).filter(Boolean));
    }
  }, [exam]);

  const save = useMutation({
    mutationFn: () => setFn({ data: { exam_id: id, quiz_ids: selected } }),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["exam", id] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const pub = useMutation({
    mutationFn: (is_published: boolean) => pubFn({ data: { id, is_published } }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["exam", id] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const quizMap = useMemo(() => new Map((myQuizzes ?? []).map((x: any) => [x.id, x])), [myQuizzes]);
  const chosen = selected.map((qid) => quizMap.get(qid)).filter(Boolean) as any[];
  const term = q.trim().toLowerCase();
  const available = (myQuizzes ?? []).filter((x: any) =>
    !selected.includes(x.id) && (!term || x.title.toLowerCase().includes(term)),
  );

  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= selected.length) return;
    const next = [...selected]; [next[i], next[j]] = [next[j], next[i]]; setSelected(next);
  };

  if (!exam) return <div>Loading…</div>;
  const totalDuration = chosen.reduce((s, x) => s + (x.duration_min ?? 0), 0);

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild><Link to="/admin/exams"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link></Button>
          <div>
            <h1 className="text-2xl font-bold">{exam.title}</h1>
            {exam.description && <p className="text-sm text-muted-foreground">{exam.description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={exam.is_published ? "default" : "outline"}>{exam.is_published ? "Live" : "Draft"}</Badge>
          <Button variant="outline" size="sm" onClick={() => pub.mutate(!exam.is_published)}>
            {exam.is_published ? "Unpublish" : "Publish"}
          </Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save order"}</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Exam quizzes ({chosen.length})</CardTitle>
            <CardDescription>Total: ~{totalDuration} min. Reorder with the arrows.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {chosen.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Add quizzes from the right.</div>}
              {chosen.map((x: any, i: number) => (
                <div key={x.id} className="p-3 flex items-center gap-2">
                  <span className="tabular-nums text-xs text-muted-foreground w-6">{i + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-sm">{x.title}</div>
                    <div className="text-xs text-muted-foreground">{x.category} · {x.duration_min}m · {x.questions ?? 0}Q</div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => move(i, 1)} disabled={i === chosen.length - 1}><ArrowDown className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setSelected(selected.filter((s) => s !== x.id))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Available quizzes</CardTitle>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" />
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y max-h-[500px] overflow-auto">
              {available.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No matching quizzes.</div>}
              {available.map((x: any) => (
                <div key={x.id} className="p-3 flex items-center gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{x.title}</div>
                    <div className="text-xs text-muted-foreground">{x.category} · {x.duration_min}m</div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => setSelected([...selected, x.id])}><Plus className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Eye className="h-4 w-4" />Preview</CardTitle></CardHeader>
        <CardContent>
          <ol className="list-decimal ml-5 space-y-1 text-sm">
            {chosen.map((x: any) => (
              <li key={x.id}><span className="font-medium">{x.title}</span> <span className="text-muted-foreground">— {x.duration_min}m, {x.difficulty}</span></li>
            ))}
          </ol>
          {chosen.length === 0 && <p className="text-sm text-muted-foreground">Add quizzes to see the exam preview.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
