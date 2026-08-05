import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { listPublishedQuizzes } from "@/lib/quizzes.functions";
import { getMyCreatorStatus } from "@/lib/creators.functions";
import { searchProfiles, getFollowingIds } from "@/lib/profiles.functions";
import { AppShell } from "@/components/app-nav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Search, Clock, FileQuestion, Play, Heart, MessageSquare, Grid2X2, List, Rows3, Users, Trophy } from "lucide-react";
import { quizBannerStyle } from "@/lib/banner-color";

export const Route = createFileRoute("/_authenticated/explore")({
  head: () => ({ meta: [
    { title: "Explore quizzes — HaniLearn-QZ" },
    { name: "description", content: "Browse, search and take community quizzes across every subject." },
    { property: "og:title", content: "Explore quizzes — HaniLearn-QZ" },
    { property: "og:description", content: "Browse, search and take community quizzes across every subject." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Explore,
});

function Explore() {
  const fetchQuizzes = useServerFn(listPublishedQuizzes);
  const fetchStatus = useServerFn(getMyCreatorStatus);
  const searchPeople = useServerFn(searchProfiles);
  const followingFn = useServerFn(getFollowingIds);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("recent");
  const [cat, setCat] = useState("all");
  const [feed, setFeed] = useState<"all" | "following">("all");
  const [view, setView] = useState<"grid" | "list" | "compact">("grid");
  const { data: quizzes, isLoading } = useQuery({ queryKey: ["published-quizzes"], queryFn: () => fetchQuizzes() });
  const { data: status } = useQuery({ queryKey: ["creator-status"], queryFn: () => fetchStatus() });
  const { data: followingIds } = useQuery({ queryKey: ["following-ids"], queryFn: () => followingFn() });
  const { data: people } = useQuery({ queryKey: ["profile-search", q], queryFn: () => searchPeople({ data: { q } }), enabled: q.trim().length > 1 });

  const cats = useMemo(() => {
    const s = new Set<string>();
    (quizzes ?? []).forEach((x: any) => x.category && s.add(x.category));
    return ["all", ...Array.from(s)];
  }, [quizzes]);

  const filtered = useMemo(() => {
    let list = [...(quizzes ?? [])];
    if (q.trim()) {
      const needle = q.toLowerCase();
      list = list.filter((x: any) =>
        (x.title || "").toLowerCase().includes(needle) ||
        (x.description || "").toLowerCase().includes(needle) ||
        (x.subject || "").toLowerCase().includes(needle) ||
        (x.category || "").toLowerCase().includes(needle),
      );
    }
    if (cat !== "all") list = list.filter((x: any) => x.category === cat);
    if (feed === "following") list = list.filter((x: any) => (followingIds ?? []).includes(x.created_by));
    if (sort === "popular") list.sort((a: any, b: any) => (b.social_counts?.likes ?? 0) - (a.social_counts?.likes ?? 0));
    if (sort === "shortest") list.sort((a: any, b: any) => a.duration_min - b.duration_min);
    if (sort === "longest") list.sort((a: any, b: any) => b.duration_min - a.duration_min);
    return list;
  }, [quizzes, q, sort, cat, feed, followingIds]);

  return (
    <AppShell isSuperAdmin={status?.is_super_admin}>
      <div className="max-w-6xl mx-auto p-4 md:p-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div><h1 className="text-3xl font-bold tracking-tight">Explore</h1><p className="text-muted-foreground">Discover quizzes and people in the community.</p></div>
          <div className="flex rounded-md border p-1"><Button size="icon" variant={view === "grid" ? "secondary" : "ghost"} onClick={() => setView("grid")} title="Grid"><Grid2X2 className="h-4 w-4"/></Button><Button size="icon" variant={view === "list" ? "secondary" : "ghost"} onClick={() => setView("list")} title="List"><List className="h-4 w-4"/></Button><Button size="icon" variant={view === "compact" ? "secondary" : "ghost"} onClick={() => setView("compact")} title="Compact"><Rows3 className="h-4 w-4"/></Button></div>
        </div>
        <div className="mb-4 flex gap-2"><Button size="sm" variant={feed === "all" ? "default" : "outline"} onClick={() => setFeed("all")}>All quizzes</Button><Button size="sm" variant={feed === "following" ? "default" : "outline"} onClick={() => setFeed("following")}>Following</Button><Button asChild size="sm" variant="ghost"><Link to="/messages"><MessageSquare className="mr-1 h-4 w-4"/>Messages</Link></Button></div>
        <div className="flex flex-col md:flex-row gap-2 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by title, subject, category…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="md:w-44"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>{cats.map((c) => <SelectItem key={c} value={c}>{c === "all" ? "All categories" : c}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="md:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Recent</SelectItem>
              <SelectItem value="popular">Most liked</SelectItem>
              <SelectItem value="shortest">Shortest</SelectItem>
              <SelectItem value="longest">Longest</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {q.trim().length > 1 && (people ?? []).length > 0 && <div className="mb-6"><div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4"/>People</div><div className="flex gap-2 overflow-x-auto pb-2">{(people ?? []).map((p: any) => <Button key={p.id} asChild variant="outline" className="h-auto shrink-0 justify-start px-3 py-2"><Link to="/profile/$userId" params={{ userId: p.id }}><span className="grid h-8 w-8 place-items-center rounded-full bg-muted">{(p.full_name || p.handle || "?").slice(0,1).toUpperCase()}</span><span className="ml-2 text-left"><span className="block text-sm">{p.full_name || p.handle}</span>{p.handle && <span className="block text-xs text-muted-foreground">@{p.handle}</span>}</span></Link></Button>)}</div></div>}
        {isLoading && <p className="text-muted-foreground">Loading…</p>}
        {!isLoading && filtered.length === 0 && (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No quizzes match your filters.</CardContent></Card>
        )}
        <div className={view === "grid" ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3" : "space-y-2"}>
          {filtered.map((quiz: any) => (
            <Card key={quiz.id} className={`group transition overflow-hidden ${view === "grid" ? "hover:shadow-lg hover:-translate-y-0.5" : "flex"}`}>
              {view !== "compact" && (
                <div className={view === "grid" ? "h-32 bg-muted overflow-hidden relative" : "w-36 shrink-0 bg-muted overflow-hidden relative"}>
                  {quiz.banner_url ? (
                    <img src={quiz.banner_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition" />
                  ) : (
                    <div className="w-full h-full grid place-items-center" style={quizBannerStyle(quiz.id, quiz.banner_color).style}>
                      <span className="text-3xl font-bold text-primary-foreground/90">{(quiz.title || "?").slice(0, 1).toUpperCase()}</span>
                    </div>
                  )}
                </div>
              )}
              <div className="min-w-0 flex-1"><CardHeader className={view === "compact" ? "p-3 pb-1" : "pb-3"}>
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="secondary" className="text-[10px]">{quiz.category}</Badge>
                  <Badge className="text-[10px]">{quiz.difficulty}</Badge>
                </div>
                <CardTitle className="mt-2 text-base line-clamp-1">{quiz.title}</CardTitle>
                {quiz.creator && <Link to="/profile/$userId" params={{ userId: quiz.created_by }} className="text-xs text-muted-foreground hover:text-primary">by {quiz.creator.full_name || `@${quiz.creator.handle}`}</Link>}
                {quiz.description && <CardDescription className="line-clamp-2 text-xs">{quiz.description}</CardDescription>}
              </CardHeader>
              <CardContent className={view === "compact" ? "px-3 pb-3 pt-0" : "pt-0"}>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-3">
                  <span className="flex items-center gap-1"><FileQuestion className="h-3.5 w-3.5" />{quiz.question_count}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{quiz.duration_min}m</span>
                  <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{quiz.social_counts?.likes ?? 0}</span>
                  <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{quiz.social_counts?.comments ?? 0}</span>
                  {quiz.total_marks > 0 && <span className="flex items-center gap-1">{quiz.total_marks} marks</span>}
                  {quiz.prize_pool_kobo > 0 && (
                    <Badge className="gap-1 bg-amber-500 text-black hover:bg-amber-600 text-[10px]"><Trophy className="h-3 w-3" />₦{(quiz.prize_pool_kobo / 100).toLocaleString()}</Badge>
                  )}
                </div>
                <Button asChild className={view === "grid" ? "w-full" : "w-fit"} size="sm">
                  <Link to="/quiz/$quizId" params={{ quizId: quiz.id }}><Play className="h-3.5 w-3.5 mr-1" />Start</Link>
                </Button>
              </CardContent></div>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
