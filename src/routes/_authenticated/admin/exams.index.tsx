import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listMyExams, createExam, publishExam } from "@/lib/exams.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, GraduationCap } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/exams/")({
  component: AdminExams,
});

function AdminExams() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const listFn = useServerFn(listMyExams);
  const createFn = useServerFn(createExam);
  const pubFn = useServerFn(publishExam);
  const { data: exams } = useQuery({ queryKey: ["my-exams"], queryFn: () => listFn() });

  const [form, setForm] = useState({ title: "", description: "" });
  const create = useMutation({
    mutationFn: () => createFn({ data: { title: form.title.trim(), description: form.description || null } }),
    onSuccess: (e: any) => { toast.success("Exam created"); nav({ to: "/admin/exams/$id/edit", params: { id: e.id } }); },
    onError: (e: any) => toast.error(e.message),
  });
  const togglePub = useMutation({
    mutationFn: ({ id, is_published }: any) => pubFn({ data: { id, is_published } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-exams"] }),
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Exams</h1>
        <p className="text-sm text-muted-foreground">Bundle several quizzes into a multi-part exam.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Plus className="h-4 w-4" />New exam</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="JAMB 2024 Full Mock" /></div>
          <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" /></div>
          <Button onClick={() => create.mutate()} disabled={!form.title.trim() || create.isPending}>{create.isPending ? "Creating…" : "Create exam"}</Button>
        </CardContent>
      </Card>

      <Card><CardContent className="p-0">
        <div className="divide-y">
          {(exams ?? []).map((e: any) => (
            <div key={e.id} className="p-4 flex items-center gap-3">
              <GraduationCap className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{e.title}</div>
                <div className="text-xs text-muted-foreground">{e.quiz_count} quizzes · {new Date(e.created_at).toLocaleDateString()}</div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Switch checked={e.is_published} onCheckedChange={(v) => togglePub.mutate({ id: e.id, is_published: v })} />
                <span className="text-muted-foreground">{e.is_published ? "Live" : "Draft"}</span>
              </div>
              <Button size="icon" variant="ghost" asChild><Link to="/admin/exams/$id/edit" params={{ id: e.id }}><Pencil className="h-4 w-4" /></Link></Button>
            </div>
          ))}
          {(!exams || exams.length === 0) && <div className="p-8 text-center text-muted-foreground text-sm">No exams yet.</div>}
        </div>
      </CardContent></Card>
    </div>
  );
}
