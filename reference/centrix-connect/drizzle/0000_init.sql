CREATE TABLE "centrix_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"building_id" text NOT NULL,
	"unit_id" text,
	"asset_type" text NOT NULL,
	"ownership_scope" text DEFAULT 'common' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_audit_event" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_run_id" text NOT NULL,
	"type" text NOT NULL,
	"actor" text NOT NULL,
	"from_state" text,
	"to_state" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "centrix_building" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"building_year" integer,
	"heating_type" text,
	"energy_class" text,
	"energy_certificate_valid_until" date
);
--> statement-breakpoint
CREATE TABLE "centrix_case" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"unit_id" text,
	"reporter_party_id" text,
	"asset_id" text,
	"category" text NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_consent" (
	"id" text PRIMARY KEY NOT NULL,
	"party_id" text NOT NULL,
	"partner_id" text NOT NULL,
	"workflow_run_id" text NOT NULL,
	"data_shared" jsonb NOT NULL,
	"purpose" text NOT NULL,
	"channel" text NOT NULL,
	"given_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_conversation" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_run_id" text NOT NULL,
	"channel" text NOT NULL,
	"participants" jsonb NOT NULL,
	"external_thread_id" text
);
--> statement-breakpoint
CREATE TABLE "centrix_document" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text,
	"unit_id" text,
	"type" text NOT NULL,
	"url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "centrix_event" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"unit_id" text NOT NULL,
	"party_id" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "centrix_lease_party" (
	"lease_id" text NOT NULL,
	"party_id" text NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "centrix_lease_party_lease_id_party_id_pk" PRIMARY KEY("lease_id","party_id")
);
--> statement-breakpoint
CREATE TABLE "centrix_lease" (
	"id" text PRIMARY KEY NOT NULL,
	"unit_id" text NOT NULL,
	"rent_cold_cents" integer,
	"start_date" date NOT NULL,
	"end_date" date
);
--> statement-breakpoint
CREATE TABLE "centrix_mandate" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"grantor_party_id" text,
	"type" text NOT NULL,
	"approval_limit_cents" integer
);
--> statement-breakpoint
CREATE TABLE "ai_message" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"sender_party_id" text,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "centrix_meter" (
	"id" text PRIMARY KEY NOT NULL,
	"unit_id" text NOT NULL,
	"type" text NOT NULL,
	"number" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "centrix_ownership" (
	"party_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"mea_share" numeric,
	"valid_from" date,
	"valid_to" date,
	CONSTRAINT "centrix_ownership_party_id_unit_id_pk" PRIMARY KEY("party_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE "centrix_party" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"whatsapp_opt_in" boolean DEFAULT false NOT NULL,
	"language" text DEFAULT 'de' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_offer" (
	"id" text PRIMARY KEY NOT NULL,
	"partner_id" text NOT NULL,
	"product" text NOT NULL,
	"monthly_price_cents" integer NOT NULL,
	"lead_time_business_days" integer NOT NULL,
	"eligibility" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_partner" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"manifest" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "centrix_property" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"street" text NOT NULL,
	"postcode" text NOT NULL,
	"city" text NOT NULL,
	"is_weg" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "centrix_service_contract" (
	"id" text PRIMARY KEY NOT NULL,
	"unit_id" text NOT NULL,
	"party_id" text NOT NULL,
	"partner_name" text NOT NULL,
	"category" text NOT NULL,
	"product" text NOT NULL,
	"status" text NOT NULL,
	"start_date" date NOT NULL,
	"monthly_price_cents" integer NOT NULL,
	"bridge" jsonb,
	"consent" jsonb NOT NULL,
	"source_order_id" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_service_order" (
	"id" text PRIMARY KEY NOT NULL,
	"offer_id" text NOT NULL,
	"partner_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"party_id" text NOT NULL,
	"consent_id" text NOT NULL,
	"workflow_run_id" text NOT NULL,
	"shared_payload" jsonb NOT NULL,
	"start_date" date NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "centrix_unit" (
	"id" text PRIMARY KEY NOT NULL,
	"building_id" text NOT NULL,
	"identifier" text NOT NULL,
	"floor" integer,
	"size_sqm" integer,
	"rooms" integer
);
--> statement-breakpoint
CREATE TABLE "centrix_work_order" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"contractor_id" text,
	"scheduled_at" timestamp with time zone,
	"cost_estimate_cents" integer,
	"payer" text,
	"status" text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_workflow_run" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"case_id" text,
	"unit_id" text NOT NULL,
	"party_id" text NOT NULL,
	"partner_id" text,
	"offer_id" text,
	"state" text NOT NULL,
	"offer" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "centrix_asset" ADD CONSTRAINT "centrix_asset_building_id_centrix_building_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."centrix_building"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centrix_asset" ADD CONSTRAINT "centrix_asset_unit_id_centrix_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."centrix_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_audit_event" ADD CONSTRAINT "ai_audit_event_workflow_run_id_ai_workflow_run_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."ai_workflow_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centrix_building" ADD CONSTRAINT "centrix_building_property_id_centrix_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."centrix_property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centrix_case" ADD CONSTRAINT "centrix_case_property_id_centrix_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."centrix_property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centrix_case" ADD CONSTRAINT "centrix_case_unit_id_centrix_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."centrix_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centrix_case" ADD CONSTRAINT "centrix_case_reporter_party_id_centrix_party_id_fk" FOREIGN KEY ("reporter_party_id") REFERENCES "public"."centrix_party"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centrix_case" ADD CONSTRAINT "centrix_case_asset_id_centrix_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."centrix_asset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_consent" ADD CONSTRAINT "partner_consent_party_id_centrix_party_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."centrix_party"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_consent" ADD CONSTRAINT "partner_consent_partner_id_partner_partner_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partner_partner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_workflow_run_id_ai_workflow_run_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."ai_workflow_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centrix_document" ADD CONSTRAINT "centrix_document_case_id_centrix_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."centrix_case"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centrix_document" ADD CONSTRAINT "centrix_document_unit_id_centrix_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."centrix_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centrix_event" ADD CONSTRAINT "centrix_event_unit_id_centrix_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."centrix_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centrix_event" ADD CONSTRAINT "centrix_event_party_id_centrix_party_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."centrix_party"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centrix_lease_party" ADD CONSTRAINT "centrix_lease_party_lease_id_centrix_lease_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."centrix_lease"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centrix_lease_party" ADD CONSTRAINT "centrix_lease_party_party_id_centrix_party_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."centrix_party"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centrix_lease" ADD CONSTRAINT "centrix_lease_unit_id_centrix_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."centrix_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centrix_mandate" ADD CONSTRAINT "centrix_mandate_property_id_centrix_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."centrix_property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centrix_mandate" ADD CONSTRAINT "centrix_mandate_grantor_party_id_centrix_party_id_fk" FOREIGN KEY ("grantor_party_id") REFERENCES "public"."centrix_party"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_message" ADD CONSTRAINT "ai_message_conversation_id_ai_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centrix_meter" ADD CONSTRAINT "centrix_meter_unit_id_centrix_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."centrix_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centrix_ownership" ADD CONSTRAINT "centrix_ownership_party_id_centrix_party_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."centrix_party"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centrix_ownership" ADD CONSTRAINT "centrix_ownership_unit_id_centrix_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."centrix_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_offer" ADD CONSTRAINT "partner_offer_partner_id_partner_partner_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partner_partner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centrix_service_contract" ADD CONSTRAINT "centrix_service_contract_unit_id_centrix_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."centrix_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centrix_service_contract" ADD CONSTRAINT "centrix_service_contract_party_id_centrix_party_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."centrix_party"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_service_order" ADD CONSTRAINT "partner_service_order_offer_id_partner_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."partner_offer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_service_order" ADD CONSTRAINT "partner_service_order_partner_id_partner_partner_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partner_partner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_service_order" ADD CONSTRAINT "partner_service_order_unit_id_centrix_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."centrix_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_service_order" ADD CONSTRAINT "partner_service_order_party_id_centrix_party_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."centrix_party"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_service_order" ADD CONSTRAINT "partner_service_order_consent_id_partner_consent_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."partner_consent"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centrix_unit" ADD CONSTRAINT "centrix_unit_building_id_centrix_building_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."centrix_building"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centrix_work_order" ADD CONSTRAINT "centrix_work_order_case_id_centrix_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."centrix_case"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centrix_work_order" ADD CONSTRAINT "centrix_work_order_contractor_id_centrix_party_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."centrix_party"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workflow_run" ADD CONSTRAINT "ai_workflow_run_event_id_centrix_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."centrix_event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_idempotency_unique" ON "ai_audit_event" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "service_order_workflow_unique" ON "partner_service_order" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_event_partner_unique" ON "ai_workflow_run" USING btree ("event_id","partner_id");