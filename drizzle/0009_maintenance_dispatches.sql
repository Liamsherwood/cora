CREATE TABLE "maintenance_dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_key" text NOT NULL,
	"property_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"priority" text NOT NULL,
	"category" text NOT NULL,
	"status" text NOT NULL,
	"steps" jsonb NOT NULL,
	"contractor_id" uuid,
	"contractor_phone" text,
	"slot_start" timestamp with time zone,
	"case_id" uuid,
	"work_order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_dispatches_request_key_unique" UNIQUE("request_key"),
	CONSTRAINT "maintenance_dispatches_status" CHECK ("maintenance_dispatches"."status" IN ('working', 'waiting', 'done', 'failed')),
	CONSTRAINT "maintenance_dispatches_priority" CHECK ("maintenance_dispatches"."priority" IN ('Routine', 'High', 'Urgent'))
);
--> statement-breakpoint
ALTER TABLE "maintenance_dispatches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "maintenance_dispatches" ADD CONSTRAINT "maintenance_dispatches_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_dispatches" ADD CONSTRAINT "maintenance_dispatches_contractor_id_parties_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_dispatches" ADD CONSTRAINT "maintenance_dispatches_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_dispatches" ADD CONSTRAINT "maintenance_dispatches_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "maintenance_dispatches_reply_idx" ON "maintenance_dispatches" USING btree ("contractor_phone") WHERE "maintenance_dispatches"."status" = 'waiting';