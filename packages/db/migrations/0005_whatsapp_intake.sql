-- Migration: 0005_whatsapp_intake
-- Adds conversation_states and whatsapp_contact_mappings tables for LLM-guided intake flow.

CREATE TABLE IF NOT EXISTS "conversation_states" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "contact_jid" varchar(128) NOT NULL,
  "phase" varchar(32) NOT NULL DEFAULT 'idle',
  "collected_fields" jsonb NOT NULL DEFAULT '{}',
  "last_processed_message_id" varchar(255),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_states_company_contact_unique"
  ON "conversation_states" ("company_id", "contact_jid");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "whatsapp_contact_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "contact_jid" varchar(128) NOT NULL,
  "user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_contact_mappings_company_contact_unique"
  ON "whatsapp_contact_mappings" ("company_id", "contact_jid");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "conversation_states"
    ADD CONSTRAINT "conversation_states_company_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "whatsapp_contact_mappings"
    ADD CONSTRAINT "whatsapp_contact_mappings_company_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "whatsapp_contact_mappings"
    ADD CONSTRAINT "whatsapp_contact_mappings_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "user"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
