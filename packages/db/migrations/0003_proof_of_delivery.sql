ALTER TABLE "companies" ADD COLUMN "proof_required_note" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "proof_required_photo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "proof_note" text;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "proof_photo_url" text;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "proof_required_note" boolean;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "proof_required_photo" boolean;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "proof_submitted_by_actor_type" "public"."delivery_actor_type";--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "proof_submitted_by_actor_id" text;--> statement-breakpoint
CREATE INDEX "deliveries_delivered_at_idx" ON "deliveries" USING btree ("company_id","delivered_at");