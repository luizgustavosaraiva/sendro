import type { AgentInterpretation, BlockedReasonPayload } from "./conversation-types";
import type { DeliveryFields } from "./intake";

type RetailerConversationPhase = "idle" | "collecting" | "confirming" | string;
type RetailerConversationStatus = "active" | "stale" | "completed" | "cancelled" | "blocked";

type RetailerConversationInput = {
  phase: RetailerConversationPhase;
  status: RetailerConversationStatus;
  existingFields: Partial<DeliveryFields>;
  interpretation: AgentInterpretation;
  messageText: string;
  blockedReason?: BlockedReasonPayload | null;
};

type RetailerConversationDecision =
  | { kind: "blocked"; reply: string }
  | { kind: "stale_prompt"; reply: string }
  | { kind: "restart_draft"; phase: "collecting"; fields: Partial<DeliveryFields>; reply: string }
  | { kind: "clarify"; phase: "idle" | "collecting"; fields: Partial<DeliveryFields>; reply: string }
  | { kind: "collect_more"; phase: "collecting"; fields: Partial<DeliveryFields>; reply: string }
  | { kind: "request_confirmation"; phase: "confirming"; fields: Partial<DeliveryFields> }
  | { kind: "confirm_draft"; fields: Required<Pick<DeliveryFields, "pickupAddress" | "dropoffAddress">> & Partial<DeliveryFields> }
  | { kind: "cancel_draft"; reply: string };

const YES_RE = /^(s[ií]m?|confirm)/i;
const NO_RE = /^(n[aã]o?|cancel)/i;

function hasRequiredFields(fields: Partial<DeliveryFields>): fields is Required<Pick<DeliveryFields, "pickupAddress" | "dropoffAddress">> & Partial<DeliveryFields> {
  return Boolean(fields.pickupAddress && fields.dropoffAddress);
}

export function buildBlockedRetailerMessage(blockedReason?: BlockedReasonPayload | null): string {
  const bondStatus = typeof blockedReason?.bondStatus === "string" ? blockedReason.bondStatus : null;
  if (bondStatus) {
    return `Encontrei sua loja, mas ela não está habilitada para criar entregas nesta empresa no momento (vínculo: ${bondStatus}).`;
  }
  return "Encontrei sua loja, mas ela não está habilitada para criar entregas nesta empresa no momento.";
}

export function decideRetailerConversationAction(input: RetailerConversationInput): RetailerConversationDecision {
  if (input.blockedReason || input.status === "blocked") {
    const decision = {
      kind: "blocked",
      reply: buildBlockedRetailerMessage(input.blockedReason)
    } satisfies RetailerConversationDecision;
    console.info(`[conversation] decision kind=${decision.kind}`);
    return decision;
  }

  if (input.status === "stale" && input.interpretation.intent !== "restart_draft" && input.interpretation.intent !== "continue_draft") {
    const decision = {
      kind: "stale_prompt",
      reply: "Você quer continuar o pedido anterior ou começar uma nova entrega?"
    } satisfies RetailerConversationDecision;
    console.info(`[conversation] decision kind=${decision.kind}`);
    return decision;
  }

  if (input.interpretation.intent === "restart_draft") {
    const decision = {
      kind: "restart_draft",
      phase: "collecting",
      fields: {},
      reply: input.interpretation.reply
    } satisfies RetailerConversationDecision;
    console.info(`[conversation] decision kind=${decision.kind}`);
    return decision;
  }

  if (input.phase === "confirming") {
    if (YES_RE.test(input.messageText) && hasRequiredFields(input.existingFields)) {
      const decision = {
        kind: "confirm_draft",
        fields: input.existingFields
      } satisfies RetailerConversationDecision;
      console.info(`[conversation] decision kind=${decision.kind}`);
      return decision;
    }

    if (NO_RE.test(input.messageText)) {
      const decision = {
        kind: "cancel_draft",
        reply: input.interpretation.reply || "Pedido cancelado."
      } satisfies RetailerConversationDecision;
      console.info(`[conversation] decision kind=${decision.kind}`);
      return decision;
    }

    const decision = {
      kind: "request_confirmation",
      phase: "confirming",
      fields: input.existingFields
    } satisfies RetailerConversationDecision;
    console.info(`[conversation] decision kind=${decision.kind}`);
    return decision;
  }

  if (input.interpretation.shouldAskClarification && !input.interpretation.slotUpdates) {
    const decision = {
      kind: "clarify",
      phase: input.existingFields.pickupAddress || input.existingFields.dropoffAddress ? "collecting" : "idle",
      fields: input.existingFields,
      reply: input.interpretation.reply
    } satisfies RetailerConversationDecision;
    console.info(`[conversation] decision kind=${decision.kind}`);
    return decision;
  }

  const mergedFields: Partial<DeliveryFields> = {
    ...input.existingFields,
    ...(input.interpretation.slotUpdates ?? {})
  };

  if (hasRequiredFields(mergedFields)) {
    const decision = {
      kind: "request_confirmation",
      phase: "confirming",
      fields: mergedFields
    } satisfies RetailerConversationDecision;
    console.info(`[conversation] decision kind=${decision.kind}`);
    return decision;
  }

  const decision = {
    kind: "collect_more",
    phase: "collecting",
    fields: mergedFields,
    reply: input.interpretation.reply
  } satisfies RetailerConversationDecision;
  console.info(`[conversation] decision kind=${decision.kind}`);
  return decision;
}
