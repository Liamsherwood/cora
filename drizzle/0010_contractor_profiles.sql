CREATE TABLE "contractor_profiles" (
	"party_id" uuid PRIMARY KEY NOT NULL,
	"trades" text[] NOT NULL,
	"base_city" text NOT NULL,
	"service_radius_km" integer NOT NULL,
	"emergency_service" boolean DEFAULT false NOT NULL,
	CONSTRAINT "contractor_profiles_trades_nonempty" CHECK (cardinality("contractor_profiles"."trades") > 0),
	CONSTRAINT "contractor_profiles_radius_positive" CHECK ("contractor_profiles"."service_radius_km" > 0)
);
--> statement-breakpoint
ALTER TABLE "contractor_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contractor_profiles" ADD CONSTRAINT "contractor_profiles_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;