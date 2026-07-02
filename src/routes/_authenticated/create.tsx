import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyCreatorStatus } from "@/lib/creators.functions";
import { AppShell } from "@/components/app-nav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Plus, Lock, GraduationCap, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/create")({
  head: () => ({ meta: [
    { title: "Create — HaniLearn-QZ" },
    { name: "description", content: "Build quizzes and exams. Join as a creator to publish to the community." },
  ] }),
  component: Create,
});

function Create() {
  const fetchStatus = useServerFn(getMyCreatorStatus);
  const { data: status, isLoading } = useQuery({ queryKey: ["creator-status"], queryFn: () => fetchStatus() });

  return (
    <AppShell isSuperAdmin={status?.is_super_admin}>
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create</h1>
          <p className="text-muted-foreground">Publish quizzes and exams to the community.</p>
        </div>

        {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}

        {status && !status.can_create && (
          <Card className="border-dashed">
            <CardHeader>
              <div className="flex items-center gap-2"><Lock className="h-5 w-5" /><CardTitle>Creator access</CardTitle></div>
              <CardDescription>Creators can publish quizzes, exams, and access analytics. Request access from a super admin to get started.</CardDescription>
            </CardHeader>
            <CardContent><Button disabled variant="outline">Request creator access (coming soon)</Button></CardContent>
          </Card>
        )}

        {status?.can_create && (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <ActionCard
                icon={Plus}
                title="New quiz"
                desc="Manually build questions, paste from a document, or use AI to import."
                to="/admin/quizzes/new"
                cta={status.is_super_admin ? "Start quiz" : "Coming soon for creators"}
                disabled={!status.is_super_admin}
              />
              <ActionCard
                icon={GraduationCap}
                title="New exam bundle"
                desc="Combine multiple quizzes into a single, structured exam."
                to="/create"
                cta="Coming soon"
                disabled
              />
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Your permissions</CardTitle>
                  {status.is_super_admin && <Badge>Super admin</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Perm on={status.permissions?.ai_enabled ?? status.is_super_admin} label="AI parsing" icon={Sparkles} />
                <Perm on={status.permissions?.analytics_enabled ?? true} label="Analytics" icon={BarChart3} />
                <Perm on={status.permissions?.can_publish ?? status.is_super_admin} label="Can publish" icon={Plus} />
                {status.permissions?.max_quizzes != null && (
                  <div className="text-xs text-muted-foreground">Quiz cap: <span className="font-medium text-foreground">{status.permissions.max_quizzes}</span></div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Manage</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button asChild variant="outline"><Link to="/admin/quizzes">My quizzes</Link></Button>
                {status.is_super_admin && (
                  <>
                    <Button asChild variant="outline"><Link to="/admin/students">Students</Link></Button>
                    <Button asChild variant="outline"><Link to="/admin/creators">Creators</Link></Button>
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

function ActionCard({ icon: Icon, title, desc, to, cta, disabled }: any) {
  return (
    <Card className="hover:shadow-md transition">
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Icon className="h-5 w-5" />{title}</CardTitle><CardDescription>{desc}</CardDescription></CardHeader>
      <CardContent>
        {disabled
          ? <Button disabled variant="outline" className="w-full">{cta}</Button>
          : <Button asChild className="w-full"><Link to={to}>{cta}</Link></Button>}
      </CardContent>
    </Card>
  );
}

function Perm({ on, label, icon: Icon }: any) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2"><Icon className="h-4 w-4" />{label}</span>
      <Badge variant={on ? "default" : "outline"}>{on ? "Enabled" : "Disabled"}</Badge>
    </div>
  );
}
