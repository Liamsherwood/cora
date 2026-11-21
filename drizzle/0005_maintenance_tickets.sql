CREATE TABLE "maintenance_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_key" text NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "maintenance_tickets_summary_length" CHECK (length("maintenance_tickets"."summary") between 1 and 400)
);
--> statement-breakpoint
ALTER TABLE "maintenance_tickets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ticket_agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"message_key" text NOT NULL,
	"agent" text NOT NULL,
	"model" text NOT NULL,
	"gateway_generation_id" text,
	"started_at" timestamp with time zone NOT NULL,
	"ticket_change" text NOT NULL,
	"reply_type" text NOT NULL,
	"send_status" text DEFAULT 'unconfirmed' NOT NULL,
	CONSTRAINT "ticket_agent_runs_message_key_unique" UNIQUE("message_key"),
	CONSTRAINT "ticket_agent_runs_ticket_change" CHECK ("ticket_agent_runs"."ticket_change" IN ('opened', 'updated', 'none')),
	CONSTRAINT "ticket_agent_runs_reply_type" CHECK ("ticket_agent_runs"."reply_type" IN ('generated', 'fallback')),
	CONSTRAINT "ticket_agent_runs_send_status" CHECK ("ticket_agent_runs"."send_status" IN ('unconfirmed', 'accepted', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "ticket_agent_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ticket_agent_runs" ADD CONSTRAINT "ticket_agent_runs_ticket_id_maintenance_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."maintenance_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "maintenance_tickets_open_thread_idx" ON "maintenance_tickets" USING btree ("thread_key") WHERE "maintenance_tickets"."resolved_at" IS NULL;--> statement-breakpoint
CREATE INDEX "maintenance_tickets_inbox_idx" ON "maintenance_tickets" USING btree ("updated_at","id");--> statement-breakpoint
CREATE INDEX "ticket_agent_runs_timeline_idx" ON "ticket_agent_runs" USING btree ("ticket_id","started_at","id");