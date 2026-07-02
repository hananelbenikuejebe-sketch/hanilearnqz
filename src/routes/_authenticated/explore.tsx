import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { listPublishedQuizzes } from "@/lib/quizzes.functions";
import { getMyCreatorStatus } from "@/lib/creators.functions";
import { AppShell } from "@/components/app-nav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Search, Clock, FileQuestion, Play, Heart, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/_authenticated/explore")({
  head: () => ({ meta: [
    { title: "Explore quizzes — HaniLearn-QZ" },
    { name: "description", content: "Browse, search and take community quizzes across every subject." },
  ] }),
  component: Explore,
});

function Explore() {
  const fetchQuizzes = useServerFn(listPublishedQuizzes);
  const fetchStatus = useServerFn(getMyCreatorStatus);
  const { data: quizzes, isLoading } = useQuery({ queryKey: ["published-quizzes"], queryFn: () => fetchQuizzes() });
  const { data: status } = useQuery({ queryKey: ["creator-status"], queryFn: () => fetchStatus() });
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("recent");
  const [cat, setCat] = useState("all");

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
    if (sort === "popular") list.sort((a: any, b: any) => (b.social_counts?.likes ?? 0) - (a.social_counts?.likes ?? 0));
    if (sort === "shortest") list.sort((a: any, b: any) => a.duration_min - b.duration_min);
    if (sort === "longest") list.sort((a: any, b: any) => b.duration_min - a.duration_min);
    return list;
  }, [quizzes, q, sort, cat]);

  return (
    <AppShell isSuperAdmin={status?.is_super_admin}>
      <div className="max-w-6xl mx-auto p-4 md:p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Explore</h1>
          <p className="text-muted-foreground">Discover quizzes made by the community.</p>
        </div>
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
        {isLoading && <p className="text-muted-foreground">Loading…</p>}
        {!isLoading && filtered.length === 0 && (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No quizzes match your filters.</CardContent></Card>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((quiz: any) => (
            <Card key={quiz.id} className="group hover:shadow-lg hover:-translate-y-0.5 transition overflow-hidden">
              {quiz.banner_url && (
                <div className="h-32 bg-muted overflow-hidden">
                  <img src={quiz.banner_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition" />
                </div>
              )}
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="secondary" className="text-[10px]">{quiz.category}</Badge>
                  <Badge className="text-[10px]">{quiz.difficulty}</Badge>
                </div>
                <CardTitle className="mt-2 text-base line-clamp-1">{quiz.title}</CardTitle>
                {quiz.description && <CardDescription className="line-clamp-2 text-xs">{quiz.description}</CardDescription>}
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                  <span className="flex items-center gap-1"><FileQuestion className="h-3.5 w-3.5" />{quiz.question_count}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{quiz.duration_min}m</span>
                  <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{quiz.social_counts?.likes ?? 0}</span>
                  <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{quiz.social_counts?.comments ?? 0}</span>
                </div>
                <Button asChild className="w-full" size="sm">
                  <Link to="/quiz/$quizId" params={{ quizId: quiz.id }}><Play className="h-3.5 w-3.5 mr-1" />Start</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
