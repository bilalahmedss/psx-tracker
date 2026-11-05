ALTER TABLE "fee_profiles" ADD COLUMN "cdc_per_trade" numeric(18, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_profiles" ADD COLUMN "psx_levy_pct" numeric(12, 10) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_profiles" ADD COLUMN "secp_levy_pct" numeric(12, 10) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_profiles" ADD COLUMN "nccpl_levy_pct" numeric(12, 10) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_profiles" ADD CONSTRAINT "fee_profiles_charges_sane" CHECK (cdc_per_trade >= 0 and cdc_per_trade <= 10000 and psx_levy_pct >= 0 and secp_levy_pct >= 0 and nccpl_levy_pct >= 0 and psx_levy_pct + secp_levy_pct + nccpl_levy_pct < 0.01);