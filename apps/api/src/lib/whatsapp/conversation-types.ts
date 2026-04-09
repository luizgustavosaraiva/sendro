import type { conversationStates, conversationTurns } from "@repo/db";

export type ConversationMode =
  | "idle"
  | "drafting_delivery"
  | "confirming_delivery"
  | "blocked"
  | "qualifying_lead"
  | "handoff_pending"
  | "driver_idle";

export type ConversationFlow = "operational" | "acquisition" | "incident";

export type ConversationStatus = "active" | "stale" | "completed" | "cancelled" | "blocked";

export type ConversationIntent =
  | "new_delivery"
  | "update_draft"
  | "confirm_draft"
  | "cancel_draft"
  | "restart_draft"
  | "continue_draft"
  | "product_inquiry"
  | "lead_qualification"
  | "handoff_human"
  | "incident_report"
  | "status_question"
  | "unknown";

export type ConversationActorRole = "retailer" | "driver" | "unknown";

export type DraftPayload = {
  pickupAddress?: string;
  dropoffAddress?: string;
  reference?: string;
  notes?: string;
  source?: Record<string, string>;
  completion?: Record<string, boolean>;
  lastConfirmedAt?: string | null;
};

export type ContextSnapshot = Record<string, unknown>;
export type BlockedReasonPayload = Record<string, unknown>;

export type ConversationStateRow = typeof conversationStates.$inferSelect;
export type ConversationTurnRow = typeof conversationTurns.$inferSelect;

export type ConversationStatePatch = {
  userId?: string | null;
  retailerId?: string | null;
  roleResolution?: ConversationActorRole;
  conversationMode?: ConversationMode;
  currentFlow?: ConversationFlow;
  currentIntent?: ConversationIntent | null;
  phase?: string;
  collectedFields?: Record<string, unknown>;
  draftPayload?: DraftPayload;
  contextSnapshot?: ContextSnapshot;
  blockedReason?: BlockedReasonPayload | null;
  status?: ConversationStatus;
  lastProcessedMessageId?: string | null;
  startedAt?: Date;
  lastUserMessageAt?: Date | null;
  lastBotMessageAt?: Date | null;
  staleAt?: Date | null;
  closedAt?: Date | null;
};

export type ConversationTurnInput = {
  conversationStateId: string;
  companyId: string;
  contactJid: string;
  role: "user" | "assistant" | "system";
  messageText: string;
  normalizedText?: string | null;
  detectedIntent?: string | null;
  metadata?: Record<string, unknown>;
};

export type AgentInterpretation = {
  flow: ConversationFlow;
  intent: ConversationIntent;
  confidence: "high" | "medium" | "low";
  shouldContinueDraft: boolean;
  shouldStartNewDraft: boolean;
  shouldAskClarification: boolean;
  slotUpdates?: {
    pickupAddress?: string;
    dropoffAddress?: string;
    externalReference?: string;
    notes?: string;
  };
  reply: string;
};
