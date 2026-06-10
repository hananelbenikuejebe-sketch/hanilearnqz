import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ReactNode } from "react";
import { createQuiz } from "@/lib/quizzes.functions";
import { getSettings } from "@/lib/settings.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ArrowLeft, FileText, Keyboard, PenLine } from "lucide-react";

const CATS = ["JAMB/UTME", "WAEC", "NECO", "GCE O-Levels", "Post-UTME", "Custom"];
const SUBJECTS = ["Mathematics", "Physics", "Chemistry", "Biology", "English Language", "Literature", "Government", "Economics", "History", "Geography", "CRS", "IRS", "Islamic Studies", "Other"];

export const Route = createFileRoute("/_authenticated/admin/quizzes/new")({
  component: NewQuiz,
});

function NewQuiz() {
  const navigate = useNavigate();
  const createFn = useServerFn(createQuiz);
  const settingsFn = useServerFn(getSettings);
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: () => settingsFn() });
  const [form, setForm] = useState({
    title: "", description: "", category: "JAMB/UTME", customCategory: "",
    subject: "", customSubject: "", duration_min: 60, difficulty: "medium" as "easy"|"medium"|"hard",
    instructions: "", input_method: "paste" as "upload"|"paste"|"manual", visibility: "public" as "public"|"private", access_key: "",
    strictness: "normal" as "loose"|"normal"|"strict", auto_detect_type: true, confidence_threshold: 80, default_question_type: "mcq" as "mcq"|"tf"|"short"|"essay", ask_confirmation: true,
  });
  const categories = settings?.categories?.length ? settings.categories : CATS;
  const subjects = settings?.subject_tags?.length ? settings.subject_tags : SUBJECTS;
  const finalCategory = form.category === "Custom" ? form.customCategory.trim() : form.category;
  const finalSubject = form.subject === "Other" ? form.customSubject.trim() : form.subject.trim();
  const create = useMutation({
    mutationFn: () => createFn({ data: {
      title: form.title.trim(), description: form.description || null, category: finalCategory,
      subject: finalSubject || null,
      duration_min: Number(form.duration_min), difficulty: form.difficulty,
      instructions: form.instructions || null,
      visibility: form.visibility, access_key: form.visibility === "private" ? form.access_key || makeAccessKey() : null,
      input_method: form.input_method, source_type: form.input_method,
      parsing_settings: {
        strictness: form.strictness,
        auto_detect_type: form.auto_detect_type,
        confidence_threshold: form.confidence_threshold,
        default_question_type: form.default_question_type,
        ask_confirmation: form.ask_confirmation,
      },
      is_published: false, randomize_questions: false, shuffle_options: false,
      show_answers_after: true, show_explanations: true, enforce_time: true, allow_retakes: true,
      max_attempts: null,
    }}),
    onSuccess: (q: any) => { toast.success("Quiz created"); navigate({ to: "/admin/quizzes/$id/edit", params: { id: q.id } }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild><Link to="/admin/quizzes"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link></Button>
        <div><h1 className="text-3xl font-bold">Create New Quiz</h1><p className="text-sm text-muted-foreground">Set the quiz shell, then choose how questions enter the editor.</p></div>
      </div>
      <Card><CardHeader><CardTitle>Step 1: Basic information</CardTitle></CardHeader><CardContent className="space-y-4">
        <div><Label>Quiz Title</Label><Input maxLength={100} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="JAMB 2024 Biology Practice" /><p className="mt-1 text-xs text-muted-foreground">Name your quiz.</p></div>
        <div><Label>Description</Label><Textarea maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description of what students will learn" /></div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{[...new Set([...categories, "Custom"])].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            {form.category === "Custom" && <Input value={form.customCategory} onChange={(e) => setForm({ ...form, customCategory: e.target.value })} placeholder="Category name" />}
          </div>
          <div className="space-y-2"><Label>Subject/Topic</Label>
            <Select value={form.subject || undefined} onValueChange={(v) => setForm({ ...form, subject: v })}>
              <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
              <SelectContent>{[...new Set([...subjects, "Other"])].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            {form.subject === "Other" && <Input value={form.customSubject} onChange={(e) => setForm({ ...form, customSubject: e.target.value })} placeholder="Subject name" />}
          </div>
        </div>
        <div><Label>Difficulty Level</Label>
          <RadioGroup className="mt-2 grid sm:grid-cols-3 gap-2" value={form.difficulty} onValueChange={(v) => setForm({ ...form, difficulty: v as any })}>
            {["easy", "medium", "hard"].map((d) => <Label key={d} className="flex items-start gap-2 rounded-md border p-3"><RadioGroupItem value={d} /> <span className="capitalize">{d}<span className="block text-xs font-normal text-muted-foreground">{d === "easy" ? "Beginner concepts" : d === "medium" ? "Mixed difficulty" : "Advanced questions"}</span></span></Label>)}
          </RadioGroup>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>Duration (minutes)</Label><Input type="number" min={5} max={600} value={form.duration_min} onChange={(e) => setForm({ ...form, duration_min: Number(e.target.value) })} /><p className="mt-1 text-xs text-muted-foreground">Range: 5–600 minutes.</p></div>
          <div className="space-y-2"><Label>Access</Label>
            <Select value={form.visibility} onValueChange={(v) => setForm({ ...form, visibility: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="public">Public quiz</SelectItem><SelectItem value="private">Private quiz with key</SelectItem></SelectContent>
            </Select>
            {form.visibility === "private" && <Input value={form.access_key} onChange={(e) => setForm({ ...form, access_key: e.target.value })} placeholder="Leave blank to auto-generate" />}
          </div>
        </div>
        <div><Label>Instructions</Label><div className="mb-2 flex gap-1"><Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, instructions: `${form.instructions}**bold**` })}>B</Button><Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, instructions: `${form.instructions}_italic_` })}>I</Button><Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, instructions: `${form.instructions}\n- point` })}>•</Button></div><Textarea value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder="Any special instructions for students" /></div>
      </CardContent></Card>

      <Card><CardHeader><CardTitle>Step 2: Question input method</CardTitle></CardHeader><CardContent className="space-y-4">
        <RadioGroup className="grid sm:grid-cols-3 gap-3" value={form.input_method} onValueChange={(v) => setForm({ ...form, input_method: v as any })}>
          <Method value="upload" icon={<FileText className="h-4 w-4" />} title="Upload Document" />
          <Method value="paste" icon={<Keyboard className="h-4 w-4" />} title="Paste Text" />
          <Method value="manual" icon={<PenLine className="h-4 w-4" />} title="Create Manually" />
        </RadioGroup>
        {form.input_method === "upload" && <div className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">Supports .docx, .txt, .pdf, Google Docs, and Notion sources in the parser workflow. Create the draft now, then use the editor import panel.</div>}
        {form.input_method === "paste" && <Textarea rows={5} readOnly value={'1. What is the capital of France?\nA) Berlin\nB) Madrid\nC) Paris\nD) Rome\nAnswer: C'} />}
        {form.input_method === "manual" && <div className="rounded-md border p-4 text-sm text-muted-foreground">The editor opens with manual add, duplicate, move, save draft, preview, and publish controls.</div>}
        <div className="grid sm:grid-cols-2 gap-3 rounded-md border p-4">
          <div><Label>Parsing strictness</Label><Select value={form.strictness} onValueChange={(v) => setForm({ ...form, strictness: v as any })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="loose">Loose</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="strict">Strict</SelectItem></SelectContent></Select></div>
          <div><Label>Confidence threshold</Label><Input type="number" min={30} max={95} value={form.confidence_threshold} onChange={(e) => setForm({ ...form, confidence_threshold: Number(e.target.value) })} /></div>
          <div><Label>Default question type</Label><Select value={form.default_question_type} onValueChange={(v) => setForm({ ...form, default_question_type: v as any })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mcq">Multiple choice</SelectItem><SelectItem value="tf">True/False</SelectItem><SelectItem value="short">Short answer</SelectItem><SelectItem value="essay">Essay/Theory</SelectItem></SelectContent></Select></div>
          <label className="flex items-center justify-between gap-3 rounded-md border p-3"><span className="text-sm">Auto-detect question type</span><Switch checked={form.auto_detect_type} onCheckedChange={(v) => setForm({ ...form, auto_detect_type: v })} /></label>
          <label className="flex items-center justify-between gap-3 rounded-md border p-3 sm:col-span-2"><span className="text-sm">Ask for confirmation before importing</span><Switch checked={form.ask_confirmation} onCheckedChange={(v) => setForm({ ...form, ask_confirmation: v })} /></label>
        </div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => create.mutate()} disabled={!form.title || !finalCategory || create.isPending}>Save draft</Button><Button onClick={() => create.mutate()} disabled={!form.title || !finalCategory || create.isPending}>{create.isPending ? "Creating…" : "Next: Add Questions"}</Button></div>
      </CardContent></Card>
    </div>
  );
}

function Method({ value, icon, title }: { value: string; icon: ReactNode; title: string }) {
  return <Label className="flex items-center gap-2 rounded-md border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-accent/20"><RadioGroupItem value={value} />{icon}<span className="font-medium">{title}</span></Label>;
}

function makeAccessKey() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
