import { handleConnectionUpdate, handleMessage } from "../../lib/whatsapp/sessions";

/**
 * Register the Evolution Go webhook handler on a Fastify instance.
 * No authentication — Evolution Go POSTs to a public URL.
 *
 * Observability: every incoming event is logged at info level with
 * instanceName + eventType. Unknown events are logged at warn level.
 */
export function registerWhatsAppWebhook(app: import("fastify").FastifyInstance) {
  app.post("/webhooks/whatsapp", async (request, reply) => {
    const body = request.body as Record<string, unknown> | null | undefined;

    if (!body || typeof body !== "object") {
      reply.status(400).send({ error: "invalid_body" });
      return;
    }

    const eventType = (body.event as string | undefined) ?? "";
    const instanceName = (body.instance as string | undefined) ?? "";

    app.log.info(
      { event: "webhook.whatsapp.received", instanceName, eventType },
      "WhatsApp webhook received"
    );

    try {
      if (eventType === "connection.update") {
        const data = (body.data ?? {}) as Record<string, unknown>;
        const state = (data.state as string | undefined) ?? "";
        const reason = data.reason as string | undefined;
        await handleConnectionUpdate({ instanceName, state, reason });
      } else if (eventType === "messages.upsert") {
        const data = (body.data ?? {}) as Record<string, unknown>;
        const messages = Array.isArray(data.messages) ? data.messages : [];
        const first = (messages[0] ?? {}) as Record<string, unknown>;
        const key = (first.key ?? {}) as Record<string, unknown>;
        const from = (key.remoteJid as string | undefined) ?? "";
        const messageId = (key.id as string | undefined) ?? "";
        const message = (first.message ?? {}) as Record<string, unknown>;
        const imageMessage = (message.imageMessage ?? {}) as Record<string, unknown>;
        const msgBody =
          (message.conversation as string | undefined) ??
          (imageMessage.url as string | undefined);
        await handleMessage({ instanceName, from, messageId, body: msgBody, imageUrl: imageMessage.url as string | undefined });
      } else {
        app.log.warn(
          { event: "webhook.whatsapp.unknown_type", instanceName, eventType },
          "Unhandled WhatsApp webhook event type"
        );
      }
    } catch (err) {
      app.log.error(
        { event: "webhook.whatsapp.error", instanceName, eventType, err },
        "WhatsApp webhook processing error"
      );
      reply.status(500).send({ error: "processing_failed" });
      return;
    }

    reply.status(200).send({ ok: true });
  });
}
