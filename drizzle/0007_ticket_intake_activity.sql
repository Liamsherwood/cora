CREATE TABLE "ticket_intakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid,
	"sending_reply" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '60 seconds' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_intakes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ticket_intakes" ADD CONSTRAINT "ticket_intakes_ticket_id_maintenance_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."maintenance_tickets"("id") ON DELETE cascade ON UPDATE no action;