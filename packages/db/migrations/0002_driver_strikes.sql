CREATE TYPE "public"."driver_offer_status" AS ENUM('pending', 'accepted', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."driver_strike_consequence" AS ENUM('warning', 'bond_suspended', 'bond_revoked');--> statement-breakpoint
CREATE TABLE "driver_strikes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"bond_id" uuid NOT NULL,
	"delivery_id" uuid NOT NULL,
	"dispatch_attempt_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"reason" varchar(120) NOT NULL,
	"consequence" "driver_strike_consequence" NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "driver_strikes_dispatch_attempt_unique" UNIQUE("dispatch_attempt_id")
);
--> statement-breakpoint
ALTER TABLE "dispatch_attempts" RENAME COLUMN "status" TO "offer_status";--> statement-breakpoint
ALTER TABLE "dispatch_attempts" ALTER COLUMN "offer_status" TYPE "public"."driver_offer_status" USING "offer_status"::text::"public"."driver_offer_status";--> statement-breakpoint
ALTER TABLE "dispatch_attempts" ALTER COLUMN "offer_status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "dispatch_attempts" ADD COLUMN "resolved_by_actor_type" "public"."delivery_actor_type";--> statement-breakpoint
ALTER TABLE "dispatch_attempts" ADD COLUMN "resolved_by_actor_id" text;--> statement-breakpoint
ALTER TABLE "dispatch_attempts" ADD COLUMN "resolution_reason" varchar(120);--> statement-breakpoint
ALTER TABLE "driver_strikes" ADD CONSTRAINT "driver_strikes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_strikes" ADD CONSTRAINT "driver_strikes_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_strikes" ADD CONSTRAINT "driver_strikes_bond_id_bonds_id_fk" FOREIGN KEY ("bond_id") REFERENCES "public"."bonds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_strikes" ADD CONSTRAINT "driver_strikes_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_strikes" ADD CONSTRAINT "driver_strikes_dispatch_attempt_id_dispatch_attempts_id_fk" FOREIGN KEY ("dispatch_attempt_id") REFERENCES "public"."dispatch_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "driver_strikes_company_driver_idx" ON "driver_strikes" USING btree ("company_id","driver_id","created_at");--> statement-breakpoint
CREATE INDEX "driver_strikes_bond_idx" ON "driver_strikes" USING btree ("bond_id","created_at");--> statement-breakpoint
DROP TYPE "public"."dispatch_attempt_status";