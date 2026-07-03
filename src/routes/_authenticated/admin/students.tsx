import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listStudents } from "@/lib/students.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/admin/students")({
  component: Students,
});

function Students() {
  const fetchFn = useServerFn(listStudents);
  const [q, setQ] = useState("");
  const [includeGuests, setIncludeGuests] = useState(true);
  const { data: students, isLoading } = useQuery({
    queryKey: ["students", q, includeGuests],
    queryFn: () => fetchFn({ data: { q, include_guests: includeGuests } }),
  });

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Students</h1>
          <p className="text-sm text-muted-foreground">Auto-populated from sign-ups and guest visits. {students?.length ?? 0} shown.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={includeGuests} onCheckedChange={setIncludeGuests} />
            Include guests
          </label>
          <Input placeholder="Search name, handle or email…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:w-64" />
        </div>
      </div>
      <Card><CardContent className="p-0"><div className="divide-y">
        {isLoading && <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>}
        {!isLoading && (students ?? []).map((s: any) => (
          <div key={s.id} className="p-3 flex items-center justify-between text-sm gap-3">
            <div className="min-w-0">
              <div className="font-medium truncate flex items-center gap-2">
                {s.full_name ?? s.handle ?? "—"}
                {s.is_guest && <Badge variant="outline" className="text-[10px]">Guest</Badge>}
              </div>
              <div className="text-muted-foreground text-xs truncate">{s.email ?? s.handle ?? s.id.slice(0, 8)}</div>
            </div>
            <div className="text-right text-xs text-muted-foreground shrink-0">{s.attempts} attempts · {s.avg_score}% avg</div>
          </div>
        ))}
        {!isLoading && !(students ?? []).length && (
          <div className="p-8 text-center text-muted-foreground text-sm">
            {q ? "No matches." : "No students yet. They appear here automatically when they sign up or open the app."}
          </div>
        )}
      </div></CardContent></Card>
    </div>
  );
}

