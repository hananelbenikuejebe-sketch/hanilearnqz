import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listStudents } from "@/lib/students.functions";
import { adminGrantCredit } from "@/lib/wallet.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { toast } from "sonner";
import { Coins } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/students")({
  component: Students,
});

function Students() {
  const qc = useQueryClient();
  const fetchFn = useServerFn(listStudents);
  const grantFn = useServerFn(adminGrantCredit);
  const [q, setQ] = useState("");
  const [includeGuests, setIncludeGuests] = useState(true);
  const [granting, setGranting] = useState<any | null>(null);
  const { data: students, isLoading } = useQuery({
    queryKey: ["students", q, includeGuests],
    queryFn: () => fetchFn({ data: { q, include_guests: includeGuests } }),
  });

  const grant = useMutation({
    mutationFn: (payload: any) => grantFn({ data: payload }),
    onSuccess: () => { toast.success("Credit granted"); setGranting(null); qc.invalidateQueries({ queryKey: ["students"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Students</h1>
          <p className="text-sm text-muted-foreground">Auto-populated from sign-ups. {students?.length ?? 0} shown. Guest profiles with 0 attempts are pruned automatically.</p>
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
            <Button size="sm" variant="outline" onClick={() => setGranting(s)}>
              <Coins className="h-3.5 w-3.5 mr-1" />Grant
            </Button>
          </div>
        ))}
        {!isLoading && !(students ?? []).length && (
          <div className="p-8 text-center text-muted-foreground text-sm">
            {q ? "No matches." : "No students yet."}
          </div>
        )}
      </div></CardContent></Card>

      <Dialog open={!!granting} onOpenChange={(o) => !o && setGranting(null)}>
        {granting && <GrantDialog user={granting} saving={grant.isPending} onSubmit={(v: any) => grant.mutate({ user_id: granting.id, ...v })} />}
      </Dialog>
    </div>
  );
}

function GrantDialog({ user, saving, onSubmit }: any) {
  const [bucket, setBucket] = useState<"ai_credit" | "earnings">("ai_credit");
  const [naira, setNaira] = useState<string>("500");
  const [note, setNote] = useState<string>("");
  const amount_kobo = Math.round((parseFloat(naira) || 0) * 100);
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Grant credit — {user.full_name || user.email || user.id.slice(0, 8)}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Bucket</Label>
          <Select value={bucket} onValueChange={(v) => setBucket(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ai_credit">AI credit (for parser, essay, result AI)</SelectItem>
              <SelectItem value="earnings">Earnings (withdrawable)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Amount (₦)</Label>
          <Input type="number" min={1} step="50" value={naira} onChange={(e) => setNaira(e.target.value)} />
        </div>
        <div><Label>Note (optional)</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. compensation for failed payment" maxLength={200} />
        </div>
        <p className="text-xs text-muted-foreground">
          This is a WRITE-ONLY grant — admins can add credit but cannot deduct or alter user balances. Every grant is ledgered against your admin id.
        </p>
      </div>
      <DialogFooter>
        <Button disabled={saving || amount_kobo <= 0} onClick={() => onSubmit({ bucket, amount_kobo, note: note || undefined })}>
          {saving ? "Granting…" : `Grant ₦${(amount_kobo/100).toLocaleString()}`}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
