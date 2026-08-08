import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPublicProfile, toggleFollow } from "@/lib/profiles.functions";
import { ShareButton } from "@/components/share-button";
import { getMyCreatorStatus } from "@/lib/creators.functions";
import { AppShell } from "@/components/app-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { UserPlus, UserCheck, ListChecks, MessageCircle, Award } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile/$userId")({
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
  const { userId } = Route.useParams();
  const qc = useQueryClient();
  const fetchFn = useServerFn(getPublicProfile);
  const statusFn = useServerFn(getMyCreatorStatus);
  const followFn = useServerFn(toggleFollow);
  const { data, isLoading } = useQuery({ queryKey: ["public-profile", userId], queryFn: () => fetchFn({ data: { user_id: userId } }) });
  const { data: status } = useQuery({ queryKey: ["creator-status"], queryFn: () => statusFn() });
  const follow = useMutation({
    mutationFn: () => followFn({ data: { user_id: userId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["public-profile", userId] }),
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading || !data) return <AppShell isSuperAdmin={status?.is_super_admin}><div className="p-8">Loading…</div></AppShell>;
  const p = data.profile;
  const initials = (p.full_name || p.handle || "?").split(" ").map((s: string) => s[0]).join("").slice(0, 2).toUpperCase();

  return (
    <AppShell isSuperAdmin={status?.is_super_admin}>
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <Card>
          <CardContent className="p-6 flex items-center gap-4 flex-wrap">
            <Avatar className="h-16 w-16"><AvatarFallback className="text-lg">{initials}</AvatarFallback></Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold truncate">{p.full_name || p.handle || "Unknown"}</h1>
                {p.is_guest && <Badge variant="outline">Guest</Badge>}
              </div>
              {p.handle && <p className="text-sm text-muted-foreground">@{p.handle}</p>}
              {p.bio && <p className="text-sm mt-2">{p.bio}</p>}
              <div className="flex gap-4 text-xs mt-2 text-muted-foreground">
                <span><b className="text-foreground">{data.quizzes.length}</b> quizzes</span>
                <span><b className="text-foreground">{data.unique_quizzes_taken}</b> taken</span>
                <span><b className="text-foreground">{data.followers}</b> followers</span>
                <span><b className="text-foreground">{data.following}</b> following</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
            <ShareButton
              url={`/profile/${userId}`}
              title={`${p.full_name || p.handle || "This creator"} on HaniLearn-QZ`}
              text={`Check out ${p.full_name || p.handle || "this profile"} on HaniLearn-QZ — quizzes, scores and milestones.`}
              label="Share profile"
            />
            {!data.is_self && (
              <div className="flex gap-2"><Button size="sm" variant={data.i_follow ? "outline" : "default"} onClick={() => follow.mutate()} disabled={follow.isPending}>
                {data.i_follow ? <><UserCheck className="h-4 w-4 mr-1" />Following</> : <><UserPlus className="h-4 w-4 mr-1" />Follow</>}
              </Button><Button asChild size="sm" variant="outline"><Link to="/messages/$userId" params={{ userId }}><MessageCircle className="mr-1 h-4 w-4"/>Message</Link></Button></div>
            )}
            </div>
          </CardContent>
        </Card>

        <div><h2 className="mb-3 flex items-center gap-2 font-semibold"><Award className="h-4 w-4"/>Achievements</h2><div className="flex flex-wrap gap-2">{(data.badges ?? []).filter((b: string | null): b is string => Boolean(b)).map((b: string) => <Badge key={b} variant={b.startsWith("Pro") ? "default" : "secondary"}>{b}</Badge>)}{!(data.badges ?? []).length && <span className="text-sm text-muted-foreground">Milestones will appear here.</span>}</div></div>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ListChecks className="h-4 w-4" />Published quizzes</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {data.quizzes.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No public quizzes yet.</div>}
              {data.quizzes.map((q: any) => (
                <Link key={q.id} to="/quiz/$quizId" params={{ quizId: q.id }} className="flex items-center gap-3 p-3 hover:bg-accent/40 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{q.title}</div>
                    <div className="text-xs text-muted-foreground flex gap-2 items-center">
                      <Badge variant="secondary">{q.category}</Badge>
                      <span className="capitalize">{q.difficulty}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
