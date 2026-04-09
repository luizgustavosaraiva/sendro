import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { assertDb, conversationStates, retailerAddresses, retailers, users, whatsappContactMappings } from "@repo/db";
import { createDelivery } from "../dispatch";
import { env } from "../../env";
import {
  appendConversationTurn,
  computeOperationalStaleAt,
  getOrCreateConversationState,
  listRecentConversationTurns,
  markConversationStaleIfNeeded,
  updateConversationState
} from "./conversation-memory";
import { getConversationInterpreter, resetConversationInterpreter, setConversationInterpreter } from "./conversation-interpreter";
import { buildBlockedRetailerMessage, decideRetailerConversationAction } from "./conversation-engine";
import { resolveWhatsAppContact } from "./contact-resolver";

export type DeliveryFields = {
  pickupAddress?: string;
  dropoffAddress?: string;
  externalReference?: string;
};

export interface LLMExtractor {
  extract(messages: string[], existingFields: Partial<DeliveryFields>): Promise<{ fields: Partial<DeliveryFields>; nextMessage: string }>;
}

type DrizzleDB = ReturnType<typeof assertDb>["db"];

const normalizeFieldValue = (value: unknown) => {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  const normalized = text.toLowerCase();
  if (["n/a", "na", "null", "undefined", "none"].includes(normalized)) return undefined;
  return text;
};

const nullableString = z.preprocess(normalizeFieldValue, z.string().optional());

const DeliveryFieldsSchema = z.object({
  pickupAddress: nullableString,
  dropoffAddress: nullableString,
  externalReference: nullableString
});

class OpenAICompatExtractor implements LLMExtractor {
  private apiKey: string;
  private baseURL: string | undefined;
  private model: string;

  constructor(opts: { apiKey: string; baseURL?: string; model?: string }) {
    this.apiKey = opts.apiKey;
    this.baseURL = opts.baseURL;
    this.model = opts.model ?? "gpt-4o-mini";
  }

  async extract(messages: string[], existingFields: Partial<DeliveryFields>): Promise<{ fields: Partial<DeliveryFields>; nextMessage: string }> {
    const { default: OpenAI } = await import("openai");

    const client = new OpenAI({
      apiKey: this.apiKey,
      ...(this.baseURL ? { baseURL: this.baseURL } : {})
    });

    const systemPrompt =
      "Você é um assistente de logística. Extraia os campos de entrega da conversa do usuário: endereço de coleta, endereço de entrega, e referência externa (opcional). " +
      "Responda APENAS com JSON válido no formato: " +
      '{"pickupAddress":"...","dropoffAddress":"...","externalReference":"...","nextMessage":"..."}. ' +
      "Os campos pickupAddress, dropoffAddress e externalReference são opcionais. nextMessage é obrigatório.";

    const userContent = messages.join("\n");

    const ExtractionSchema = z.object({
      pickupAddress: nullableString,
      dropoffAddress: nullableString,
      externalReference: nullableString,
      nextMessage: z.string()
    });

    let parsed: z.infer<typeof ExtractionSchema> | null = null;

    if (this.baseURL) {
      const response = await client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Contexto atual: ${JSON.stringify(existingFields)}\n\nMensagem: ${userContent}` }
        ],
        response_format: { type: "json_object" }
      });

      const raw = response.choices[0]?.message?.content ?? "{}";
      try {
        parsed = ExtractionSchema.parse(JSON.parse(raw));
      } catch {
        console.warn("[LLM] Failed to parse JSON response from local model:", raw);
      }
    } else {
      const { zodResponseFormat } = await import("openai/helpers/zod");
      const response = await (client.chat.completions as any).parse({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Contexto atual: ${JSON.stringify(existingFields)}\n\nMensagem: ${userContent}` }
        ],
        response_format: zodResponseFormat(ExtractionSchema, "delivery_extraction")
      });
      parsed = response.choices[0]?.message?.parsed ?? null;
    }

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

class StubExtractor implements LLMExtractor {
  async extract(messages: string[], existingFields: Partial<DeliveryFields>): Promise<{ fields: Partial<DeliveryFields>; nextMessage: string }> {
    const latest = String(messages.at(-1) ?? "").trim();
    if (!latest) {
      return {
        fields: {},
        nextMessage: existingFields.pickupAddress
          ? "Perfeito. Agora informe o endereço de entrega."
          : "Por favor, informe o endereço de coleta."
      };
    }

    if (!existingFields.pickupAddress) {
      return {
        fields: { pickupAddress: latest },
        nextMessage: "Perfeito. Agora informe o endereço de entrega."
      };
    }

    if (!existingFields.dropoffAddress) {
      return {
        fields: { dropoffAddress: latest },
        nextMessage: "Responda sim para confirmar ou não para cancelar."
      };
    }

    return {
      fields: {},
      nextMessage: "Responda sim para confirmar ou não para cancelar."
    };
  }
}

