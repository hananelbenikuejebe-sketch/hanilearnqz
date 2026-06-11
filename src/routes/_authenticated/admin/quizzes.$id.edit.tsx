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
  const parse = useMutation({
    mutationFn: () => aiFn({ data: { text } }),
    onSuccess: (r: any) => { setParsed(r.questions); toast.success(`Parsed ${r.questions.length} questions`); },
    onError: (e: any) => toast.error(e.message),
  });
  const save = useMutation({
    mutationFn: () => bulkFn({ data: { quiz_id: quizId, questions: parsed!.map((q) => ({
      type: q.type, text: q.text, explanation: q.explanation ?? null,
      difficulty: q.difficulty ?? "medium", tags: [],
      options: q.options ?? [],
    })) }}),
    onSuccess: () => { toast.success("Added to quiz"); setParsed(null); setText(""); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card><CardContent className="pt-6 space-y-4">
      <div>
        <Label>Paste questions</Label>
        <p className="text-xs text-muted-foreground mb-2">
          Recommended format: numbered question, options A) B) C) D), then "Answer: B". Supports True/False, short answer, essays, comprehension passages, and 5+ options.
        </p>
        <Textarea rows={12} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={`1. What is the capital of France?\nA) Berlin\nB) Madrid\nC) Paris\nD) Rome\nAnswer: C\n\n2. The earth is flat. (True/False)\nAnswer: False`} />
      </div>
      <Button onClick={() => parse.mutate()} disabled={!text || parse.isPending}>
        <Sparkles className="h-4 w-4 mr-1" />{parse.isPending ? "Parsing…" : "Parse with AI"}
      </Button>
      {parsed && (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">{parsed.length} parsed question(s). Review and add to quiz.</div>
          {parsed.map((q, i) => (
            <Card key={i}><CardContent className="pt-4 text-sm">
              <div className="font-medium">{i + 1}. {q.text}</div>
              <div className="text-xs text-muted-foreground">{q.type}</div>
              {q.options?.map((o: any, j: number) => (
                <div key={j} className={o.is_correct ? "text-success font-medium" : ""}>{String.fromCharCode(65+j)}. {o.text}{o.is_correct && " ✓"}</div>
              ))}
            </CardContent></Card>
          ))}
          <div className="flex gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Add all to quiz</Button>
            <Button variant="ghost" onClick={() => setParsed(null)}>Discard</Button>
          </div>
        </div>
      )}
    </CardContent></Card>
  );
}
