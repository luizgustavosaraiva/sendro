import { index, pgTable, uuid, varchar, text, timestamp, jsonb } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
};

/**
 * Per-company WhatsApp session managed by the Evolution Go adapter.
 * The FK constraint to companies(id) is enforced in the migration SQL.
 * We omit .references() here to avoid a circular import with index.ts.
 */
export const conversationStates = pgTable("conversation_states", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull(),
  contactJid: varchar("contact_jid", { length: 128 }).notNull(),
  userId: text("user_id"),
  retailerId: uuid("retailer_id"),
  roleResolution: varchar("role_resolution", { length: 16 }).notNull().default("retailer"),
  conversationMode: varchar("conversation_mode", { length: 32 }).notNull().default("idle"),
  currentFlow: varchar("current_flow", { length: 32 }).notNull().default("operational"),
  currentIntent: varchar("current_intent", { length: 64 }),
  phase: varchar("phase", { length: 32 }).notNull().default("idle"),
  collectedFields: jsonb("collected_fields").notNull().default({}),
  draftPayload: jsonb("draft_payload").notNull().default({}),
  contextSnapshot: jsonb("context_snapshot").notNull().default({}),
  blockedReason: jsonb("blocked_reason"),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  lastProcessedMessageId: varchar("last_processed_message_id", { length: 255 }),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  lastUserMessageAt: timestamp("last_user_message_at", { withTimezone: true }),
  lastBotMessageAt: timestamp("last_bot_message_at", { withTimezone: true }),
  staleAt: timestamp("stale_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  ...timestamps
});

export const conversationTurns = pgTable(
  "conversation_turns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationStateId: uuid("conversation_state_id").notNull(),
    companyId: uuid("company_id").notNull(),
    contactJid: varchar("contact_jid", { length: 128 }).notNull(),
    role: varchar("role", { length: 16 }).notNull(),
    messageText: text("message_text").notNull(),
    normalizedText: text("normalized_text"),
    detectedIntent: varchar("detected_intent", { length: 64 }),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    stateCreatedIdx: index("conversation_turns_state_created_idx").on(table.conversationStateId, table.createdAt),
    companyContactCreatedIdx: index("conversation_turns_company_contact_created_idx").on(
      table.companyId,
      table.contactJid,
      table.createdAt
    )
  })
);

export const whatsappContactMappings = pgTable("whatsapp_contact_mappings", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull(),
  contactJid: varchar("contact_jid", { length: 128 }).notNull(),
  userId: text("user_id").notNull(),
  role: varchar("role", { length: 16 }).notNull().default("retailer"),
  ...timestamps
});

export const whatsappSessions = pgTable("whatsapp_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull(),
  instanceName: varchar("instance_name", { length: 255 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("disconnected"),
  qrCode: text("qr_code"),
  provider: varchar("provider", { length: 32 }).notNull().default("evolution-go"),
  lastError: text("last_error"),
  connectedAt: timestamp("connected_at", { withTimezone: true }),
  disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
  ...timestamps
});