let _llmExtractor: LLMExtractor | null = null;

export function getLLMExtractor(): LLMExtractor {
  if (!_llmExtractor) {
    const hasKey = Boolean(env.OPENAI_API_KEY);
    const hasLocalEndpoint = Boolean(env.LLM_BASE_URL);

    if (hasKey || hasLocalEndpoint) {
      _llmExtractor = new OpenAICompatExtractor({
        apiKey: env.OPENAI_API_KEY ?? "ollama",
        baseURL: env.LLM_BASE_URL,
        model: env.LLM_MODEL
      });
    } else {
      _llmExtractor = new StubExtractor();
    }
  }

  return _llmExtractor;
}

export function setLLMExtractor(extractor: LLMExtractor): void {
  _llmExtractor = extractor;
}

export { getOrCreateConversationState, updateConversationState } from "./conversation-memory";
export { resetConversationInterpreter, setConversationInterpreter } from "./conversation-interpreter";

export async function resolveRetailerFromJid(
  db: DrizzleDB,
  companyId: string,
  contactJid: string
): Promise<{ userId: string; role: "retailer" } | null> {
  const rows = await db
    .select({ userId: whatsappContactMappings.userId })
    .from(whatsappContactMappings)
    .innerJoin(users, eq(users.id, whatsappContactMappings.userId))
    .where(and(eq(whatsappContactMappings.companyId, companyId), eq(whatsappContactMappings.contactJid, contactJid)))
    .limit(1);

  if (rows.length === 0) return null;
  return { userId: rows[0].userId, role: "retailer" };
}

export async function resolveRetailerDefaultPickupAddress(db: DrizzleDB, retailerId: string): Promise<string | null> {
  const addresses = await db
    .select({ address: retailerAddresses.address, isDefault: retailerAddresses.isDefault, createdAt: retailerAddresses.createdAt })
    .from(retailerAddresses)
    .where(eq(retailerAddresses.retailerId, retailerId));

  if (addresses.length === 0) return null;

  const explicitDefault = addresses.find((row) => row.isDefault);
  if (explicitDefault?.address) return explicitDefault.address;

  const sorted = [...addresses].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return sorted[0]?.address ?? null;
}

function hasRequiredFields(fields: Partial<DeliveryFields>): fields is Required<Pick<DeliveryFields, "pickupAddress" | "dropoffAddress">> & Partial<DeliveryFields> {
  return Boolean(fields.pickupAddress && fields.dropoffAddress);
}

function sanitizeDeliveryFields(fields: Partial<DeliveryFields>): Partial<DeliveryFields> {
  const normalized = DeliveryFieldsSchema.parse(fields ?? {});
  return {
    ...(normalized.pickupAddress ? { pickupAddress: normalized.pickupAddress } : {}),
    ...(normalized.dropoffAddress ? { dropoffAddress: normalized.dropoffAddress } : {}),
    ...(normalized.externalReference ? { externalReference: normalized.externalReference } : {})
  };
}

function buildSummaryMessage(fields: Partial<DeliveryFields>): string {
  const lines = ["📦 *Resumo do pedido:*"];
  if (fields.pickupAddress) lines.push(`🔵 Coleta: ${fields.pickupAddress}`);
  if (fields.dropoffAddress) lines.push(`🔴 Entrega: ${fields.dropoffAddress}`);
  if (fields.externalReference) lines.push(`🔖 Referência: ${fields.externalReference}`);
  lines.push("\nResponda *sim* para confirmar ou *não* para cancelar.");
  return lines.join("\n");
}

