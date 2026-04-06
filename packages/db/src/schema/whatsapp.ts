import { pgTable, uuid, varchar, text, timestamp, jsonb } from "drizzle-orm/pg-core";

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
  phase: varchar("phase", { length: 32 }).notNull().default("idle"),
  collectedFields: jsonb("collected_fields").notNull().default({}),
  lastProcessedMessageId: varchar("last_processed_message_id", { length: 255 }),
  ...timestamps
});

export const whatsappContactMappings = pgTable("whatsapp_contact_mappings", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull(),
  contactJid: varchar("contact_jid", { length: 128 }).notNull(),
  userId: text("user_id").notNull(),
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
