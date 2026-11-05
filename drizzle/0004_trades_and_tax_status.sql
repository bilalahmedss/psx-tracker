CREATE TABLE "portfolio_tax_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"status" "tax_status" NOT NULL,
	"effective_from" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portfolio_tax_status" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dividend_receipts" DROP CONSTRAINT "dividend_receipts_non_negative";--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_positive";--> statement-breakpoint
ALTER TABLE "dividend_receipts" ADD COLUMN "shares" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "dividend_receipts" ADD COLUMN "dps" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "dividend_receipts" ADD COLUMN "affects_cash" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dividend_receipts" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "other_charges" numeric(18, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "portfolio_tax_status" ADD CONSTRAINT "portfolio_tax_status_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_tax_status_portfolio_date_key" ON "portfolio_tax_status" USING btree ("portfolio_id","effective_from");--> statement-breakpoint
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_manual_types" CHECK (type in ('deposit', 'withdrawal', 'adjustment', 'deduction'));--> statement-breakpoint
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_sign" CHECK ((type = 'deposit' and amount > 0) or (type in ('withdrawal', 'deduction') and amount < 0) or (type = 'adjustment' and amount <> 0));--> statement-breakpoint
ALTER TABLE "cgt_rules" ADD CONSTRAINT "cgt_rules_non_filer_floor" CHECK (non_filer_rate >= 0.15);--> statement-breakpoint
ALTER TABLE "dividend_receipts" ADD CONSTRAINT "dividend_receipts_non_negative" CHECK (gross >= 0 and wht >= 0 and zakat_deducted >= 0 and net >= 0);--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_positive" CHECK (qty > 0 and price >= 0 and fee >= 0 and tax >= 0 and other_charges >= 0);--> statement-breakpoint
CREATE POLICY "portfolio_tax_status_select_own" ON "portfolio_tax_status" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from public.portfolios p where p.id = portfolio_tax_status.portfolio_id and p.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "portfolio_tax_status_insert_own" ON "portfolio_tax_status" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (exists (select 1 from public.portfolios p where p.id = portfolio_tax_status.portfolio_id and p.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "portfolio_tax_status_update_own" ON "portfolio_tax_status" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (exists (select 1 from public.portfolios p where p.id = portfolio_tax_status.portfolio_id and p.user_id = (select auth.uid()))) WITH CHECK (exists (select 1 from public.portfolios p where p.id = portfolio_tax_status.portfolio_id and p.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "portfolio_tax_status_delete_own" ON "portfolio_tax_status" AS PERMISSIVE FOR DELETE TO "authenticated" USING (exists (select 1 from public.portfolios p where p.id = portfolio_tax_status.portfolio_id and p.user_id = (select auth.uid())));