CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"unit_id" uuid,
	"reporter_party_id" uuid,
	"asset_id" uuid,
	"category" text NOT NULL,
	"priority" text NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"type" text NOT NULL,
	"url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"unit_id" uuid NOT NULL,
	"party_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"contractor_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone,
	"cost_estimate_eur" numeric(14, 2),
	"payer" text,
	"status" text NOT NULL,
	CONSTRAINT "work_orders_cost_nonnegative" CHECK ("work_orders"."cost_estimate_eur" >= 0 AND "work_orders"."cost_estimate_eur" <> 'NaN'::numeric)
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"data_shared" text[] NOT NULL,
	"channel" text NOT NULL,
	"given_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "consents_id_party_partner_key" UNIQUE("id","party_id","partner_id"),
	CONSTRAINT "consents_dates_ordered" CHECK ("consents"."revoked_at" >= "consents"."given_at")
);
--> statement-breakpoint
CREATE TABLE "partner_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"product" text NOT NULL,
	"monthly_price_eur" numeric(14, 2),
	"lead_time_days" integer,
	"eligibility" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "partner_offers_id_partner_key" UNIQUE("id","partner_id"),
	CONSTRAINT "partner_offers_lead_time_nonnegative" CHECK ("partner_offers"."lead_time_days" >= 0),
	CONSTRAINT "partner_offers_price_nonnegative" CHECK ("partner_offers"."monthly_price_eur" >= 0 AND "partner_offers"."monthly_price_eur" <> 'NaN'::numeric)
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"regions" text[] DEFAULT '{}' NOT NULL,
	"channels" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"consent_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"unit_id" uuid,
	"asset_type" text NOT NULL,
	"ownership_scope" text NOT NULL,
	CONSTRAINT "assets_id_property_key" UNIQUE("id","property_id")
);
--> statement-breakpoint
CREATE TABLE "buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"building_year" integer,
	"heating_type" text,
	"energy_class" text,
	CONSTRAINT "buildings_id_property_key" UNIQUE("id","property_id")
);
--> statement-breakpoint
CREATE TABLE "lease_parties" (
	"lease_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "lease_parties_lease_id_party_id_role_pk" PRIMARY KEY("lease_id","party_id","role")
);
--> statement-breakpoint
CREATE TABLE "leases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"rent_cold_eur" numeric(14, 2) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	CONSTRAINT "leases_dates_ordered" CHECK ("leases"."end_date" >= "leases"."start_date"),
	CONSTRAINT "leases_rent_nonnegative" CHECK ("leases"."rent_cold_eur" >= 0 AND "leases"."rent_cold_eur" <> 'NaN'::numeric)
);
--> statement-breakpoint
CREATE TABLE "mandates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"type" text NOT NULL,
	"approval_limit_eur" numeric(14, 2),
	CONSTRAINT "mandates_limit_nonnegative" CHECK ("mandates"."approval_limit_eur" >= 0 AND "mandates"."approval_limit_eur" <> 'NaN'::numeric)
);
--> statement-breakpoint
CREATE TABLE "meters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"type" text NOT NULL,
	"number" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ownerships" (
	"party_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"mea_share" numeric(18, 8),
	"valid_from" date NOT NULL,
	"valid_to" date,
	CONSTRAINT "ownerships_unit_id_party_id_valid_from_pk" PRIMARY KEY("unit_id","party_id","valid_from"),
	CONSTRAINT "ownerships_dates_ordered" CHECK ("ownerships"."valid_to" >= "ownerships"."valid_from"),
	CONSTRAINT "ownerships_share_nonnegative" CHECK ("ownerships"."mea_share" >= 0 AND "ownerships"."mea_share" <> 'NaN'::numeric)
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"whatsapp_opt_in" boolean DEFAULT false NOT NULL,
	"language" text
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address" text NOT NULL,
	"is_weg" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"identifier" text NOT NULL,
	"floor" integer,
	"size_sqm" integer,
	"rooms" integer,
	CONSTRAINT "units_id_building_key" UNIQUE("id","building_id"),
	CONSTRAINT "units_id_property_key" UNIQUE("id","property_id"),
	CONSTRAINT "units_building_identifier_key" UNIQUE("building_id","identifier"),
	CONSTRAINT "units_size_positive" CHECK ("units"."size_sqm" > 0),
	CONSTRAINT "units_rooms_nonnegative" CHECK ("units"."rooms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_run_id" uuid NOT NULL,
	"type" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_run_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"participants" text[] DEFAULT '{}' NOT NULL,
	"external_thread_id" text
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_party_id" uuid,
	"content" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"case_id" uuid,
	"state" text NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_reporter_party_id_parties_id_fk" FOREIGN KEY ("reporter_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_unit_property_fk" FOREIGN KEY ("unit_id","property_id") REFERENCES "public"."units"("id","property_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_asset_property_fk" FOREIGN KEY ("asset_id","property_id") REFERENCES "public"."assets"("id","property_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_contractor_id_parties_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_offers" ADD CONSTRAINT "partner_offers_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_offer_partner_fk" FOREIGN KEY ("offer_id","partner_id") REFERENCES "public"."partner_offers"("id","partner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_consent_party_partner_fk" FOREIGN KEY ("consent_id","party_id","partner_id") REFERENCES "public"."consents"("id","party_id","partner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_building_property_fk" FOREIGN KEY ("building_id","property_id") REFERENCES "public"."buildings"("id","property_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_unit_building_fk" FOREIGN KEY ("unit_id","building_id") REFERENCES "public"."units"("id","building_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_parties" ADD CONSTRAINT "lease_parties_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_parties" ADD CONSTRAINT "lease_parties_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meters" ADD CONSTRAINT "meters_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownerships" ADD CONSTRAINT "ownerships_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownerships" ADD CONSTRAINT "ownerships_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_building_property_fk" FOREIGN KEY ("building_id","property_id") REFERENCES "public"."buildings"("id","property_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_party_id_parties_id_fk" FOREIGN KEY ("sender_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cases_property_status_idx" ON "cases" USING btree ("property_id","status");--> statement-breakpoint
CREATE INDEX "cases_unit_idx" ON "cases" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "cases_reporter_idx" ON "cases" USING btree ("reporter_party_id");--> statement-breakpoint
CREATE INDEX "cases_asset_idx" ON "cases" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "documents_case_idx" ON "documents" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "events_unit_occurred_idx" ON "events" USING btree ("unit_id","occurred_at");--> statement-breakpoint
CREATE INDEX "events_party_idx" ON "events" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "work_orders_case_idx" ON "work_orders" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "work_orders_contractor_schedule_idx" ON "work_orders" USING btree ("contractor_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "consents_party_partner_idx" ON "consents" USING btree ("party_id","partner_id");--> statement-breakpoint
CREATE INDEX "consents_partner_idx" ON "consents" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "partner_offers_partner_idx" ON "partner_offers" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "service_orders_offer_idx" ON "service_orders" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "service_orders_unit_idx" ON "service_orders" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "service_orders_party_idx" ON "service_orders" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "service_orders_consent_idx" ON "service_orders" USING btree ("consent_id");--> statement-breakpoint
CREATE INDEX "assets_building_idx" ON "assets" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "assets_unit_idx" ON "assets" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "buildings_property_idx" ON "buildings" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "lease_parties_party_idx" ON "lease_parties" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "leases_unit_start_idx" ON "leases" USING btree ("unit_id","start_date");--> statement-breakpoint
CREATE INDEX "mandates_property_idx" ON "mandates" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "mandates_party_idx" ON "mandates" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "meters_unit_idx" ON "meters" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "ownerships_party_idx" ON "ownerships" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "audit_events_workflow_occurred_idx" ON "audit_events" USING btree ("workflow_run_id","occurred_at");--> statement-breakpoint
CREATE INDEX "conversations_workflow_run_idx" ON "conversations" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_sent_idx" ON "messages" USING btree ("conversation_id","sent_at");--> statement-breakpoint
CREATE INDEX "messages_sender_idx" ON "messages" USING btree ("sender_party_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_event_idx" ON "workflow_runs" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_case_idx" ON "workflow_runs" USING btree ("case_id");