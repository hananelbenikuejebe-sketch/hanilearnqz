import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listStudents, addStudent } from "@/lib/students.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/students")({
  component: Students,
});

function Students() {
  const qc = useQueryClient();
  const fetchFn = useServerFn(listStudents);
  const addFn = useServerFn(addStudent);
  const { data: students } = useQuery({ queryKey: ["students"], queryFn: () => fetchFn() });
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [open, setOpen] = useState(false);
  const add = useMutation({
    mutationFn: () => addFn({ data: form }),
    onSuccess: () => { toast.success("Student added"); setOpen(false); setForm({ full_name: "", email: "", password: "" }); qc.invalidateQueries({ queryKey: ["students"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Students</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Add student</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add student</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Temporary password</Label><Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <Button onClick={() => add.mutate()} disabled={add.isPending}>Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <Card><CardContent className="p-0"><div className="divide-y">
        {(students ?? []).map((s: any) => (
          <div key={s.id} className="p-3 flex items-center justify-between text-sm">
            <div><div className="font-medium">{s.full_name ?? "—"}</div><div className="text-muted-foreground text-xs">{s.email}</div></div>
            <div className="text-right text-xs text-muted-foreground">{s.attempts} attempts · {s.avg_score}% avg</div>
          </div>
        ))}
        {!students?.length && <div className="p-8 text-center text-muted-foreground">No students yet.</div>}
      </div></CardContent></Card>
    </div>
  );
}
