import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron-only endpoint: batches every active user through the AI notification
 * engine and sends at most one AI notification per user per day. Scheduled by
 * pg_cron + pg_net (see the notification-engine migration) to run
 * automatically with no manual trigger. The scheduler authenticates with the
 * backend publishable key in the standard `apikey` header.
 */
export const Route = createFileRoute("/api/public/cron/daily-notify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = request.headers.get("x-cron-secret");
        const expected = process.env["CRON_SECRET"];
        if (!expected || key !== expected) {
          return new Response("unauthorized", { status: 401 });
        }
        try {
          const { runDailyAiNotifyBatch } = await import("@/lib/ai-notify.server");
          const result = await runDailyAiNotifyBatch();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          console.error("[cron/daily-notify] failed", e);
          return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
