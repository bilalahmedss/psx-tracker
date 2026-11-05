ALTER TABLE "market_data_state" ADD COLUMN "eod_attempt_day" date;--> statement-breakpoint
ALTER TABLE "market_data_state" ADD COLUMN "eod_attempts" integer DEFAULT 0 NOT NULL;