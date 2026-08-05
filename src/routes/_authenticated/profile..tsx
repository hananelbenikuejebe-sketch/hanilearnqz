import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPublicProfile, toggleFollow } from "@/lib/profiles.functions";
import { getMyCreatorStatus } from "@/lib/creators.functions";
import { AppShell } from "@/components/app-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { UserPlus, UserCheck, ListChecks, MessageCircle, Award } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile/")({
  head: () => ({ meta: [
    { title: "Community profile — HaniLearn-QZ" },
    { name: "description", content: "View a HaniLearn-QZ creator profile, achievements and published quizzes." },
    { property: "og:title", content: "Community profile — HaniLearn-QZ" },
    { property: "og:description", content: "View a creator's achievements and published quizzes." },
    { property: "og:type", content: "profile" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PublicProfile,
});

function PublicProfile() {
  // Route param drives every query below — this page must never fall back to "me".
  const { userId } = Route.useParams();
  const qc = useQueryClient();
  const fetchFn = useServerFn(getPublicProfile);
  const statusFn = useServerFn(getMyCreatorStatus);
  const followFn = useServerFn(toggleFollow);
  const { data, isLoading } = useQuery({
    queryKey: ["public-profile", userId],
    queryFn: () => fetchFn({ data: { user_id: userId } }),
  });
  const { data: status } = useQuery({ queryKey: ["creator-status"], queryFn: () => statusFn() });
  const follow = useMutation({
    mutationFn: () => followFn({ data: { user_id: userId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["public-profile", userId] }),
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading || !data) {
    return (
      <AppShell isSuperAdmin={status?.is_super_admin}>
        <div className="p-8 text-sm text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }

  // If this is my own id, send the user to their private profile which has richer, private stats.
  if (data.is_self) return <Navigate to="/profile" />;

  const p = data.profile;
  const initials = (p.full_name || p.handle || "?").split(" ").filter(Boolean).map((s: string) => s[0]).join("").slice(0, 2).toUpperCase();

  return (
    <AppShell isSuperAdmin={status?.is_super_admin}>
      <div className="mx-auto max-w-4xl space-y-4 p-3 md:p-8">
        <Card>
          <CardContent className="flex flex-wrap items-center gap-4 p-4 md:p-6">
            <Avatar className="h-14 w-14 md:h-16 md:w-16">
              <AvatarFallback className="text-base">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate">{p.full_name || p.handle || "Unknown"}</h1>
                {p.is_guest && <Badge variant="outline">Guest</Badge>}
              </div>
              {p.handle && <p className="text-sm text-muted-foreground">@{p.handle}</p>}
              {p.bio && <p className="mt-2 text-sm">{p.bio}</p>}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="tabular-nums"><b className="text-foreground">{data.quizzes.length}</b> quizzes created</span>
                <span className="tabular-nums"><b className="text-foreground">{data.unique_quizzes_taken}</b> quizzes joined</span>
                <span className="tabular-nums"><b className="text-foreground">{data.followers}</b> followers</span>
                <span className="tabular-nums"><b className="text-foreground">{data.following}</b> following</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant={data.i_follow ? "outline" : "default"} onClick={() => follow.mutate()} disabled={follow.isPending}>
                {data.i_follow ? <><UserCheck className="mr-1 h-4 w-4" />Following</> : <><UserPlus className="mr-1 h-4 w-4" />Follow</>}
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/messages/$userId" params={{ userId }}><MessageCircle className="mr-1 h-4 w-4" />Message</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <div>
          <h2 className="mb-2 flex items-center gap-2"><Award className="h-4 w-4" />Achievements</h2>
          <div className="flex flex-wrap gap-2">
            {(data.badges ?? []).filter((b: string | null): b is string => Boolean(b)).map((b: string) => (
              <Badge key={b} variant={b.startsWith("Pro") ? "default" : "secondary"}>{b}</Badge>
            ))}
            {!(data.badges ?? []).length && <span className="text-sm text-muted-foreground">Milestones will appear here.</span>}
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ListChecks className="h-4 w-4" />Published quizzes</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {data.quizzes.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No public quizzes yet.</div>}
              {data.quizzes.map((q: any) => (
                <Link key={q.id} to="/quiz/$quizId" params={{ quizId: q.id }} className="flex items-center gap-3 p-3 text-sm hover:bg-accent/40">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{q.title}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">{q.category}</Badge>
                      <span className="capitalize">{q.difficulty}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">Scores and attempt history are private and only visible to this user.</p>
      </div>
    </AppShell>
  );
}
