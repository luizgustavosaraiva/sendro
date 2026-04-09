-- Migration: 0010_conversation_memory
-- Expands WhatsApp conversation state for hybrid agent memory and adds bounded turn storage.

ALTER TABLE "conversation_states"
  ADD COLUMN IF NOT EXISTS "user_id" text,
  ADD COLUMN IF NOT EXISTS "retailer_id" uuid,
  ADD COLUMN IF NOT EXISTS "role_resolution" varchar(16) NOT NULL DEFAULT 'retailer',
  ADD COLUMN IF NOT EXISTS "conversation_mode" varchar(32) NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS "current_flow" varchar(32) NOT NULL DEFAULT 'operational',
  ADD COLUMN IF NOT EXISTS "current_intent" varchar(64),
  ADD COLUMN IF NOT EXISTS "draft_payload" jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "context_snapshot" jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "blocked_reason" jsonb,
  ADD COLUMN IF NOT EXISTS "status" varchar(32) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "last_user_message_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "last_bot_message_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "stale_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_turns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_state_id" uuid NOT NULL,
  "company_id" uuid NOT NULL,
  "contact_jid" varchar(128) NOT NULL,
  "role" varchar(16) NOT NULL,
  "message_text" text NOT NULL,
  "normalized_text" text,
  "detected_intent" varchar(64),
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_turns_state_created_idx"
  ON "conversation_turns" ("conversation_state_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_turns_company_contact_created_idx"
  ON "conversation_turns" ("company_id", "contact_jid", "created_at");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "conversation_states"
    ADD CONSTRAINT "conversation_states_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "user"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "conversation_states"
    ADD CONSTRAINT "conversation_states_retailer_id_fk"
    FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "conversation_turns"
    ADD CONSTRAINT "conversation_turns_state_id_fk"
    FOREIGN KEY ("conversation_state_id") REFERENCES "conversation_states"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "conversation_turns"
    ADD CONSTRAINT "conversation_turns_company_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
