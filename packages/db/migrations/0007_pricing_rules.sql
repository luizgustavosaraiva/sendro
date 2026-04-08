-- Migration: 0007_pricing_rules
-- Adds company-scoped pricing rules consumed by dispatch ranking.

CREATE TABLE IF NOT EXISTS "pricing_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "region" varchar(120) NOT NULL,
  "delivery_type" varchar(80) NOT NULL,
  "weight_min_grams" integer NOT NULL,
  "weight_max_grams" integer,
  "amount_cents" integer NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'BRL',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "pricing_rules_company_key_unique"
  ON "pricing_rules" ("company_id", "region", "delivery_type", "weight_min_grams", "weight_max_grams");

CREATE INDEX IF NOT EXISTS "pricing_rules_company_order_idx"
  ON "pricing_rules" ("company_id", "region", "delivery_type", "weight_min_grams", "weight_max_grams");