export async function processIntakeMessage(params: {
  db: DrizzleDB;
  companyId: string;
  contactJid: string;
  messageId: string;
  messageText: string;
  sendReply: (text: string) => Promise<void>;
}): Promise<void> {
  const { db, companyId, contactJid, messageId, messageText, sendReply } = params;

  const createdState = await getOrCreateConversationState(db, companyId, contactJid);
  const state = (await markConversationStaleIfNeeded(db, createdState.id)) ?? createdState;

  const normalizedMessageId = String(messageId ?? "").trim();
  const processedMessageId = normalizedMessageId || messageId;

  if (normalizedMessageId.length > 0 && state.lastProcessedMessageId === normalizedMessageId) {
    console.info(`[intake] skipping duplicate messageId=${normalizedMessageId} companyId=${companyId}`);
    return;
  }

  if (normalizedMessageId.length > 0) {
    const reserved = await db
      .update(conversationStates)
      .set({ lastProcessedMessageId: normalizedMessageId, updatedAt: new Date() })
      .where(and(eq(conversationStates.id, state.id), sql`${conversationStates.lastProcessedMessageId} is distinct from ${normalizedMessageId}`))
      .returning({ id: conversationStates.id });

    if (reserved.length === 0) {
      console.info(`[intake] skipping duplicate/racing messageId=${normalizedMessageId} companyId=${companyId}`);
      return;
    }
  }

  const resolved = await resolveWhatsAppContact(db, companyId, contactJid);
  if (resolved.category === "unknown_contact" || resolved.category === "known_driver") {
    await sendReply("Número não autorizado. Contate o suporte.");
    await updateConversationState(db, state.id, { lastProcessedMessageId: processedMessageId });
    return;
  }

  if (resolved.category === "known_retailer_blocked") {
    await updateConversationState(db, state.id, {
      status: "blocked",
      blockedReason: resolved.blockedReason,
      contextSnapshot: resolved.contextSnapshot,
      lastProcessedMessageId: processedMessageId
    });
    await sendReply(buildBlockedRetailerMessage(resolved.blockedReason));
    return;
  }

  const retailer = { userId: resolved.userId, role: "retailer" as const };
  const defaultPickupAddress = await resolveRetailerDefaultPickupAddress(db, resolved.retailerId);

  const existingFields = sanitizeDeliveryFields((state.collectedFields ?? {}) as Partial<DeliveryFields>);
  const conversationStatus = (state.status ?? "active") as "active" | "stale" | "completed" | "cancelled" | "blocked";
  const recentTurns = await listRecentConversationTurns(db, state.id, 6);

  await appendConversationTurn(db, {
    conversationStateId: state.id,
    companyId,
    contactJid,
    role: "user",
    messageText,
    normalizedText: messageText.trim().toLowerCase(),
    metadata: { phase: state.phase, recentTurnCount: recentTurns.length }
  });

  const recoveredPhase = state.phase === "confirming" && !hasRequiredFields({ ...existingFields, ...(defaultPickupAddress && !existingFields.pickupAddress ? { pickupAddress: defaultPickupAddress } : {}) })
    ? "collecting"
    : state.phase;

  if (recoveredPhase !== state.phase) {
    console.warn(`[intake] recovered inconsistent state companyId=${companyId} from=${state.phase} to=${recoveredPhase}`);
  }

  const controlText = String(messageText ?? "").trim();
  if (/^(cancel(ar)?|reiniciar|reset|come[cç]ar de novo)$/i.test(controlText)) {
    await updateConversationState(db, state.id, {
      phase: "idle",
      collectedFields: {},
      lastProcessedMessageId: processedMessageId
    });
    await sendReply("Pedido cancelado. Quando quiser, envie a nova solicitação.");
    return;
  }

  const interpreter = getConversationInterpreter(getLLMExtractor);
  const interpretation = await interpreter.interpret({
    messageText,
    existingFields
  });

  const interpretationWithDefaults = {
    ...interpretation,
    slotUpdates: {
      ...(defaultPickupAddress && !existingFields.pickupAddress && !interpretation.slotUpdates?.pickupAddress
        ? { pickupAddress: defaultPickupAddress }
        : {}),
      ...(interpretation.slotUpdates ?? {})
    }
  };

  const decision = decideRetailerConversationAction({
    phase: recoveredPhase,
    status: conversationStatus,
    existingFields,
    interpretation: interpretationWithDefaults,
    messageText,
    blockedReason: null
  });

  if (decision.kind === "restart_draft") {
    await updateConversationState(db, state.id, {
      phase: decision.phase,
      collectedFields: decision.fields,
      status: "active",
      staleAt: computeOperationalStaleAt(),
      lastUserMessageAt: new Date(),
      lastProcessedMessageId: processedMessageId
    });
    await appendConversationTurn(db, {
      conversationStateId: state.id,
      companyId,
      contactJid,
      role: "assistant",
      messageText: decision.reply,
      detectedIntent: "restart_draft"
    });
    await sendReply(decision.reply);
    return;
  }

  if (decision.kind === "stale_prompt") {
    await updateConversationState(db, state.id, {
      status: "stale",
      lastUserMessageAt: new Date(),
      lastProcessedMessageId: processedMessageId
    });
    await appendConversationTurn(db, {
      conversationStateId: state.id,
      companyId,
      contactJid,
      role: "assistant",
      messageText: decision.reply,
      detectedIntent: "continue_draft",
      metadata: { sourceEvent: "stale_resume_prompt" }
    });
    await sendReply(decision.reply);
    return;
  }

  if (decision.kind === "clarify") {
    await updateConversationState(db, state.id, {
      phase: decision.phase,
      collectedFields: decision.fields,
      status: "active",
      staleAt: computeOperationalStaleAt(),
      lastUserMessageAt: new Date(),
      lastProcessedMessageId: processedMessageId
    });
    await appendConversationTurn(db, {
      conversationStateId: state.id,
      companyId,
      contactJid,
      role: "assistant",
      messageText: decision.reply,
      detectedIntent: "unknown"
    });
    await sendReply(decision.reply);
    return;
  }

  if (decision.kind === "collect_more") {
    await updateConversationState(db, state.id, {
      phase: decision.phase,
      collectedFields: sanitizeDeliveryFields(decision.fields),
      status: "active",
      staleAt: computeOperationalStaleAt(),
      lastUserMessageAt: new Date(),
      lastProcessedMessageId: processedMessageId
    });
    await appendConversationTurn(db, {
      conversationStateId: state.id,
      companyId,
      contactJid,
      role: "assistant",
      messageText: decision.reply,
      detectedIntent: "update_draft"
    });
    await sendReply(decision.reply);
    return;
  }

  if (decision.kind === "request_confirmation") {
    await updateConversationState(db, state.id, {
      phase: decision.phase,
      collectedFields: sanitizeDeliveryFields(decision.fields),
      status: "active",
      staleAt: computeOperationalStaleAt(),
      lastUserMessageAt: new Date(),
      lastProcessedMessageId: processedMessageId
    });
    const summary = buildSummaryMessage(sanitizeDeliveryFields(decision.fields));
    await appendConversationTurn(db, {
      conversationStateId: state.id,
      companyId,
      contactJid,
      role: "assistant",
      messageText: summary,
      detectedIntent: "confirm_draft"
    });
    await sendReply(summary);
    return;
  }

  if (decision.kind === "cancel_draft") {
    await updateConversationState(db, state.id, {
      phase: "idle",
      collectedFields: {},
      status: "cancelled",
      closedAt: new Date(),
      lastBotMessageAt: new Date(),
      lastProcessedMessageId: processedMessageId
    });
    await appendConversationTurn(db, {
      conversationStateId: state.id,
      companyId,
      contactJid,
      role: "assistant",
      messageText: decision.reply,
      detectedIntent: "cancel_draft"
    });
    await sendReply(decision.reply);
    return;
  }

  if (decision.kind === "confirm_draft") {
    try {
      const delivery = await createDelivery({
        user: { id: retailer.userId, role: "retailer" },
        data: {
          companyId,
          pickupAddress: decision.fields.pickupAddress,
          dropoffAddress: decision.fields.dropoffAddress,
          externalReference: decision.fields.externalReference ?? null
        }
      });
      await updateConversationState(db, state.id, {
        phase: "idle",
        collectedFields: {},
        status: "completed",
        closedAt: new Date(),
        lastBotMessageAt: new Date(),
        lastProcessedMessageId: processedMessageId
      });
      const reply = `✅ Entrega criada com sucesso! ID: ${delivery.deliveryId}`;
      await appendConversationTurn(db, {
        conversationStateId: state.id,
        companyId,
        contactJid,
        role: "assistant",
        messageText: reply,
        detectedIntent: "confirm_draft",
        metadata: { deliveryId: delivery.deliveryId }
      });
      await sendReply(reply);
    } catch (err) {
      console.error(`[intake] createDelivery error companyId=${companyId}`, err);
      const reply = "Erro ao criar entrega. Por favor, tente novamente.";
      await updateConversationState(db, state.id, {
        lastProcessedMessageId: processedMessageId,
        lastBotMessageAt: new Date()
      });
      await appendConversationTurn(db, {
        conversationStateId: state.id,
        companyId,
        contactJid,
        role: "assistant",
        messageText: reply,
        detectedIntent: "confirm_draft",
        metadata: { error: err instanceof Error ? err.message : String(err) }
      });
      await sendReply(reply);
    }
    return;
  }

  if (decision.kind === "blocked") {
    await updateConversationState(db, state.id, {
      status: "blocked",
      lastBotMessageAt: new Date(),
      lastProcessedMessageId: processedMessageId
    });
    await appendConversationTurn(db, {
      conversationStateId: state.id,
      companyId,
      contactJid,
      role: "assistant",
      messageText: decision.reply,
      detectedIntent: "unknown"
    });
    await sendReply(decision.reply);
    return;
  }

  await updateConversationState(db, state.id, {
    phase: "idle",
    collectedFields: {},
    status: "active",
    lastProcessedMessageId: processedMessageId
  });
}
