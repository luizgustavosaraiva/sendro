import { z } from "zod";
import { env } from "../../env";
import type { AgentInterpretation } from "./conversation-types";
import type { DeliveryFields, LLMExtractor } from "./intake";

export interface LLMConversationInterpreter {
  interpret(input: {
    messageText: string;
    existingFields: Partial<DeliveryFields>;
  }): Promise<AgentInterpretation>;
}

const InterpretationSchema = z.object({
  flow: z.enum(["operational", "acquisition", "incident"]),
  intent: z.enum([
    "new_delivery",
    "update_draft",
    "confirm_draft",
    "cancel_draft",
    "restart_draft",
    "continue_draft",
    "product_inquiry",
    "lead_qualification",
    "handoff_human",
    "incident_report",
    "status_question",
    "unknown"
  ]),
  confidence: z.enum(["high", "medium", "low"]),
  shouldContinueDraft: z.boolean(),
  shouldStartNewDraft: z.boolean(),
  shouldAskClarification: z.boolean(),
  slotUpdates: z
    .object({
      pickupAddress: z.string().optional(),
      dropoffAddress: z.string().optional(),
      externalReference: z.string().optional(),
      notes: z.string().optional()
    })
    .optional(),
  reply: z.string()
});

const GREETING_RE = /^(oi|ola|olá|bom dia|boa tarde|boa noite|opa|e ai|e aí)\b/i;
const RESTART_RE = /(novo pedido|outra entrega|nova entrega|reiniciar|recomeçar|começar outra)/i;

export class ExtractorBackedConversationInterpreter implements LLMConversationInterpreter {
  constructor(private readonly extractorFactory: () => LLMExtractor) {}

  async interpret(input: { messageText: string; existingFields: Partial<DeliveryFields> }): Promise<AgentInterpretation> {
    const trimmed = input.messageText.trim();

    if (!trimmed) {
      return {
        flow: "operational",
        intent: "unknown",
        confidence: "low",
        shouldContinueDraft: false,
        shouldStartNewDraft: false,
        shouldAskClarification: true,
        reply: "Me diga o endereço de entrega ou descreva o pedido."
      };
    }

    if (GREETING_RE.test(trimmed) && !input.existingFields.pickupAddress && !input.existingFields.dropoffAddress) {
      const result = {
        flow: "operational",
        intent: "unknown",
        confidence: "medium",
        shouldContinueDraft: false,
        shouldStartNewDraft: false,
        shouldAskClarification: true,
        reply: "Oi! Me envie o endereço de entrega ou descreva rapidamente o pedido."
      } satisfies AgentInterpretation;
      console.info(`[conversation] interpretation intent=${result.intent} confidence=${result.confidence} reason=greeting`);
      return result;
    }

    if (RESTART_RE.test(trimmed)) {
      const result = {
        flow: "operational",
        intent: "restart_draft",
        confidence: "high",
        shouldContinueDraft: false,
        shouldStartNewDraft: true,
        shouldAskClarification: false,
        reply: "Perfeito. Vamos começar um novo pedido. Me envie o endereço de coleta ou o de entrega."
      } satisfies AgentInterpretation;
      console.info(`[conversation] interpretation intent=${result.intent} confidence=${result.confidence} reason=explicit-restart`);
      return result;
    }

    const extractor = this.extractorFactory();
    const extraction = await extractor.extract([trimmed], input.existingFields);

    const hasSlotUpdates = Boolean(
      extraction.fields.pickupAddress || extraction.fields.dropoffAddress || extraction.fields.externalReference
    );

    if (!hasSlotUpdates) {
      const result = {
        flow: "operational",
        intent: "unknown",
        confidence: "low",
        shouldContinueDraft: Boolean(input.existingFields.pickupAddress || input.existingFields.dropoffAddress),
        shouldStartNewDraft: false,
        shouldAskClarification: true,
        reply: extraction.nextMessage
      } satisfies AgentInterpretation;
      console.info(`[conversation] interpretation intent=${result.intent} confidence=${result.confidence} reason=no-slot-updates`);
      return result;
    }

    const result = {
      flow: "operational",
      intent: input.existingFields.pickupAddress || input.existingFields.dropoffAddress ? "update_draft" : "new_delivery",
      confidence: "medium",
      shouldContinueDraft: Boolean(input.existingFields.pickupAddress || input.existingFields.dropoffAddress),
      shouldStartNewDraft: false,
      shouldAskClarification: false,
      slotUpdates: extraction.fields,
      reply: extraction.nextMessage
    } satisfies AgentInterpretation;
    console.info(`[conversation] interpretation intent=${result.intent} confidence=${result.confidence} reason=slot-updates`);
    return result;
  }
}

export class OpenAICompatConversationInterpreter implements LLMConversationInterpreter {
  private apiKey: string;
  private baseURL: string | undefined;
  private model: string;

  constructor(opts: { apiKey: string; baseURL?: string; model?: string }) {
    this.apiKey = opts.apiKey;
    this.baseURL = opts.baseURL;
    this.model = opts.model ?? "gpt-4o-mini";
  }

  async interpret(input: { messageText: string; existingFields: Partial<DeliveryFields> }): Promise<AgentInterpretation> {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: this.apiKey, ...(this.baseURL ? { baseURL: this.baseURL } : {}) });

    const systemPrompt =
      "Você interpreta mensagens de um lojista no WhatsApp para um bot de entregas. " +
      "Classifique a intenção, proponha atualizações de campos se houver, e responda SOMENTE com JSON válido. " +
      "Nunca trate saudação simples como endereço. Se a mensagem for ambígua, peça clarificação curta.";

    const userContent = `Contexto atual: ${JSON.stringify(input.existingFields)}\n\nMensagem: ${input.messageText}`;

    const response = await client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
      response_format: { type: "json_object" }
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = InterpretationSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return {
        flow: "operational",
        intent: "unknown",
        confidence: "low",
        shouldContinueDraft: false,
        shouldStartNewDraft: false,
        shouldAskClarification: true,
        reply: "Me diga o endereço de entrega ou descreva rapidamente o pedido."
      };
    }

    return parsed.data;
  }
}

class StubConversationInterpreter implements LLMConversationInterpreter {
  async interpret(input: { messageText: string; existingFields: Partial<DeliveryFields> }): Promise<AgentInterpretation> {
    return new ExtractorBackedConversationInterpreter(() => ({
      async extract() {
        return {
          fields: {},
          nextMessage: input.existingFields.pickupAddress
            ? "Por favor, informe o endereço de entrega."
            : "Por favor, informe o endereço de coleta."
        };
      }
    })).interpret(input);
  }
}

let _conversationInterpreter: LLMConversationInterpreter | null = null;

export function getConversationInterpreter(extractorFactory: () => LLMExtractor): LLMConversationInterpreter {
  if (!_conversationInterpreter) {
    _conversationInterpreter = new ExtractorBackedConversationInterpreter(extractorFactory);
  }

  return _conversationInterpreter;
}

export function setConversationInterpreter(interpreter: LLMConversationInterpreter): void {
  _conversationInterpreter = interpreter;
}

export function resetConversationInterpreter(): void {
  _conversationInterpreter = null;
}
