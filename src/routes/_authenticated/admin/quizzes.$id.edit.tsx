import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { getQuizAdmin, updateQuiz } from "@/lib/quizzes.functions";
import { createQuestion, updateQuestion, deleteQuestion, bulkInsertQuestions } from "@/lib/questions.functions";
import { parseQuestionsFromText } from "@/lib/ai-parse.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, Plus, Sparkles, ArrowLeft, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";


export const Route = createFileRoute("/_authenticated/admin/quizzes/$id/edit")({
  component: EditQuiz,
});

function EditQuiz() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const fetchQuiz = useServerFn(getQuizAdmin);
  const updFn = useServerFn(updateQuiz);
  const addFn = useServerFn(createQuestion);
  const updQFn = useServerFn(updateQuestion);
  const delQFn = useServerFn(deleteQuestion);
  const bulkFn = useServerFn(bulkInsertQuestions);
  const aiFn = useServerFn(parseQuestionsFromText);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-quiz", id],
    queryFn: () => fetchQuiz({ data: { id } }),
  });

  const update = useMutation({
    mutationFn: (patch: any) => updFn({ data: { id, patch } }),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["admin-quiz", id] }); },
  });
  const addQ = useMutation({
    mutationFn: () => addFn({ data: {
      quiz_id: id, type: "mcq", text: "New question", explanation: null,
      difficulty: "medium", tags: [],
      options: [
        { text: "Option A", is_correct: true },
        { text: "Option B", is_correct: false },
        { text: "Option C", is_correct: false },
        { text: "Option D", is_correct: false },
      ],
    }}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-quiz", id] }),
  });
  const delQ = useMutation({
    mutationFn: (qid: string) => delQFn({ data: { id: qid } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-quiz", id] }),
  });

  if (isLoading || !data) return <div>Loading…</div>;
  const { quiz, questions } = data;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild><Link to="/admin/quizzes"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link></Button>
        <h1 className="text-2xl font-bold flex-1 truncate">{quiz.title}</h1>
      </div>

      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="questions">Questions ({questions.length})</TabsTrigger>
          <TabsTrigger value="ai">AI Import</TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <SettingsForm quiz={quiz} onSave={(p) => update.mutate(p)} />
        </TabsContent>

        <TabsContent value="questions" className="space-y-4">
          {questions.map((q: any, i: number) => (
            <QuestionCard key={q.id} q={q} index={i}
              onSave={(patch, options) => updQFn({ data: { id: q.id, patch, options } }).then(() => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["admin-quiz", id] }); })}
              onDelete={() => { if (confirm("Delete this question?")) delQ.mutate(q.id); }} />
          ))}
          <Button onClick={() => addQ.mutate()} variant="outline" className="w-full"><Plus className="h-4 w-4 mr-1" />Add question</Button>
        </TabsContent>

        <TabsContent value="ai">
          <AIPanel quizId={id} aiFn={aiFn} bulkFn={bulkFn} onDone={() => qc.invalidateQueries({ queryKey: ["admin-quiz", id] })} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SettingsForm({ quiz, onSave }: { quiz: any; onSave: (p: any) => void }) {
  const [f, setF] = useState({ ...quiz });
  const CATS = ["JAMB", "WAEC", "NECO", "GCE", "Post-UTME", "Custom"];
  return (
    <Card><CardContent className="pt-6 space-y-4">
      <div><Label>Title</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
      <div><Label>Description</Label><Textarea value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
      <div className="grid sm:grid-cols-3 gap-4">
        <div><Label>Category</Label>
          <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CATS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Duration (min)</Label><Input type="number" value={f.duration_min} onChange={(e) => setF({ ...f, duration_min: Number(e.target.value) })} /></div>
        <div><Label>Difficulty</Label>
          <Select value={f.difficulty} onValueChange={(v) => setF({ ...f, difficulty: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">Easy</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="hard">Hard</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div><Label>Instructions</Label><Textarea value={f.instructions ?? ""} onChange={(e) => setF({ ...f, instructions: e.target.value })} /></div>
      <div className="grid sm:grid-cols-2 gap-3">
        {[
          ["is_published", "Published"],
          ["randomize_questions", "Randomize question order"],
          ["shuffle_options", "Shuffle options"],
          ["show_answers_after", "Show answers after submit"],
          ["show_explanations", "Show explanations"],
          ["enforce_time", "Enforce time limit"],
          ["allow_retakes", "Allow retakes"],
        ].map(([k, label]) => (
          <label key={k} className="flex items-center justify-between p-2 border rounded">
            <span className="text-sm">{label}</span>
            <Switch checked={!!f[k]} onCheckedChange={(v) => setF({ ...f, [k]: v })} />
          </label>
        ))}
      </div>
      <Button onClick={() => {
        const { id: _, created_at: _c, updated_at: _u, created_by: _b, ...patch } = f;
        onSave(patch);
      }}>Save settings</Button>
    </CardContent></Card>
  );
}

function QuestionCard({ q, index, onSave, onDelete }: { q: any; index: number; onSave: (patch: any, options: any[]) => void; onDelete: () => void }) {
  const [text, setText] = useState(q.text);
  const [type, setType] = useState(q.type);
  const [explanation, setExplanation] = useState(q.explanation ?? "");
  const [difficulty, setDifficulty] = useState(q.difficulty);
  const [options, setOptions] = useState(
    (q.options ?? []).sort((a: any, b: any) => a.position - b.position).map((o: any) => ({ text: o.text, is_correct: o.is_correct }))
  );

  function setCorrect(i: number) {
    setOptions(options.map((o: any, idx: number) => ({ ...o, is_correct: idx === i })));
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <div className="flex items-start gap-2">
          <Badge>{index + 1}</Badge>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="flex-1" />
          <Button size="icon" variant="ghost" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Select value={type} onValueChange={(v) => setType(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mcq">Multiple Choice</SelectItem>
              <SelectItem value="tf">True / False</SelectItem>
              <SelectItem value="short">Short answer</SelectItem>
              <SelectItem value="essay">Essay / Theory</SelectItem>
            </SelectContent>
          </Select>
          <Select value={difficulty} onValueChange={(v) => setDifficulty(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">Easy</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="hard">Hard</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(type === "mcq" || type === "tf") && (
          <div className="space-y-2">
            {options.map((o: any, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <input type="radio" name={`correct-${q.id}`} checked={o.is_correct} onChange={() => setCorrect(i)} />
                <Input value={o.text} onChange={(e) => setOptions(options.map((oo: any, ii: number) => ii === i ? { ...oo, text: e.target.value } : oo))} />
                <Button size="icon" variant="ghost" onClick={() => setOptions(options.filter((_: any, ii: number) => ii !== i))}><Trash2 className="h-3 w-3" /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setOptions([...options, { text: "", is_correct: false }])}><Plus className="h-3 w-3 mr-1" />Add option</Button>
          </div>
        )}
        <div><Label className="text-xs">Explanation</Label><Textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={2} /></div>
        <Button size="sm" onClick={() => onSave({ text, type, explanation: explanation || null, difficulty }, options)}>Save question</Button>
      </CardContent>
    </Card>
  );
}

function Badge({ children }: { children: any }) {
  return <span className="inline-flex items-center justify-center h-6 w-6 rounded bg-primary text-primary-foreground text-xs font-bold shrink-0">{children}</span>;
}

function AIPanel({ quizId, aiFn, bulkFn, onDone }: any) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<any[] | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: "" });
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState<Record<number, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    const lower = file.name.toLowerCase();
    if (file.size > 2 * 1024 * 1024) { toast.error("File too large (max 2MB). Paste in chunks."); return; }
    if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".csv") || file.type.startsWith("text/")) {
      const t = await file.text();
      setText(t);
      toast.success(`Loaded ${file.name}`);
    } else {
      toast.error("Only .txt / .md / .csv supported. For PDF or DOCX, copy the text and paste it.");
    }
  }

  function chunkText(raw: string): string[] {
    const max = 6000;
    if (raw.length <= max) return [raw];
    const blocks = raw.split(/\n\s*\n/);
    const chunks: string[] = [];
    let cur = "";
    for (const b of blocks) {
      if ((cur + "\n\n" + b).length > max && cur) {
        chunks.push(cur);
        cur = b;
      } else {
        cur = cur ? `${cur}\n\n${b}` : b;
      }
    }
    if (cur) chunks.push(cur);
    return chunks;
  }

  async function runParse() {
    if (!text.trim()) return;
    setRunning(true);
    setParsed(null);
    const chunks = chunkText(text);
    setProgress({ done: 0, total: chunks.length, label: `Preparing ${chunks.length} chunk${chunks.length > 1 ? "s" : ""}…` });
    const all: any[] = [];
    try {
      for (let i = 0; i < chunks.length; i++) {
        setProgress({ done: i, total: chunks.length, label: `Parsing chunk ${i + 1} of ${chunks.length}…` });
        const r: any = await aiFn({ data: { text: chunks[i] } });
        all.push(...(r.questions ?? []));
      }
      setProgress({ done: chunks.length, total: chunks.length, label: "Done" });
      setParsed(all);
      const needs = all.filter((q) => q.needs_review).length;
      toast.success(`Parsed ${all.length} question${all.length === 1 ? "" : "s"}${needs ? ` · ${needs} need review` : ""}`);
    } catch (e: any) {
      toast.error(e.message ?? "Parse failed");
    } finally {
      setRunning(false);
    }
  }

  function updateQ(i: number, patch: any) {
    setParsed((prev) => prev?.map((q, idx) => idx === i ? { ...q, ...patch } : q) ?? null);
  }
  function removeQ(i: number) {
    setParsed((prev) => prev?.filter((_, idx) => idx !== i) ?? null);
  }

  const save = useMutation({
    mutationFn: () => bulkFn({ data: { quiz_id: quizId, questions: parsed!.map((q) => ({
      type: q.type, text: q.text, explanation: q.explanation ?? null,
      difficulty: q.difficulty ?? "medium", tags: q.tags ?? [],
      ai_confidence: q.ai_confidence ?? null, needs_review: q.needs_review ?? false,
      review_reason: q.review_reason ?? null, raw_import_text: q.raw_import_text ?? null,
      sample_answer: q.sample_answer ?? null,
      options: (q.options ?? []).filter((o: any) => o.text?.trim()),
    })) }}),
    onSuccess: () => { toast.success("Added to quiz"); setParsed(null); setText(""); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const needsReviewCount = parsed?.filter((q) => q.needs_review).length ?? 0;

  return (
    <Card><CardContent className="pt-6 space-y-4">
      <div className="space-y-2">
        <Label>Source content</Label>
        <p className="text-xs text-muted-foreground">
          Paste any mix of MCQ, True/False, short-answer, essay, or comprehension passages. Long input is split into chunks automatically and parsed in sequence with live progress.
        </p>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".txt,.md,.csv,text/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={running}>
            <Upload className="h-4 w-4 mr-1" />Upload .txt / .md / .csv
          </Button>
          <span className="text-xs text-muted-foreground self-center">PDF / DOCX: copy text & paste below.</span>
        </div>
        <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} disabled={running}
          placeholder={`Passage: The water cycle ...\n\n1. What stage follows evaporation?\nA) Precipitation\nB) Condensation\nC) Runoff\nD) Infiltration\nAnswer: B\n\n2. The sun powers the water cycle. (True/False)\nAnswer: True\n\n3. Discuss the role of transpiration in the water cycle.`} />
        <div className="text-xs text-muted-foreground">{text.length.toLocaleString()} characters · ~{Math.max(1, Math.ceil(text.length / 6000))} chunk(s)</div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={runParse} disabled={!text.trim() || running}>
          <Sparkles className="h-4 w-4 mr-1" />{running ? "Parsing…" : "Parse with AI"}
        </Button>
        {parsed && <Button type="button" variant="ghost" onClick={() => { setParsed(null); setProgress({ done: 0, total: 0, label: "" }); }}>Discard parsed</Button>}
      </div>

      {(running || progress.total > 0) && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{progress.label}</span>
            <span className="tabular-nums">{progress.done}/{progress.total} · {pct}%</span>
          </div>
          <Progress value={pct} />
        </div>
      )}

      {parsed && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm">
              <span className="font-medium">{parsed.length}</span> parsed
              {needsReviewCount > 0 && <span className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5" />{needsReviewCount} need review</span>}
              {needsReviewCount === 0 && parsed.length > 0 && <span className="ml-2 inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" />all clear</span>}
            </div>
            <Button type="button" onClick={() => save.mutate()} disabled={save.isPending || parsed.length === 0}>
              {save.isPending ? "Adding…" : `Add ${parsed.length} to quiz`}
            </Button>
          </div>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {parsed.map((q, i) => (
              <ParsedCard key={i} q={q} i={i}
                editing={!!editing[i]}
                onToggle={() => setEditing((e) => ({ ...e, [i]: !e[i] }))}
                onChange={(patch: any) => updateQ(i, patch)}
                onRemove={() => removeQ(i)} />
            ))}
          </div>
        </div>
      )}
    </CardContent></Card>
  );
}

function ParsedCard({ q, i, editing, onToggle, onChange, onRemove }: any) {
  const conf = Math.round(q.ai_confidence ?? 0);
  const confColor = conf >= 85 ? "text-emerald-600 dark:text-emerald-400" : conf >= 60 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
  return (
    <Card className={q.needs_review ? "border-amber-400/50" : ""}>
      <CardContent className="pt-4 text-sm space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-bold text-foreground">{i + 1}.</span>
            <span className="uppercase">{q.type}</span>
            <span className={`tabular-nums ${confColor}`}>{conf}%</span>
            {q.needs_review && <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><AlertTriangle className="h-3 w-3" />review</span>}
          </div>
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={onToggle}>{editing ? "Done" : "Edit"}</Button>
            <Button type="button" size="icon" variant="ghost" onClick={onRemove} aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
        {editing
          ? <Textarea rows={3} value={q.text} onChange={(e) => onChange({ text: e.target.value })} />
          : <div className="whitespace-pre-wrap font-medium">{q.text}</div>}
        {q.options?.length > 0 && (
          <div className="space-y-1">
            {q.options.map((o: any, j: number) => (
              <div key={j} className="flex items-start gap-2">
                <input type={q.type === "mcq" || q.type === "tf" ? "radio" : "checkbox"} name={`p-${i}`}
                  checked={!!o.is_correct}
                  onChange={() => onChange({ options: q.options.map((oo: any, jj: number) => ({ ...oo, is_correct: jj === j })) })}
                  className="mt-1" />
                {editing
                  ? <Input value={o.text} onChange={(e) => onChange({ options: q.options.map((oo: any, jj: number) => jj === j ? { ...oo, text: e.target.value } : oo) })} />
                  : <span className={o.is_correct ? "font-medium text-emerald-700 dark:text-emerald-400" : ""}>{String.fromCharCode(65 + j)}. {o.text}{o.is_correct && " ✓"}</span>}
              </div>
            ))}
          </div>
        )}
        {q.review_reason && <div className="text-xs text-amber-600 dark:text-amber-400">{q.review_reason}</div>}
        {q.sample_answer && !editing && <div className="text-xs text-muted-foreground italic">Model answer: {q.sample_answer}</div>}
      </CardContent>
    </Card>
  );
}

