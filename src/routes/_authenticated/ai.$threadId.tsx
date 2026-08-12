import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getAiThread } from "@/lib/ai-chat.functions";
import { AppShell } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { ArrowLeft, Bot } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ai/$threadId")({ component: AiThread });

function AiThread() {
  const { threadId } = Route.useParams();
  const fetchFn = useServerFn(getAiThread);
  const { data } = useQuery({ queryKey: ["ai-thread", threadId], queryFn: () => fetchFn({ data: { thread_id: threadId } }) });
  if (!data) return <AppShell><div className="p-8">Loading…</div></AppShell>;
  return <AppShell><ChatWindow key={threadId} threadId={threadId} initialMessages={data.messages as any[]} title={data.thread.title} mode={data.thread.mode} /></AppShell>;
}

function ChatWindow({ threadId, initialMessages, title, mode }: { threadId: string; initialMessages: any[]; title: string; mode: string }) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const transport = useMemo(() => new DefaultChatTransport({ api: `/api/ai/${threadId}`, headers: async () => {
    const { data } = await supabase.auth.getSession();
    const headers: Record<string, string> = {};
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
    return headers;
  } }), [threadId]);
  const { messages, sendMessage, status, stop } = useChat({ id: threadId, messages: initialMessages, transport, onError: (error) => toast.error(error.message) });
  useEffect(() => { if (status === "ready") textareaRef.current?.focus(); }, [status]);
  return <main className="mx-auto flex h-[calc(100dvh-3rem)] max-w-4xl flex-col pb-24 md:h-screen md:pb-0">
    <header className="flex items-center gap-3 border-b p-3"><Button asChild size="icon" variant="ghost"><Link to="/ai"><ArrowLeft className="h-4 w-4"/></Link></Button><div className="min-w-0"><h1 className="truncate font-semibold">{title}</h1><p className="text-xs text-muted-foreground">{mode === "creator" ? "Creator assistant" : "Guide & study assistant"}</p></div></header>
    <Conversation><ConversationContent>{messages.length === 0 && <ConversationEmptyState icon={<Bot className="h-9 w-9"/>} title="Ask Hani anything" description={mode === "creator" ? "Plan a quiz, repair questions, or decipher an error." : "Get help with HaniLearn or a school subject."}/>} {messages.map((message) => <Message from={message.role} key={message.id}><MessageContent>{message.parts.map((part: any, i: number) => part.type === "text" ? <MessageResponse key={i}>{part.text}</MessageResponse> : null)}</MessageContent></Message>)}{status === "submitted" && <Shimmer className="text-sm">Thinking...</Shimmer>}</ConversationContent><ConversationScrollButton/></Conversation>
    <div className="border-t p-3"><PromptInput onSubmit={async ({ text }) => { if (text.trim()) await sendMessage({ text: text.trim() }); }}><PromptInputTextarea ref={textareaRef} placeholder="Message Hani…"/><PromptInputFooter className="justify-end"><PromptInputSubmit status={status} onStop={stop} disabled={status !== "ready"}/></PromptInputFooter></PromptInput></div>
  </main>;
}