import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getUsersOverview } from "@/lib/admin-overview.functions";
import { BehaviorInsightsPanel } from "@/components/behavior-insights";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/analytics/")({
  component: AnalyticsPanel,
  head: () => ({
    meta: [
      { title: "Analytics dashboard — HaniLearn-QZ admin" },
      { name: "description", content: "Platform behaviour, engagement and AI spend analytics with per-user drill-down." },
      { property: "og:title", content: "Analytics dashboard — HaniLearn-QZ admin" },
      { property: "og:description", content: "Platform behaviour, engagement and AI spend analytics with per-user drill-down." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function AnalyticsPanel() {
  const overviewFn = useServerFn(getUsersOverview);
  const [q, setQ] = useState("");
  const { data } = useQuery({ queryKey: ["users-overview", q], queryFn: () => overviewFn({ data: { q } }) });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground">Platform behaviour plus per-user drill-down. Click a person for their full picture.</p>
      </div>

      <BehaviorInsightsPanel />

      <Card>
        <CardHeader><CardTitle className="text-base">Per-user analytics</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, handle or email" className="pl-8" />
          </div>
          <div className="divide-y rounded-md border">
            {(data?.users ?? []).map((u: any) => (
              <Button key={u.user_id} asChild variant="ghost" className="h-auto w-full justify-between px-3 py-3">
                <Link to="/admin/analytics/$userId" params={{ userId: u.user_id }}>
                  <span className="min-w-0 flex-1 truncate text-left">
                    {u.name || u.handle || u.email || u.user_id}
                    {u.is_guest && <Badge variant="outline" className="ml-2">guest</Badge>}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </Button>
            ))}
            {!(data?.users ?? []).length && <p className="p-6 text-center text-sm text-muted-foreground">No accounts match.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
