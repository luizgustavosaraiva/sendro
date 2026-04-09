import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { assertDb, users, whatsappContactMappings } from "@repo/db";
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
import { getConversationInterpreter, setConversationInterpreter, resetConversationInterpreter } from "./conversation-interpreter";
import { resolveWhatsAppContact } from "./contact-resolver";
import { buildBlockedRetailerMessage, decideRetailerConversationAction } from "./conversation-engine";

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

// ─── OpenAI-compatible extractor ─────────────────────────────────────────────
// Works with OpenAI *and* any OpenAI-compatible endpoint (e.g. Ollama).
// Set LLM_BASE_URL=http://localhost:11434/v1 + LLM_MODEL=gemma3:4b to run
// locally via Ollama without spending real API credits.

class OpenAICompatExtractor implements LLMExtractor {
  private apiKey: string;
  private baseURL: string | undefined;
  private model: string;

  constructor(opts: { apiKey: string; baseURL?: string; model?: string }) {
    this.apiKey = opts.apiKey;
    this.baseURL = opts.baseURL;
    // Default to gpt-4o-mini when talking to OpenAI, or use whatever model is configured.
    this.model = opts.model ?? "gpt-4o-mini";
  }

  async extract(
    messages: string[],
    existingFields: Partial<DeliveryFields>
  ): Promise<{ fields: Partial<DeliveryFields>; nextMessage: string }> {
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
      pickupAddress: z.string().optional(),
      dropoffAddress: z.string().optional(),
      externalReference: z.string().optional(),
      nextMessage: z.string()
    });

    // Ollama doesn't support response_format with zodResponseFormat structured output,
    // so we use plain JSON mode when a custom baseURL is set, and parse manually.
    let parsed: z.infer<typeof ExtractionSchema> | null = null;

    if (this.baseURL) {
      // Plain JSON mode — compatible with Ollama and other local providers
      const response = await client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Contexto atual: ${JSON.stringify(existingFields)}\n\nMensagem: ${userContent}`
          }
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
      // OpenAI structured output via zodResponseFormat
      const { zodResponseFormat } = await import("openai/helpers/zod");
      const response = await (client.chat.completions as any).parse({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Contexto atual: ${JSON.stringify(existingFields)}\n\nMensagem: ${userContent}`
          }
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
    // LLM_BASE_URL allows pointing to any OpenAI-compatible server (e.g. Ollama).
    // When LLM_BASE_URL is set and no OPENAI_API_KEY is provided, we use a dummy
    // key — local providers like Ollama don't require a real key.
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

export { setConversationInterpreter, resetConversationInterpreter } from "./conversation-interpreter";

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

export { getOrCreateConversationState, updateConversationState } from "./conversation-memory";

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
  const createdState = await getOrCreateConversationState(db, companyId, contactJid);
  const state = (await markConversationStaleIfNeeded(db, createdState.id)) ?? createdState;

  // Idempotency: skip if already processed
  if (state.lastProcessedMessageId === messageId) {
    console.info(`[intake] skipping duplicate messageId=${messageId} companyId=${companyId}`);
    return;
  }

  const resolved = await resolveWhatsAppContact(db, companyId, contactJid);
  if (resolved.category === "unknown_contact" || resolved.category === "known_driver") {
    await sendReply("Número não autorizado. Contate o suporte.");
    await updateConversationState(db, state.id, { lastProcessedMessageId: messageId });
    return;
  }

  if (resolved.category === "known_retailer_blocked") {
    await updateConversationState(db, state.id, {
      status: "blocked",
      blockedReason: resolved.blockedReason,
      contextSnapshot: resolved.contextSnapshot,
      lastProcessedMessageId: messageId
    });
    await sendReply(buildBlockedRetailerMessage(resolved.blockedReason));
    return;
  }

  const retailer = { userId: resolved.userId, role: "retailer" as const };

  const existingFields = (state.collectedFields ?? {}) as Partial<DeliveryFields>;
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

  const interpreter = getConversationInterpreter(getLLMExtractor);
  const interpretation = await interpreter.interpret({
    messageText,
    existingFields
  });

  const decision = decideRetailerConversationAction({
    phase: state.phase,
    status: conversationStatus,
    existingFields,
    interpretation,
    messageText
  });

  if (decision.kind === "restart_draft") {
      await updateConversationState(db, state.id, {
        phase: decision.phase,
        collectedFields: decision.fields,
        status: "active",
        staleAt: computeOperationalStaleAt(),
        lastUserMessageAt: new Date(),
        lastProcessedMessageId: messageId
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
      lastProcessedMessageId: messageId
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
        lastProcessedMessageId: messageId
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
        collectedFields: decision.fields,
        status: "active",
        staleAt: computeOperationalStaleAt(),
        lastUserMessageAt: new Date(),
        lastProcessedMessageId: messageId
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
        collectedFields: decision.fields,
        status: "active",
        staleAt: computeOperationalStaleAt(),
        lastUserMessageAt: new Date(),
        lastProcessedMessageId: messageId
      });
      const summary = buildSummaryMessage(decision.fields);
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
        lastProcessedMessageId: messageId
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
          lastProcessedMessageId: messageId
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
          lastProcessedMessageId: messageId,
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
      lastProcessedMessageId: messageId
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

  // Unknown phase — reset
    await updateConversationState(db, state.id, {
      phase: "idle",
      collectedFields: {},
      status: "active",
      lastProcessedMessageId: messageId
    });
}
