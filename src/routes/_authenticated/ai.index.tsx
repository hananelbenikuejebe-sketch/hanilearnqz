import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createAiThread, listAiThreads } from "@/lib/ai-chat.functions";
import { AppShell } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Bot, GraduationCap, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ai/")({ component: AiHome });

function AiHome() {
  const navigate = useNavigate();
  const listFn = useServerFn(listAiThreads);
  const createFn = useServerFn(createAiThread);
  const { data } = useQuery({ queryKey: ["ai-threads"], queryFn: () => listFn() });
  const create = useMutation({ mutationFn: (mode: "guide" | "creator") => createFn({ data: { mode } }), onSuccess: (thread) => navigate({ to: "/ai/$threadId", params: { threadId: thread.id } }) });
  return <AppShell><main className="mx-auto max-w-3xl space-y-5 p-4 pb-24 md:p-8">
    <div><h1 className="text-3xl font-bold">Hani AI</h1><p className="text-muted-foreground">Your app guide, study assistant, and creator copilot.</p></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <Button className="h-auto justify-start gap-3 p-4" onClick={() => create.mutate("guide")}><Bot className="h-5 w-5"/><span className="text-left"><b className="block">New guide chat</b><small>App help and education</small></span></Button>
      <Button className="h-auto justify-start gap-3 p-4" variant="secondary" onClick={() => create.mutate("creator")}><GraduationCap className="h-5 w-5"/><span className="text-left"><b className="block">Creator assistant</b><small>Plan and improve quizzes</small></span></Button>
    </div>
    <div className="space-y-2"><h2 className="font-semibold">History</h2>{(data ?? []).map((thread: any) => <Card key={thread.id}><CardContent className="flex items-center gap-3 p-3"><Button variant="ghost" className="min-w-0 flex-1 justify-start" onClick={() => navigate({ to: "/ai/$threadId", params: { threadId: thread.id } })}><span className="truncate">{thread.title}</span></Button><span className="text-xs text-muted-foreground">{thread.mode}</span></CardContent></Card>)}{!(data ?? []).length && <p className="text-sm text-muted-foreground">No conversations yet.</p>}</div>
  </main></AppShell>;
}