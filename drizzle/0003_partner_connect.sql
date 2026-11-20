ALTER TABLE "consents" ADD COLUMN "workflow_run_id" uuid;--> statement-breakpoint
ALTER TABLE "consents" ADD COLUMN "purpose" text;--> statement-breakpoint
ALTER TABLE "partner_offers" ADD COLUMN "key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "manifest" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "workflow_run_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "shared_payload" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "contract_status" text;--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "monthly_price_eur" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "bridge" jsonb;--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "street" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "postcode" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "actor" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "from_state" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "to_state" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "cost_eur" numeric(12, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "role" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "partner_id" uuid;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "offer_id" uuid;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "offer" jsonb;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_offer_partner_fk" FOREIGN KEY ("offer_id","partner_id") REFERENCES "public"."partner_offers"("id","partner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consents_workflow_run_idx" ON "consents" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE INDEX "service_orders_partner_idx" ON "service_orders" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_partner_idx" ON "workflow_runs" USING btree ("partner_id");--> statement-breakpoint
ALTER TABLE "partner_offers" ADD CONSTRAINT "partner_offers_partner_key_key" UNIQUE("partner_id","key");--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_slug_key" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_workflow_run_key" UNIQUE("workflow_run_id");--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_idempotency_key" UNIQUE("idempotency_key");--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_event_partner_key" UNIQUE("event_id","partner_id");--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_status_known" CHECK ("service_orders"."status" IN ('sent', 'accepted', 'scheduled', 'active', 'rejected'));--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_contract_status_known" CHECK ("service_orders"."contract_status" IN ('signed', 'active', 'cancelled'));--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_price_nonnegative" CHECK ("service_orders"."monthly_price_eur" >= 0 AND "service_orders"."monthly_price_eur" <> 'NaN'::numeric);--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_cost_nonnegative" CHECK ("audit_events"."cost_eur" >= 0 AND "audit_events"."cost_eur" <> 'NaN'::numeric);--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_role_known" CHECK ("messages"."role" IN ('agent', 'tenant', 'system', 'partner'));--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_state_known" CHECK ("workflow_runs"."state" IN ('detected', 'offer_sent', 'consent_given', 'ordered', 'confirmed', 'active', 'closed', 'no_eligible_offer', 'declined', 'rejected'));