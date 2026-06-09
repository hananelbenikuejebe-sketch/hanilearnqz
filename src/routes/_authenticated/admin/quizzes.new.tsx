import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { createQuiz } from "@/lib/quizzes.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const CATS = ["JAMB", "WAEC", "NECO", "GCE", "Post-UTME", "Custom"];

export const Route = createFileRoute("/_authenticated/admin/quizzes/new")({
  component: NewQuiz,
});

function NewQuiz() {
  const navigate = useNavigate();
  const createFn = useServerFn(createQuiz);
  const [form, setForm] = useState({
    title: "", description: "", category: "Custom",
    duration_min: 30, difficulty: "medium" as "easy"|"medium"|"hard",
    instructions: "",
  });
  const create = useMutation({
    mutationFn: () => createFn({ data: {
      title: form.title, description: form.description || null, category: form.category,
      duration_min: Number(form.duration_min), difficulty: form.difficulty,
      instructions: form.instructions || null,
      is_published: false, randomize_questions: false, shuffle_options: false,
      show_answers_after: true, show_explanations: true, enforce_time: true, allow_retakes: true,
      max_attempts: null,
    }}),
    onSuccess: (q: any) => { toast.success("Quiz created"); navigate({ to: "/admin/quizzes/$id/edit", params: { id: q.id } }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-3xl font-bold">New quiz</h1>
      <Card><CardContent className="pt-6 space-y-4">
        <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Difficulty</Label>
            <Select value={form.difficulty} onValueChange={(v) => setForm({ ...form, difficulty: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div><Label>Duration (minutes)</Label><Input type="number" min={1} value={form.duration_min} onChange={(e) => setForm({ ...form, duration_min: Number(e.target.value) })} /></div>
        <div><Label>Instructions (optional)</Label><Textarea value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></div>
        <Button onClick={() => create.mutate()} disabled={!form.title || create.isPending}>{create.isPending ? "Creating…" : "Create quiz"}</Button>
      </CardContent></Card>
    </div>
  );
}
