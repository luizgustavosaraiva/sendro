-- Migration: 0006_whatsapp_contact_role
-- Adds role column to whatsapp_contact_mappings ('retailer' | 'driver').

ALTER TABLE "whatsapp_contact_mappings"
  ADD COLUMN IF NOT EXISTS "role" varchar(16) NOT NULL DEFAULT 'retailer';
