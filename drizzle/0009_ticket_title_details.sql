ALTER TABLE "maintenance_tickets" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "maintenance_tickets" ADD COLUMN "details" jsonb;--> statement-breakpoint
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_title_length" CHECK (length("maintenance_tickets"."title") between 1 and 80);