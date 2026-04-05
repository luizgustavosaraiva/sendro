CREATE TYPE "public"."dispatch_phase" AS ENUM('queued', 'offered', 'waiting', 'completed');--> statement-breakpoint
CREATE TYPE "public"."dispatch_attempt_status" AS ENUM('pending', 'expired', 'accepted', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."dispatch_waiting_reason" AS ENUM('max_private_attempts_reached', 'no_candidates_available');--> statement-breakpoint
CREATE TABLE "dispatch_queue_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"phase" "dispatch_phase" DEFAULT 'queued' NOT NULL,
	"timeout_seconds" integer DEFAULT 120 NOT NULL,
	"active_attempt_number" integer DEFAULT 0 NOT NULL,
	"active_attempt_id" uuid,
	"offered_driver_id" uuid,
	"offered_driver_name" varchar(255),
	"offered_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"waiting_reason" "dispatch_waiting_reason",
	"waiting_since" timestamp with time zone,
	"ranking_version" varchar(64) DEFAULT 'dispatch-v1' NOT NULL,
	"assumptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"latest_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispatch_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"queue_entry_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"driver_id" uuid,
	"status" "dispatch_attempt_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"candidate_snapshot" jsonb DEFAULT null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispatch_attempts_delivery_attempt_unique" UNIQUE("delivery_id","attempt_number")
);
--> statement-breakpoint
ALTER TABLE "dispatch_queue_entries" ADD CONSTRAINT "dispatch_queue_entries_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_queue_entries" ADD CONSTRAINT "dispatch_queue_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_queue_entries" ADD CONSTRAINT "dispatch_queue_entries_offered_driver_id_drivers_id_fk" FOREIGN KEY ("offered_driver_id") REFERENCES "public"."drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_attempts" ADD CONSTRAINT "dispatch_attempts_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_attempts" ADD CONSTRAINT "dispatch_attempts_queue_entry_id_dispatch_queue_entries_id_fk" FOREIGN KEY ("queue_entry_id") REFERENCES "public"."dispatch_queue_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_attempts" ADD CONSTRAINT "dispatch_attempts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_attempts" ADD CONSTRAINT "dispatch_attempts_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dispatch_queue_entries_delivery_unique" ON "dispatch_queue_entries" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "dispatch_queue_entries_company_phase_deadline_idx" ON "dispatch_queue_entries" USING btree ("company_id","phase","deadline_at");--> statement-breakpoint
CREATE INDEX "dispatch_attempts_queue_status_deadline_idx" ON "dispatch_attempts" USING btree ("queue_entry_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "dispatch_attempts_company_status_deadline_idx" ON "dispatch_attempts" USING btree ("company_id","status","expires_at");