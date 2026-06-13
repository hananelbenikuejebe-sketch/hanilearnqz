import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listStudents } from "@/lib/students.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/_authenticated/admin/students")({
  component: Students,
});

function Students() {
  const fetchFn = useServerFn(listStudents);
  const { data: students, isLoading } = useQuery({ queryKey: ["students"], queryFn: () => fetchFn() });
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return students ?? [];
    return (students ?? []).filter((s: any) =>
      (s.full_name ?? "").toLowerCase().includes(term) || (s.email ?? "").toLowerCase().includes(term)
    );
  }, [students, q]);

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Students</h1>
          <p className="text-sm text-muted-foreground">Auto-populated from sign-ups. {students?.length ?? 0} total.</p>
        </div>
        <Input placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:w-64" />
      </div>
      <Card><CardContent className="p-0"><div className="divide-y">
        {isLoading && <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>}
        {!isLoading && filtered.map((s: any) => (
          <div key={s.id} className="p-3 flex items-center justify-between text-sm gap-3">
            <div className="min-w-0">
              <div className="font-medium truncate">{s.full_name ?? "—"}</div>
              <div className="text-muted-foreground text-xs truncate">{s.email}</div>
            </div>
            <div className="text-right text-xs text-muted-foreground shrink-0">{s.attempts} attempts · {s.avg_score}% avg</div>
          </div>
        ))}
        {!isLoading && !filtered.length && (
          <div className="p-8 text-center text-muted-foreground text-sm">
            {q ? "No matches." : "No students yet. They appear here automatically when they sign up."}
          </div>
        )}
      </div></CardContent></Card>
    </div>
  );
}
