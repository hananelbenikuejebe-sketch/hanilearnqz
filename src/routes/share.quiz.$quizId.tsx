import { createFileRoute, Link } from "@tanstack/react-router";
import { getQuizSharePreview } from "@/lib/quizzes.functions";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";

export const Route = createFileRoute("/share/quiz/$quizId")({
  loader: async ({ params }) => {
    try {
      return await getQuizSharePreview({ data: { id: params.quizId } });
    } catch {
      return null;
    }
  },
  head: ({ loaderData }) => {
    const q: any = loaderData;
    if (!q) return { meta: [{ title: "Quiz — HaniLearn-QZ" }] };
    const title = `${q.title} — HaniLearn-QZ`;
    const desc = q.description ?? `Try this quiz on HaniLearn-QZ — ${q.question_count} questions, ${q.duration_min} min.`;
    const img = q.banner_url ?? q.share_image_url;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        ...(img ? [{ property: "og:image", content: img }, { name: "twitter:image", content: img }] : []),
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
      ],
    };
  },
  component: SharePage,
});

function SharePage() {
  const q: any = Route.useLoaderData();
  const { quizId } = Route.useParams();
  if (!q) return <div className="min-h-screen grid place-items-center p-4 text-sm text-muted-foreground">Quiz unavailable.</div>;
  const img = q.banner_url ?? q.share_image_url;
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto max-w-3xl px-3 py-6">
        <div className="overflow-hidden rounded-lg border bg-card shadow-technical">
          {img && <img src={img} alt={q.title} className="w-full h-56 object-cover" />}
          <div className="p-5 space-y-3">
            <h1 className="text-2xl font-bold">{q.title}</h1>
            {q.description && <p className="text-sm text-muted-foreground">{q.description}</p>}
            <div className="text-xs text-muted-foreground">{q.category} · {q.difficulty} · {q.question_count} questions · {q.duration_min} min</div>
            <Button asChild size="lg"><Link to="/quiz/$quizId" params={{ quizId }}><Play className="h-4 w-4" />Take this quiz</Link></Button>
            <p className="text-xs text-muted-foreground">Try out this quiz @ HaniLearn-QZ</p>
          </div>
        </div>
      </div>
    </main>
  );
}
