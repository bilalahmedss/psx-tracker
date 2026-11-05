CREATE TABLE "api_usage" (
	"provider" text NOT NULL,
	"day" date NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_usage_provider_day_pk" PRIMARY KEY("provider","day"),
	CONSTRAINT "api_usage_calls_nonneg" CHECK ("api_usage"."calls" >= 0)
);
--> statement-breakpoint
ALTER TABLE "api_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "api_usage_select_all" ON "api_usage" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);