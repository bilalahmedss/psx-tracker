CREATE TYPE "public"."calendar_status" AS ENUM('confirmed', 'to_confirm');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('running', 'success', 'skipped', 'failed');--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"status" "job_status" DEFAULT 'running' NOT NULL,
	"source" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"rows" integer,
	"message" text
);
--> statement-breakpoint
ALTER TABLE "job_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "market_holidays" (
	"date" date PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" "calendar_status" DEFAULT 'to_confirm' NOT NULL,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "market_holidays" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "market_sessions" (
	"date" date PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sessions" jsonb NOT NULL,
	"status" "calendar_status" DEFAULT 'to_confirm' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "market_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "prices_latest" (
	"symbol" text PRIMARY KEY NOT NULL,
	"price" numeric(14, 4) NOT NULL,
	"prev_close" numeric(14, 4),
	"change" numeric(14, 4),
	"change_pct" numeric(10, 4),
	"open" numeric(14, 4),
	"high" numeric(14, 4),
	"low" numeric(14, 4),
	"volume" bigint,
	"as_of" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"delayed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prices_latest" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "prices_latest" ADD CONSTRAINT "prices_latest_symbol_securities_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."securities"("symbol") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_runs_job_started_idx" ON "job_runs" USING btree ("job","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_one_running" ON "job_runs" USING btree ("job") WHERE status = 'running';--> statement-breakpoint
CREATE POLICY "job_runs_select_all" ON "job_runs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "market_holidays_select_all" ON "market_holidays" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "market_sessions_select_all" ON "market_sessions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "prices_latest_select_all" ON "prices_latest" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);