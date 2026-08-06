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
    if (!q) {
      return {
        meta: [
          { title: "Quiz not found — HaniLearn" },
          { name: "description", content: "This quiz is unavailable or was removed on HaniLearn, the online quiz and CBT platform." },
          { property: "og:type", content: "website" },
          { name: "twitter:card", content: "summary" },
        ],
      };
    }
    const title = `${q.title} — HaniLearn Quiz`.slice(0, 59);
    const desc = (q.description ?? `Take "${q.title}" on HaniLearn — ${q.question_count} questions, ${q.duration_min} min, ${q.difficulty} difficulty.`).slice(0, 159);
    const img: string | undefined = q.banner_url ?? q.share_image_url;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        ...(img ? [{ property: "og:image", content: img }, { name: "twitter:image", content: img }] : []),
        { name: "twitter:card", content: img ? "summary_large_image" : "summary" },
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
  const creatorName = q.creator?.full_name || q.creator?.handle || "a HaniLearn creator";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Quiz",
    name: q.title,
    description: q.description ?? undefined,
    educationalLevel: q.difficulty,
    about: q.category ?? q.subject ?? undefined,
    numberOfQuestions: q.question_count,
    timeRequired: q.duration_min ? `PT${q.duration_min}M` : undefined,
    url: q.share_url,
    ...(img ? { image: img } : {}),
    author: { "@type": "Person", name: creatorName },
    publisher: { "@type": "Organization", name: "HaniLearn" },
  };
  return (
    <main className="min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="container mx-auto max-w-3xl px-3 py-6">
        <div className="overflow-hidden rounded-lg border bg-card shadow-technical">
          {img && <img src={img} alt={q.title} className="w-full h-56 object-cover" />}
          <div className="p-5 space-y-3">
            <h1 className="text-2xl font-bold">{q.title}</h1>
            {q.description && <p className="text-sm text-muted-foreground">{q.description}</p>}
            <div className="text-xs text-muted-foreground">{q.category} · {q.difficulty} · {q.question_count} questions · {q.duration_min} min</div>
            <p className="text-xs text-muted-foreground">Created by {creatorName} on HaniLearn</p>
            <Button asChild size="lg"><Link to="/quiz/$quizId" params={{ quizId }}><Play className="h-4 w-4" />Take this quiz</Link></Button>
            <p className="text-xs text-muted-foreground">Try out this quiz @ HaniLearn</p>
          </div>
        </div>
      </div>
    </main>
  );
}
