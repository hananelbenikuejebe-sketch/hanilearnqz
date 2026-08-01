import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { listPaymentProofs, reviewPaymentProof } from "@/lib/proofs.functions";
import { getPaymentSettings, updatePaymentSettings } from "@/lib/payments.functions";

export const Route = createFileRoute("/_authenticated/admin/proofs")({
  head: () => ({
    meta: [
      { title: "Payment receipts — HaniLearn-QZ admin" },
      { name: "description", content: "Review uploaded payment receipts, confirm or reverse automatic approvals, and tune verification settings." },
      { property: "og:title", content: "Payment receipts — HaniLearn-QZ admin" },
      { property: "og:description", content: "Review uploaded payment receipts and tune verification settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProofsPage,
});

const naira = (k: number) => `₦${(k / 100).toLocaleString("en-NG")}`;

function ProofsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPaymentProofs);
  const reviewFn = useServerFn(reviewPaymentProof);
  const settingsFn = useServerFn(getPaymentSettings);
  const saveFn = useServerFn(updatePaymentSettings);

  const [status, setStatus] = useState<"pending" | "auto_approved" | "all">("pending");
  const [q, setQ] = useState("");

  const { data: proofs } = useQuery({ queryKey: ["admin-proofs", status, q], queryFn: () => listFn({ data: { status, q } }) });
  const { data: settings } = useQuery({ queryKey: ["payment-settings"], queryFn: () => settingsFn() });

  const review = useMutation({
    mutationFn: (v: { id: string; action: "confirm" | "decline"; note?: string }) => reviewFn({ data: v }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["admin-proofs"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: (v: any) => saveFn({ data: v }),
    onSuccess: () => { toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["payment-settings"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const s: any = settings ?? {};

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payments & receipts</h1>
        <p className="text-muted-foreground text-sm">Automatic checks run first; you confirm or reverse here.</p>
      </div>

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">Review queue</TabsTrigger>
          <TabsTrigger value="verify">Verification</TabsTrigger>
          <TabsTrigger value="free">Free tier</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            {(["pending", "auto_approved", "all"] as const).map((v) => (
              <Button key={v} size="sm" variant={status === v ? "default" : "outline"} onClick={() => setStatus(v)}>
                {v === "auto_approved" ? "Auto-approved" : v === "all" ? "All" : "Pending"}
              </Button>
            ))}
            <Input placeholder="Search name, email, reference…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          </div>

          {(proofs ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nothing here.</p>}
          {(proofs ?? []).map((p: any) => (
            <Card key={p.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex flex-wrap items-center gap-2">
                  {p.profiles?.full_name ?? p.profiles?.email ?? "User"}
                  <Badge variant="secondary">{p.purpose.replace(/_/g, " ")}</Badge>
                  <Badge>{naira(p.amount_kobo)}</Badge>
                  <Badge variant={p.status === "declined" ? "destructive" : "outline"}>{p.status}</Badge>
                  <Badge variant="outline">score {p.auto_confidence}{p.used_ai ? " · AI" : " · offline"}</Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  {new Date(p.created_at).toLocaleString()} · paid by {p.extracted?.claim?.sender_name ?? "—"} · ref {p.extracted?.bank_ref ?? "—"}
                  <br />{p.auto_reason}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2">
                {p.file_url && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={p.file_url} target="_blank" rel="noopener noreferrer">View receipt</a>
                  </Button>
                )}
                {p.status !== "confirmed" && p.status !== "declined" && (
                  <>
                    <Button size="sm" disabled={review.isPending} onClick={() => review.mutate({ id: p.id, action: "confirm" })}>Confirm</Button>
                    <Button size="sm" variant="destructive" disabled={review.isPending}
                      onClick={() => review.mutate({ id: p.id, action: "decline", note: "Receipt could not be verified" })}>
                      Decline & reverse
                    </Button>
                  </>
                )}
                {p.admin_note && <span className="text-xs text-muted-foreground">{p.admin_note}</span>}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="verify">
          <Card>
            <CardHeader><CardTitle className="text-base">Receipt verification</CardTitle>
              <CardDescription>Bank details shown to users, and how strict the automatic check is.</CardDescription>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-3">
              <div><Label>Bank name</Label><Input defaultValue={s.pay_bank_name ?? ""} onBlur={(e) => save.mutate({ pay_bank_name: e.target.value })} /></div>
              <div><Label>Account number</Label><Input defaultValue={s.pay_account_number ?? ""} onBlur={(e) => save.mutate({ pay_account_number: e.target.value })} /></div>
              <div><Label>Account name</Label><Input defaultValue={s.pay_account_name ?? ""} onBlur={(e) => save.mutate({ pay_account_name: e.target.value })} /></div>
              <div><Label>Support WhatsApp</Label><Input defaultValue={s.support_whatsapp ?? ""} onBlur={(e) => save.mutate({ support_whatsapp: e.target.value })} /></div>
              <div><Label>Minimum confidence (0-100)</Label><Input type="number" defaultValue={s.proof_min_confidence ?? 55} onBlur={(e) => save.mutate({ proof_min_confidence: Number(e.target.value) })} /></div>
              <div><Label>Max receipt age (days)</Label><Input type="number" defaultValue={s.proof_max_age_days ?? 5} onBlur={(e) => save.mutate({ proof_max_age_days: Number(e.target.value) })} /></div>
              <div><Label>Laxity</Label>
                <div className="flex gap-2 mt-1">
                  {(["lax", "normal", "strict"] as const).map((v) => (
                    <Button key={v} size="sm" variant={s.proof_laxity === v ? "default" : "outline"} onClick={() => save.mutate({ proof_laxity: v })}>{v}</Button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between border rounded-md p-3">
                <div><Label>Auto-approve</Label><p className="text-xs text-muted-foreground">Grant access before your review</p></div>
                <Switch checked={s.proof_auto_approve ?? true} onCheckedChange={(v) => save.mutate({ proof_auto_approve: v })} />
              </div>
              <div className="flex items-center justify-between border rounded-md p-3">
                <div><Label>Use AI image check</Label><p className="text-xs text-muted-foreground">Only when the offline check is unsure</p></div>
                <Switch checked={s.proof_use_ai ?? true} onCheckedChange={(v) => save.mutate({ proof_use_ai: v })} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="free">
          <Card>
            <CardHeader><CardTitle className="text-base">Free tier</CardTitle>
              <CardDescription>What everyone gets without paying.</CardDescription>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-3">
              <div className="flex items-center justify-between border rounded-md p-3 sm:col-span-2">
                <div><Label>Free tier enabled</Label><p className="text-xs text-muted-foreground">Anyone can create with limits</p></div>
                <Switch checked={s.free_tier_enabled ?? true} onCheckedChange={(v) => save.mutate({ free_tier_enabled: v })} />
              </div>
              <div><Label>Questions per quiz</Label><Input type="number" defaultValue={s.free_max_questions_per_quiz ?? 20} onBlur={(e) => save.mutate({ free_max_questions_per_quiz: Number(e.target.value) })} /></div>
              <div><Label>Quizzes per month</Label><Input type="number" defaultValue={s.free_max_quizzes_per_month ?? 3} onBlur={(e) => save.mutate({ free_max_quizzes_per_month: Number(e.target.value) })} /></div>
              <div><Label>Offline parse limit</Label><Input type="number" defaultValue={s.free_offline_parse_limit ?? 20} onBlur={(e) => save.mutate({ free_offline_parse_limit: Number(e.target.value) })} /></div>
              <div><Label>Monthly free AI credit (₦)</Label><Input type="number" defaultValue={(s.free_monthly_ai_credit_kobo ?? 1000) / 100} onBlur={(e) => save.mutate({ free_monthly_ai_credit_kobo: Math.round(Number(e.target.value) * 100) })} /></div>
              <div className="flex items-center justify-between border rounded-md p-3 sm:col-span-2">
                <div><Label>Free users may use AI parse</Label><p className="text-xs text-muted-foreground">Off = offline parsing only</p></div>
                <Switch checked={s.free_ai_parse ?? false} onCheckedChange={(v) => save.mutate({ free_ai_parse: v })} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
