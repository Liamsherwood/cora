ALTER TABLE "ticket_agent_runs" DROP CONSTRAINT "ticket_agent_runs_send_status";--> statement-breakpoint
ALTER TABLE "ticket_agent_runs" ALTER COLUMN "model" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "maintenance_tickets" ADD COLUMN "classification" jsonb;--> statement-breakpoint
ALTER TABLE "ticket_agent_runs" ADD COLUMN "conversation_id" text;--> statement-breakpoint
ALTER TABLE "ticket_agent_runs" ADD COLUMN "classification" jsonb;--> statement-breakpoint
ALTER TABLE "ticket_agent_runs" ADD CONSTRAINT "ticket_agent_runs_send_status" CHECK ("ticket_agent_runs"."send_status" IN ('unconfirmed', 'accepted', 'failed', 'returned'));