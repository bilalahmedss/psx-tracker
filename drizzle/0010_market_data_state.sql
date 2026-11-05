CREATE TABLE "market_data_state" (
	"job" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"quote_mode" text NOT NULL,
	"tracked_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"data_day" date,
	"symbols_synced_at" timestamp with time zone,
	"message" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "market_data_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "market_data_state_select_all" ON "market_data_state" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);