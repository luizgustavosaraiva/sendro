import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { assertDb, conversationStates, users, whatsappContactMappings } from "@repo/db";
import { createDelivery } from "../dispatch";
import { env } from "../../env";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DeliveryFields = {
  pickupAddress?: string;
  dropoffAddress?: string;
  externalReference?: string;
};

export interface LLMExtractor {
  extract(
    messages: string[],
    existingFields: Partial<DeliveryFields>
  ): Promise<{ fields: Partial<DeliveryFields>; nextMessage: string }>;
}

type DrizzleDB = ReturnType<typeof assertDb>["db"];

// ─── Zod schema for structured output ────────────────────────────────────────

const DeliveryFieldsSchema = z.object({
  pickupAddress: z.string().optional(),
  dropoffAddress: z.string().optional(),
  externalReference: z.string().optional()
});

// ─── Real OpenAI extractor ────────────────────────────────────────────────────

class OpenAIExtractor implements LLMExtractor {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async extract(
    messages: string[],
    existingFields: Partial<DeliveryFields>
  ): Promise<{ fields: Partial<DeliveryFields>; nextMessage: string }> {
    const { default: OpenAI } = await import("openai");
    const { zodResponseFormat } = await import("openai/helpers/zod");

    const client = new OpenAI({ apiKey: this.apiKey });

    const systemPrompt =
      "Você é um assistente de logística. Extraia os campos de entrega da conversa do usuário: endereço de coleta, endereço de entrega, e referência externa (opcional). Responda em JSON estruturado.";

    const userContent = messages.join("\n");

    const ExtractionSchema = z.object({
      pickupAddress: z.string().optional(),
      dropoffAddress: z.string().optional(),
      externalReference: z.string().optional(),
      nextMessage: z.string()
    });

    const response = await client.chat.completions.parse({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Contexto atual: ${JSON.stringify(existingFields)}\n\nMensagem: ${userContent}`
        }
      ],
      response_format: zodResponseFormat(ExtractionSchema, "delivery_extraction")
    });

    const parsed = response.choices[0]?.message?.parsed;
    if (!parsed) {
      return {
        fields: existingFields,
        nextMessage: "Desculpe, não consegui processar. Por favor, informe o endereço de coleta."
      };
    }

    const fields: Partial<DeliveryFields> = {
      ...(parsed.pickupAddress ? { pickupAddress: parsed.pickupAddress } : {}),
      ...(parsed.dropoffAddress ? { dropoffAddress: parsed.dropoffAddress } : {}),
      ...(parsed.externalReference ? { externalReference: parsed.externalReference } : {})
    };

    return { fields, nextMessage: parsed.nextMessage };
  }
}

// ─── Stub extractor (no API key) ─────────────────────────────────────────────

class StubExtractor implements LLMExtractor {
  async extract(
    _messages: string[],
    _existingFields: Partial<DeliveryFields>
  ): Promise<{ fields: Partial<DeliveryFields>; nextMessage: string }> {
    return {
      fields: {},
      nextMessage: "Por favor, informe o endereço de coleta."
    };
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _llmExtractor: LLMExtractor | null = null;

export function getLLMExtractor(): LLMExtractor {
  if (!_llmExtractor) {
    if (env.OPENAI_API_KEY) {
      _llmExtractor = new OpenAIExtractor(env.OPENAI_API_KEY);
    } else {
      _llmExtractor = new StubExtractor();
    }
  }
  return _llmExtractor;
}

export function setLLMExtractor(extractor: LLMExtractor): void {
  _llmExtractor = extractor;
}

// ─── Retailer resolution ──────────────────────────────────────────────────────

export async function resolveRetailerFromJid(
  db: DrizzleDB,
  companyId: string,
  contactJid: string
): Promise<{ userId: string; role: "retailer" } | null> {
  const rows = await db
    .select({ userId: whatsappContactMappings.userId })
    .from(whatsappContactMappings)
    .innerJoin(users, eq(users.id, whatsappContactMappings.userId))
    .where(
      and(
        eq(whatsappContactMappings.companyId, companyId),
        eq(whatsappContactMappings.contactJid, contactJid)
      )
    )
    .limit(1);

  if (rows.length === 0) return null;
  return { userId: rows[0].userId, role: "retailer" };
}

// ─── Conversation state helpers ───────────────────────────────────────────────

type ConversationStateRow = typeof conversationStates.$inferSelect;

export async function getOrCreateConversationState(
  db: DrizzleDB,
  companyId: string,
  contactJid: string
): Promise<ConversationStateRow> {
  const existing = await db
    .select()
    .from(conversationStates)
    .where(
      and(
        eq(conversationStates.companyId, companyId),
        eq(conversationStates.contactJid, contactJid)
      )
    )
    .limit(1);

  if (existing.length > 0) return existing[0];

  const [created] = await db
    .insert(conversationStates)
    .values({ companyId, contactJid, phase: "idle" })
    .returning();

  return created;
}

export async function updateConversationState(
  db: DrizzleDB,
  id: string,
  patch: {
    phase?: string;
    collectedFields?: Partial<DeliveryFields>;
    lastProcessedMessageId?: string | null;
  }
): Promise<void> {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.phase !== undefined) updates.phase = patch.phase;
  if (patch.collectedFields !== undefined) updates.collectedFields = patch.collectedFields;
  if (patch.lastProcessedMessageId !== undefined)
    updates.lastProcessedMessageId = patch.lastProcessedMessageId;

  await db
    .update(conversationStates)
    .set(updates)
    .where(eq(conversationStates.id, id));
}

// ─── Field validation ─────────────────────────────────────────────────────────

function hasRequiredFields(fields: Partial<DeliveryFields>): fields is Required<Pick<DeliveryFields, "pickupAddress" | "dropoffAddress">> & Partial<DeliveryFields> {
  return Boolean(fields.pickupAddress && fields.dropoffAddress);
}

function buildSummaryMessage(fields: Partial<DeliveryFields>): string {
  const lines = ["📦 *Resumo do pedido:*"];
  if (fields.pickupAddress) lines.push(`🔵 Coleta: ${fields.pickupAddress}`);
  if (fields.dropoffAddress) lines.push(`🔴 Entrega: ${fields.dropoffAddress}`);
  if (fields.externalReference) lines.push(`🔖 Referência: ${fields.externalReference}`);
  lines.push("\nResponda *sim* para confirmar ou *não* para cancelar.");
  return lines.join("\n");
}

// ─── Main intake processor ────────────────────────────────────────────────────

export async function processIntakeMessage(params: {
  db: DrizzleDB;
  companyId: string;
  contactJid: string;
  messageId: string;
  messageText: string;
  sendReply: (text: string) => Promise<void>;
}): Promise<void> {
  const { db, companyId, contactJid, messageId, messageText, sendReply } = params;

  // Load conversation state
  const state = await getOrCreateConversationState(db, companyId, contactJid);

  // Idempotency: skip if already processed
  if (state.lastProcessedMessageId === messageId) {
    console.info(`[intake] skipping duplicate messageId=${messageId} companyId=${companyId}`);
    return;
  }

  // Resolve retailer identity
  const retailer = await resolveRetailerFromJid(db, companyId, contactJid);
  if (!retailer) {
    await sendReply("Número não autorizado. Contate o suporte.");
    await updateConversationState(db, state.id, { lastProcessedMessageId: messageId });
    return;
  }

  const existingFields = (state.collectedFields ?? {}) as Partial<DeliveryFields>;

  if (state.phase === "idle" || state.phase === "collecting") {
    // Extract fields via LLM
    const extractor = getLLMExtractor();
    const { fields: extracted, nextMessage } = await extractor.extract(
      [messageText],
      existingFields
    );

    const mergedFields: Partial<DeliveryFields> = { ...existingFields, ...extracted };

    if (hasRequiredFields(mergedFields)) {
      // All required fields present → move to confirming
      await updateConversationState(db, state.id, {
        phase: "confirming",
        collectedFields: mergedFields,
        lastProcessedMessageId: messageId
      });
      await sendReply(buildSummaryMessage(mergedFields));
    } else {
      // Still collecting
      await updateConversationState(db, state.id, {
        phase: "collecting",
        collectedFields: mergedFields,
        lastProcessedMessageId: messageId
      });
      await sendReply(nextMessage);
    }
  } else if (state.phase === "confirming") {
    const text = messageText.trim();

    if (/^(s[ií]m?|confirm)/i.test(text)) {
      // Create delivery
      const fields = existingFields as Required<Pick<DeliveryFields, "pickupAddress" | "dropoffAddress">> & Partial<DeliveryFields>;
      try {
        const delivery = await createDelivery({
          user: { id: retailer.userId, role: "retailer" },
          data: {
            companyId,
            pickupAddress: fields.pickupAddress,
            dropoffAddress: fields.dropoffAddress,
            externalReference: fields.externalReference ?? null
          }
        });
        await updateConversationState(db, state.id, {
          phase: "idle",
          collectedFields: {},
          lastProcessedMessageId: messageId
        });
        await sendReply(`✅ Entrega criada com sucesso! ID: ${delivery.deliveryId}`);
      } catch (err) {
        console.error(`[intake] createDelivery error companyId=${companyId}`, err);
        await updateConversationState(db, state.id, { lastProcessedMessageId: messageId });
        await sendReply("Erro ao criar entrega. Por favor, tente novamente.");
      }
    } else if (/^(n[aã]o?|cancel)/i.test(text)) {
      await updateConversationState(db, state.id, {
        phase: "idle",
        collectedFields: {},
        lastProcessedMessageId: messageId
      });
      await sendReply("Pedido cancelado.");
    } else {
      // Resend summary
      await updateConversationState(db, state.id, { lastProcessedMessageId: messageId });
      await sendReply(buildSummaryMessage(existingFields));
    }
  } else {
    // Unknown phase — reset
    await updateConversationState(db, state.id, {
      phase: "idle",
      collectedFields: {},
      lastProcessedMessageId: messageId
    });
  }
}
