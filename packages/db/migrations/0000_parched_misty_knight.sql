CREATE TYPE "public"."bond_entity_type" AS ENUM('retailer', 'driver');--> statement-breakpoint
CREATE TYPE "public"."bond_status" AS ENUM('pending', 'active', 'suspended', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."company_lifecycle" AS ENUM('onboarding', 'active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."delivery_actor_type" AS ENUM('system', 'company', 'retailer', 'driver');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('created', 'queued', 'offered', 'assigned', 'accepted', 'picked_up', 'in_transit', 'delivered', 'cancelled', 'failed_attempt');--> statement-breakpoint
CREATE TYPE "public"."driver_lifecycle" AS ENUM('onboarding', 'active', 'paused', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."entity_role" AS ENUM('company', 'retailer', 'driver');--> statement-breakpoint
CREATE TYPE "public"."invitation_channel" AS ENUM('whatsapp', 'email', 'link', 'manual');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."retailer_lifecycle" AS ENUM('onboarding', 'active', 'suspended');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bonds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_type" "bond_entity_type" NOT NULL,
	"status" "bond_status" DEFAULT 'pending' NOT NULL,
	"requested_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"lifecycle" "company_lifecycle" DEFAULT 'onboarding' NOT NULL,
	"stripe_customer_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"retailer_id" uuid NOT NULL,
	"driver_id" uuid,
	"external_reference" varchar(255),
	"status" "delivery_status" DEFAULT 'created' NOT NULL,
	"pickup_address" text,
	"dropoff_address" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"status" "delivery_status" NOT NULL,
	"actor_type" "delivery_actor_type" NOT NULL,
	"actor_id" text,
	"actor_label" varchar(255),
	"sequence" integer NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"phone" varchar(40),
	"lifecycle" "driver_lifecycle" DEFAULT 'onboarding' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"token" varchar(255) NOT NULL,
	"channel" "invitation_channel" NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"invited_contact" varchar(255),
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retailers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"lifecycle" "retailer_lifecycle" DEFAULT 'onboarding' NOT NULL,
	"stripe_customer_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"user_id" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "entity_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonds" ADD CONSTRAINT "bonds_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonds" ADD CONSTRAINT "bonds_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_retailer_id_retailers_id_fk" FOREIGN KEY ("retailer_id") REFERENCES "public"."retailers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retailers" ADD CONSTRAINT "retailers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_unique" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bonds_company_entity_unique" ON "bonds" USING btree ("company_id","entity_id","entity_type");--> statement-breakpoint
CREATE INDEX "bonds_status_idx" ON "bonds" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_user_id_unique" ON "companies" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_slug_unique" ON "companies" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_stripe_customer_id_unique" ON "companies" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "deliveries_company_status_idx" ON "deliveries" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "deliveries_retailer_idx" ON "deliveries" USING btree ("retailer_id");--> statement-breakpoint
CREATE INDEX "deliveries_driver_idx" ON "deliveries" USING btree ("driver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_events_delivery_sequence_unique" ON "delivery_events" USING btree ("delivery_id","sequence");--> statement-breakpoint
CREATE INDEX "delivery_events_delivery_created_idx" ON "delivery_events" USING btree ("delivery_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "drivers_user_id_unique" ON "drivers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drivers_phone_unique" ON "drivers" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_unique" ON "invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "invitations_company_status_idx" ON "invitations" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "retailers_user_id_unique" ON "retailers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "retailers_slug_unique" ON "retailers" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "retailers_stripe_customer_id_unique" ON "retailers" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_unique" ON "session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_unique" ON "user" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_identifier_value_unique" ON "verification" USING btree ("identifier","value");