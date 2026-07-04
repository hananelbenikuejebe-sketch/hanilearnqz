import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/monnify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const sig = request.headers.get("monnify-signature");
        const { verifyWebhookSignature } = await import("@/lib/monnify.server");
        if (!verifyWebhookSignature(raw, sig)) return new Response("bad signature", { status: 401 });

        let body: any;
        try { body = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

        const eventData = body?.eventData ?? body?.data ?? body;
        const paymentReference: string | undefined = eventData?.paymentReference;
        const paymentStatus: string = String(eventData?.paymentStatus ?? "").toUpperCase();
        const amountPaid = Number(eventData?.amountPaid ?? 0);
        const eventType = body?.eventType ?? "PAYMENT_NOTIFICATION";

        if (!paymentReference) return new Response("no ref", { status: 200 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;

        // Idempotency
        const { data: existing } = await db.from("monnify_webhook_events").select("id, processed").eq("transaction_reference", paymentReference).maybeSingle();
        if (existing?.processed) return new Response("ok", { status: 200 });
        if (!existing) {
          await db.from("monnify_webhook_events").insert({
            event_type: eventType, transaction_reference: paymentReference, payload: body,
          });
        }

        if (paymentStatus === "PAID") {
          const { data: intent } = await db.from("payment_intents").select("*").eq("payment_reference", paymentReference).maybeSingle();
          if (intent && intent.status !== "paid") {
            const { settleIntent } = await import("@/lib/payments.functions");
            try { await settleIntent(db, intent, Math.round(amountPaid * 100)); }
            catch (e) { console.error("settle failed", e); }
          }
        }
        await db.from("monnify_webhook_events").update({ processed: true }).eq("transaction_reference", paymentReference);
        return new Response("ok", { status: 200 });
      },
    },
  },
});
