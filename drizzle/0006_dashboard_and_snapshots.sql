ALTER TABLE "portfolios" ADD COLUMN "snapshots_stale" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "snapshots" ADD COLUMN "estimated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_layouts_user_name_key" ON "dashboard_layouts" USING btree ("user_id","name");