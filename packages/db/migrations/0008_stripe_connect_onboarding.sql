-- Migration: 0008_stripe_connect_onboarding
-- Adds Stripe Connect account truth-state fields for company billing status.

ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "stripe_account_id" varchar(255),
  ADD COLUMN IF NOT EXISTS "stripe_charges_enabled" boolean,
  ADD COLUMN IF NOT EXISTS "stripe_payouts_enabled" boolean,
  ADD COLUMN IF NOT EXISTS "stripe_connected_at" timestamp with time zone;

CREATE UNIQUE INDEX IF NOT EXISTS "companies_stripe_account_id_unique"
  ON "companies" ("stripe_account_id");

CREATE INDEX IF NOT EXISTS "companies_stripe_capabilities_idx"
  ON "companies" ("stripe_charges_enabled", "stripe_payouts_enabled");
