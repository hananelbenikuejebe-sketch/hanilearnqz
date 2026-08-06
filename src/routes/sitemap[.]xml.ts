import { createFileRoute } from "@tanstack/react-router";

const BASE_URL = "https://hanilearnqz.lovable.app";

// Static, publicly indexable, non-authenticated pages.
const STATIC_PATHS = ["/", "/auth"];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const urls: string[] = STATIC_PATHS.map((p) => `${BASE_URL}${p}`);

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: quizzes } = await (supabaseAdmin as any)
            .from("quizzes")
            .select("id")
            .eq("is_published", true)
            .eq("visibility", "public");
          (quizzes ?? []).forEach((q: { id: string }) => {
            urls.push(`${BASE_URL}/share/quiz/${q.id}`);
          });
        } catch {
          // If Supabase is unavailable, still serve the static sitemap.
        }

        const body =
          `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n") +
          `\n</urlset>\n`;

        return new Response(body, {
          headers: { "Content-Type": "application/xml" },
        });
      },
    },
  },
});
