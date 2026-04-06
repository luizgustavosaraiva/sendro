-- Migration: 0004_whatsapp_sessions
-- Adds per-company WhatsApp session table managed by Evolution Go adapter.

CREATE TABLE IF NOT EXISTS "whatsapp_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "instance_name" varchar(255) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'disconnected',
  "qr_code" text,
  "provider" varchar(32) NOT NULL DEFAULT 'evolution-go',
  "last_error" text,
  "connected_at" timestamp with time zone,
  "disconnected_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "whatsapp_sessions_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "whatsapp_sessions"
    ADD CONSTRAINT "whatsapp_sessions_company_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
