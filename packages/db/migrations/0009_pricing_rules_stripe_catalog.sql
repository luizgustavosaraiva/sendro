-- Migration: 0009_pricing_rules_stripe_catalog
-- Adds nullable Stripe catalog linkage columns to pricing rules.

ALTER TABLE "pricing_rules"
  ADD COLUMN IF NOT EXISTS "stripe_product_id" varchar(255),
  ADD COLUMN IF NOT EXISTS "stripe_price_id" varchar(255);
