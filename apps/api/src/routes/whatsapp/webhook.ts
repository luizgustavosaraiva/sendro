import { handleConnectionUpdate, handleMessage } from "../../lib/whatsapp/sessions";

const normalizeEventType = (value: unknown) => String(value ?? "").trim().toLowerCase();

const getRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const getInstanceName = (body: Record<string, unknown>, data: Record<string, unknown>) =>
  String(body.instance ?? body.instanceName ?? data.instance ?? data.instanceName ?? "");

const asMessageArray = (data: Record<string, unknown>): Record<string, unknown>[] => {
  if (Array.isArray(data.messages)) {
    return data.messages.filter(
      (item): item is Record<string, unknown> => Boolean(item && typeof item === "object")
    );
  }

  if (Array.isArray(data.message)) {
    return data.message.filter(
      (item): item is Record<string, unknown> => Boolean(item && typeof item === "object")
    );
  }

  if (data.message && typeof data.message === "object") {
    return [data.message as Record<string, unknown>];
  }

  if (data.data && typeof data.data === "object") {
    return [data.data as Record<string, unknown>];
  }

  return [data];
};

const firstNonEmptyString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
};

const findFirstMeaningfulText = (value: unknown, depth = 0): string | undefined => {
  if (depth > 5 || value === null || value === undefined) return undefined;

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstMeaningfulText(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const priorityKeys = ["conversation", "text", "body", "caption", "content", "messageText"];

    for (const key of priorityKeys) {
      const found = findFirstMeaningfulText(record[key], depth + 1);
      if (found) return found;
    }

    for (const nestedKey of ["message", "Message", "data", "Data", "Info"]) {
      const found = findFirstMeaningfulText(record[nestedKey], depth + 1);
      if (found) return found;
    }
  }

  return undefined;
};

const isPlaceholderText = (value: string | undefined) => {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return ["n/a", "na", "null", "undefined", "none", "sem mensagem"].includes(normalized);
};

const normalizeContactJid = (primary: string, alternate: string) => {
  const base =
    (primary.endsWith("@lid") || primary.endsWith("@newsletter")) && alternate
      ? alternate
      : primary;

  if (!base) return "";

  const digits = base.replace(/\D/g, "");
  if (digits.length >= 10) {
    return `${digits}@s.whatsapp.net`;
  }

  return base;
};

const isFromMe = (
  first: Record<string, unknown>,
  key: Record<string, unknown>,
  info: Record<string, unknown>
) => Boolean(first.fromMe === true || key.fromMe === true || info.IsFromMe === true || info.isFromMe === true);

/**
 * Register the Evolution Go webhook handler on a Fastify instance.
 * No authentication — Evolution Go POSTs to a public URL.
 */
export function registerWhatsAppWebhook(app: import("fastify").FastifyInstance) {
  app.post("/webhooks/whatsapp", async (request, reply) => {
    const body = request.body as Record<string, unknown> | null | undefined;

    if (!body || typeof body !== "object") {
      reply.status(400).send({ error: "invalid_body" });
      return;
    }

    const data = getRecord(body.data);
    const eventTypeRaw = String(body.event ?? body.type ?? "");
    const eventType = normalizeEventType(eventTypeRaw);
    const instanceName = getInstanceName(body, data);

    app.log.info(
      { event: "webhook.whatsapp.received", instanceName, eventType: eventTypeRaw },
      "WhatsApp webhook received"
    );

    try {
      if (eventType === "connection.update" || eventType === "connectionupdate") {
        const state = String(data.state ?? data.status ?? "");
        const reason = typeof data.reason === "string" ? data.reason : undefined;
        await handleConnectionUpdate({ instanceName, state, reason });
      } else if (eventType === "messages.upsert" || eventType === "message") {
        const messages = asMessageArray(data);
        const first = getRecord(messages[0]);
        const key = getRecord(first.key);
        const message = getRecord(first.message);
        const imageMessage = getRecord(message.imageMessage);
        const extendedTextMessage = getRecord(message.extendedTextMessage);
        const textMessage = getRecord(message.textMessage);
        const info = getRecord(first.Info ?? data.Info);

        const rawFrom = firstNonEmptyString(
          key.remoteJid,
          first.remoteJid,
          first.from,
          data.remoteJid,
          data.from,
          info.Sender,
          info.Chat
        );

        const senderAlt = firstNonEmptyString(info.SenderAlt, data.senderAlt, first.senderAlt);
        const from = normalizeContactJid(rawFrom, senderAlt);

        const messageId = firstNonEmptyString(
          key.id,
          first.id,
          first.messageId,
          data.id,
          data.messageId,
          info.ID
        );

        const msgBody =
          firstNonEmptyString(
            message.conversation,
            extendedTextMessage.text,
            textMessage.text,
            first.body,
            data.body,
            getRecord(first.data).body,
            getRecord(data.data).body,
            getRecord(first.Message).body,
            getRecord(data.Message).body,
            getRecord(first.Message).conversation,
            getRecord(data.Message).conversation,
            getRecord(getRecord(first.Message).extendedTextMessage).text,
            getRecord(getRecord(data.Message).extendedTextMessage).text,
            getRecord(getRecord(first.message).extendedTextMessage).text,
            getRecord(getRecord(data.message).extendedTextMessage).text,
            info.Message,
            info.message
          ) ||
          findFirstMeaningfulText(first) ||
          findFirstMeaningfulText(data) ||
          undefined;

        const imageUrl =
          (imageMessage.url as string | undefined) ??
          (getRecord(first.image).url as string | undefined) ??
          (data.mediaUrl as string | undefined) ??
          undefined;

        if (isFromMe(first, key, info)) {
          app.log.info(
            { event: "webhook.whatsapp.message_ignored", instanceName, reason: "from_me", messageId },
            "Ignoring outgoing/self WhatsApp event"
          );
          reply.status(200).send({ ok: true, ignored: "from_me" });
          return;
        }

        if (!from) {
          app.log.warn(
            { event: "webhook.whatsapp.message_ignored", instanceName, reason: "missing_from" },
            "Ignoring WhatsApp message without sender"
          );
          reply.status(200).send({ ok: true, ignored: "missing_from" });
          return;
        }

        if (from.endsWith("@g.us")) {
          app.log.info(
            { event: "webhook.whatsapp.message_ignored", instanceName, from, reason: "group_message" },
            "Ignoring WhatsApp group message"
          );
          reply.status(200).send({ ok: true, ignored: "group_message" });
          return;
        }

        if (!imageUrl && isPlaceholderText(msgBody)) {
          app.log.info(
            {
              event: "webhook.whatsapp.message_ignored",
              instanceName,
              from,
              reason: "non_actionable_body",
              messageId,
              firstKeys: Object.keys(first),
              dataKeys: Object.keys(data)
            },
            "Ignoring WhatsApp message with empty/placeholder body"
          );
          reply.status(200).send({ ok: true, ignored: "non_actionable_body" });
          return;
        }

        await handleMessage({ instanceName, from, messageId, body: msgBody, imageUrl });
      } else {
        app.log.warn(
          { event: "webhook.whatsapp.unknown_type", instanceName, eventType: eventTypeRaw },
          "Unhandled WhatsApp webhook event type"
        );
      }
    } catch (err) {
      app.log.error(
        { event: "webhook.whatsapp.error", instanceName, eventType: eventTypeRaw, err },
        "WhatsApp webhook processing error"
      );
      reply.status(500).send({ error: "processing_failed" });
      return;
    }

    reply.status(200).send({ ok: true });
  });
}
