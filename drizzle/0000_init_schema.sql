CREATE TYPE "public"."alert_channel" AS ENUM('web_push', 'email');--> statement-breakpoint
CREATE TYPE "public"."alert_kind" AS ENUM('price', 'pnl', 'notice', 'volume');--> statement-breakpoint
CREATE TYPE "public"."cash_entry_type" AS ENUM('deposit', 'withdrawal', 'buy', 'sell', 'dividend', 'deduction', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."corporate_action_type" AS ENUM('cash_dividend', 'bonus', 'right', 'split');--> statement-breakpoint
CREATE TYPE "public"."entry_source" AS ENUM('manual', 'csv', 'pdf', 'email', 'image');--> statement-breakpoint
CREATE TYPE "public"."import_channel" AS ENUM('email', 'pdf', 'image', 'csv');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('pending', 'processing', 'needs_review', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."parsed_row_kind" AS ENUM('trade', 'dividend', 'cash');--> statement-breakpoint
CREATE TYPE "public"."parsed_row_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."tax_status" AS ENUM('filer', 'non_filer');--> statement-breakpoint
CREATE TYPE "public"."txn_type" AS ENUM('buy', 'sell', 'bonus', 'split', 'transfer_in', 'transfer_out');--> statement-breakpoint
CREATE TABLE "alert_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" uuid NOT NULL,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"delivered" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"kind" "alert_kind" NOT NULL,
	"symbol" text,
	"portfolio_id" uuid,
	"condition" jsonb NOT NULL,
	"channel" "alert_channel" DEFAULT 'web_push' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "brokers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"default_fee_profile_id" uuid,
	"parser_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sender_emails" text[] DEFAULT '{}'::text[] NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brokers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "brokers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cash_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"type" "cash_entry_type" NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"linked_txn_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cash_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cgt_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"filer_rate" numeric(10, 6) NOT NULL,
	"non_filer_rate" numeric(10, 6) NOT NULL,
	"effective_from" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cgt_rules_rate_range" CHECK (filer_rate >= 0 and filer_rate < 1 and non_filer_rate >= 0 and non_filer_rate < 1)
);
--> statement-breakpoint
ALTER TABLE "cgt_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "corporate_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"type" "corporate_action_type" NOT NULL,
	"amount" numeric(14, 4),
	"ratio" numeric(12, 6),
	"xd_date" date,
	"book_closure_from" date,
	"book_closure_to" date,
	"announced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "corporate_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dashboard_layouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"name" text DEFAULT 'Default' NOT NULL,
	"widgets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dashboard_layouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dividend_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"corporate_action_id" uuid,
	"gross" numeric(18, 4) NOT NULL,
	"wht" numeric(18, 4) DEFAULT '0' NOT NULL,
	"zakat_deducted" numeric(18, 4) DEFAULT '0' NOT NULL,
	"net" numeric(18, 4) NOT NULL,
	"paid_on" date NOT NULL,
	"source" "entry_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dividend_receipts_non_negative" CHECK (gross >= 0 and wht >= 0 and zakat_deducted >= 0)
);
--> statement-breakpoint
ALTER TABLE "dividend_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fee_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"threshold" numeric(14, 4) NOT NULL,
	"pct_above" numeric(10, 6) NOT NULL,
	"per_share_below" numeric(14, 4) NOT NULL,
	"fed_pct" numeric(10, 6) NOT NULL,
	"min_fee" numeric(18, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_profiles_non_negative" CHECK (threshold >= 0 and pct_above >= 0 and per_share_below >= 0 and fed_pct >= 0 and min_fee >= 0),
	CONSTRAINT "fee_profiles_sane_rates" CHECK (pct_above < 0.1 and fed_pct < 1)
);
--> statement-breakpoint
ALTER TABLE "fee_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"portfolio_id" uuid,
	"channel" "import_channel" NOT NULL,
	"file_url" text,
	"status" "import_status" DEFAULT 'pending' NOT NULL,
	"parser_used" text,
	"raw_text" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"buy_txn_id" uuid NOT NULL,
	"qty_open" numeric(18, 4) NOT NULL,
	"cost_basis" numeric(18, 4) NOT NULL,
	"acquired_on" date NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text,
	"title" text NOT NULL,
	"pdf_url" text,
	"published_at" timestamp with time zone NOT NULL,
	"ai_summary" text,
	"category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "parsed_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_job_id" uuid NOT NULL,
	"kind" "parsed_row_kind" NOT NULL,
	"data" jsonb NOT NULL,
	"status" "parsed_row_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "parsed_rows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "portfolios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"name" text NOT NULL,
	"broker_id" uuid,
	"tax_status" "tax_status" DEFAULT 'filer' NOT NULL,
	"cgt_rule_id" uuid,
	"fee_profile_id" uuid,
	"sync_address" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portfolios_sync_address_unique" UNIQUE("sync_address"),
	CONSTRAINT "portfolios_name_length" CHECK (char_length(name) between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "portfolios" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "prices" (
	"symbol" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"open" numeric(14, 4),
	"high" numeric(14, 4),
	"low" numeric(14, 4),
	"close" numeric(14, 4) NOT NULL,
	"volume" bigint,
	CONSTRAINT "prices_symbol_ts_pk" PRIMARY KEY("symbol","ts")
);
--> statement-breakpoint
ALTER TABLE "prices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text,
	"name" text,
	"auth_provider" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "realized_gains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"sell_txn_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"qty" numeric(18, 4) NOT NULL,
	"gain" numeric(18, 4) NOT NULL,
	"holding_days" integer NOT NULL,
	"cgt_rate" numeric(10, 6) NOT NULL,
	"cgt" numeric(18, 4) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "realized_gains" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "securities" (
	"symbol" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sector" text,
	"is_shariah" boolean DEFAULT false NOT NULL,
	"is_etf" boolean DEFAULT false NOT NULL,
	"shares_out" numeric(20, 0),
	"free_float" numeric(20, 0),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "securities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "snapshots" (
	"portfolio_id" uuid NOT NULL,
	"date" date NOT NULL,
	"market_value" numeric(18, 4) NOT NULL,
	"cost" numeric(18, 4) NOT NULL,
	"cash" numeric(18, 4) NOT NULL,
	CONSTRAINT "snapshots_portfolio_id_date_pk" PRIMARY KEY("portfolio_id","date")
);
--> statement-breakpoint
ALTER TABLE "snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"type" "txn_type" NOT NULL,
	"qty" numeric(18, 4) NOT NULL,
	"price" numeric(14, 4) DEFAULT '0' NOT NULL,
	"fee" numeric(18, 4) DEFAULT '0' NOT NULL,
	"tax" numeric(18, 4) DEFAULT '0' NOT NULL,
	"trade_date" date NOT NULL,
	"settle_date" date,
	"source" "entry_source" DEFAULT 'manual' NOT NULL,
	"import_job_id" uuid,
	"affects_cash" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_positive" CHECK (qty > 0 and price >= 0 and fee >= 0 and tax >= 0)
);
--> statement-breakpoint
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "watchlists" (
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"symbol" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watchlists_user_id_symbol_pk" PRIMARY KEY("user_id","symbol")
);
--> statement-breakpoint
ALTER TABLE "watchlists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "zakat_settings" (
	"user_id" uuid PRIMARY KEY DEFAULT auth.uid() NOT NULL,
	"hijri_month" smallint,
	"hijri_day" smallint,
	"method" text DEFAULT 'market_value' NOT NULL,
	"purification_pct" numeric(10, 6) DEFAULT '0.05' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zakat_settings_hijri" CHECK ((hijri_month is null or hijri_month between 1 and 12) and (hijri_day is null or hijri_day between 1 and 30))
);
--> statement-breakpoint
ALTER TABLE "zakat_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_symbol_securities_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."securities"("symbol") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokers" ADD CONSTRAINT "brokers_default_fee_profile_id_fee_profiles_id_fk" FOREIGN KEY ("default_fee_profile_id") REFERENCES "public"."fee_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_linked_txn_id_transactions_id_fk" FOREIGN KEY ("linked_txn_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cgt_rules" ADD CONSTRAINT "cgt_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_actions" ADD CONSTRAINT "corporate_actions_symbol_securities_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."securities"("symbol") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_layouts" ADD CONSTRAINT "dashboard_layouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dividend_receipts" ADD CONSTRAINT "dividend_receipts_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dividend_receipts" ADD CONSTRAINT "dividend_receipts_symbol_securities_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."securities"("symbol") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dividend_receipts" ADD CONSTRAINT "dividend_receipts_corporate_action_id_corporate_actions_id_fk" FOREIGN KEY ("corporate_action_id") REFERENCES "public"."corporate_actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_profiles" ADD CONSTRAINT "fee_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_buy_txn_id_transactions_id_fk" FOREIGN KEY ("buy_txn_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_symbol_securities_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."securities"("symbol") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parsed_rows" ADD CONSTRAINT "parsed_rows_import_job_id_import_jobs_id_fk" FOREIGN KEY ("import_job_id") REFERENCES "public"."import_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_cgt_rule_id_cgt_rules_id_fk" FOREIGN KEY ("cgt_rule_id") REFERENCES "public"."cgt_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_fee_profile_id_fee_profiles_id_fk" FOREIGN KEY ("fee_profile_id") REFERENCES "public"."fee_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_symbol_securities_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."securities"("symbol") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "realized_gains" ADD CONSTRAINT "realized_gains_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "realized_gains" ADD CONSTRAINT "realized_gains_sell_txn_id_transactions_id_fk" FOREIGN KEY ("sell_txn_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "realized_gains" ADD CONSTRAINT "realized_gains_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_symbol_securities_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."securities"("symbol") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_job_id_import_jobs_id_fk" FOREIGN KEY ("import_job_id") REFERENCES "public"."import_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_symbol_securities_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."securities"("symbol") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zakat_settings" ADD CONSTRAINT "zakat_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alert_events_alert_id_idx" ON "alert_events" USING btree ("alert_id");--> statement-breakpoint
CREATE INDEX "alerts_user_id_idx" ON "alerts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cash_entries_portfolio_idx" ON "cash_entries" USING btree ("portfolio_id","date");--> statement-breakpoint
CREATE INDEX "cgt_rules_user_id_idx" ON "cgt_rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "corporate_actions_symbol_idx" ON "corporate_actions" USING btree ("symbol","xd_date");--> statement-breakpoint
CREATE INDEX "dashboard_layouts_user_id_idx" ON "dashboard_layouts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dividend_receipts_portfolio_idx" ON "dividend_receipts" USING btree ("portfolio_id","symbol");--> statement-breakpoint
CREATE INDEX "fee_profiles_user_id_idx" ON "fee_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "import_jobs_user_id_idx" ON "import_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "import_jobs_portfolio_id_idx" ON "import_jobs" USING btree ("portfolio_id");--> statement-breakpoint
CREATE INDEX "lots_portfolio_symbol_idx" ON "lots" USING btree ("portfolio_id","symbol");--> statement-breakpoint
CREATE INDEX "notices_symbol_idx" ON "notices" USING btree ("symbol","published_at");--> statement-breakpoint
CREATE INDEX "parsed_rows_import_job_id_idx" ON "parsed_rows" USING btree ("import_job_id");--> statement-breakpoint
CREATE INDEX "portfolios_user_id_idx" ON "portfolios" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolios_user_name_key" ON "portfolios" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "portfolios_one_default_per_user" ON "portfolios" USING btree ("user_id") WHERE is_default;--> statement-breakpoint
CREATE INDEX "realized_gains_portfolio_idx" ON "realized_gains" USING btree ("portfolio_id");--> statement-breakpoint
CREATE INDEX "transactions_portfolio_symbol_idx" ON "transactions" USING btree ("portfolio_id","symbol","trade_date");--> statement-breakpoint
CREATE POLICY "alert_events_select_own" ON "alert_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from public.alerts a where a.id = alert_events.alert_id and a.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "alerts_select_own" ON "alerts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "alerts_insert_own" ON "alerts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()) and (alerts.portfolio_id is null or exists (select 1 from public.portfolios p where p.id = alerts.portfolio_id and p.user_id = (select auth.uid()))));--> statement-breakpoint
CREATE POLICY "alerts_update_own" ON "alerts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()) and (alerts.portfolio_id is null or exists (select 1 from public.portfolios p where p.id = alerts.portfolio_id and p.user_id = (select auth.uid()))));--> statement-breakpoint
CREATE POLICY "alerts_delete_own" ON "alerts" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "brokers_select_all" ON "brokers" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "cash_entries_select_own" ON "cash_entries" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from public.portfolios p where p.id = cash_entries.portfolio_id and p.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "cash_entries_insert_own" ON "cash_entries" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (exists (select 1 from public.portfolios p where p.id = cash_entries.portfolio_id and p.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "cash_entries_update_own" ON "cash_entries" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (exists (select 1 from public.portfolios p where p.id = cash_entries.portfolio_id and p.user_id = (select auth.uid()))) WITH CHECK (exists (select 1 from public.portfolios p where p.id = cash_entries.portfolio_id and p.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "cash_entries_delete_own" ON "cash_entries" AS PERMISSIVE FOR DELETE TO "authenticated" USING (exists (select 1 from public.portfolios p where p.id = cash_entries.portfolio_id and p.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "cgt_rules_select_system_or_own" ON "cgt_rules" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id is null or user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "cgt_rules_insert_own" ON "cgt_rules" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "cgt_rules_update_own" ON "cgt_rules" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "cgt_rules_delete_own" ON "cgt_rules" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "corporate_actions_select_all" ON "corporate_actions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "dashboard_layouts_select_own" ON "dashboard_layouts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "dashboard_layouts_insert_own" ON "dashboard_layouts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "dashboard_layouts_update_own" ON "dashboard_layouts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "dashboard_layouts_delete_own" ON "dashboard_layouts" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "dividend_receipts_select_own" ON "dividend_receipts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from public.portfolios p where p.id = dividend_receipts.portfolio_id and p.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "dividend_receipts_insert_own" ON "dividend_receipts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (exists (select 1 from public.portfolios p where p.id = dividend_receipts.portfolio_id and p.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "dividend_receipts_update_own" ON "dividend_receipts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (exists (select 1 from public.portfolios p where p.id = dividend_receipts.portfolio_id and p.user_id = (select auth.uid()))) WITH CHECK (exists (select 1 from public.portfolios p where p.id = dividend_receipts.portfolio_id and p.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "dividend_receipts_delete_own" ON "dividend_receipts" AS PERMISSIVE FOR DELETE TO "authenticated" USING (exists (select 1 from public.portfolios p where p.id = dividend_receipts.portfolio_id and p.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "fee_profiles_select_system_or_own" ON "fee_profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id is null or user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "fee_profiles_insert_own" ON "fee_profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "fee_profiles_update_own" ON "fee_profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "fee_profiles_delete_own" ON "fee_profiles" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "import_jobs_select_own" ON "import_jobs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "import_jobs_insert_own" ON "import_jobs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()) and (import_jobs.portfolio_id is null or exists (select 1 from public.portfolios p where p.id = import_jobs.portfolio_id and p.user_id = (select auth.uid()))));--> statement-breakpoint
CREATE POLICY "import_jobs_update_own" ON "import_jobs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()) and (import_jobs.portfolio_id is null or exists (select 1 from public.portfolios p where p.id = import_jobs.portfolio_id and p.user_id = (select auth.uid()))));--> statement-breakpoint
CREATE POLICY "import_jobs_delete_own" ON "import_jobs" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "lots_select_own" ON "lots" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from public.portfolios p where p.id = lots.portfolio_id and p.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "notices_select_all" ON "notices" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "parsed_rows_select_own" ON "parsed_rows" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from public.import_jobs j where j.id = parsed_rows.import_job_id and j.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "parsed_rows_insert_own" ON "parsed_rows" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (exists (select 1 from public.import_jobs j where j.id = parsed_rows.import_job_id and j.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "parsed_rows_update_own" ON "parsed_rows" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (exists (select 1 from public.import_jobs j where j.id = parsed_rows.import_job_id and j.user_id = (select auth.uid()))) WITH CHECK (exists (select 1 from public.import_jobs j where j.id = parsed_rows.import_job_id and j.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "parsed_rows_delete_own" ON "parsed_rows" AS PERMISSIVE FOR DELETE TO "authenticated" USING (exists (select 1 from public.import_jobs j where j.id = parsed_rows.import_job_id and j.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "portfolios_select_own" ON "portfolios" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "portfolios_insert_own" ON "portfolios" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()) and (portfolios.fee_profile_id is null or exists (select 1 from public.fee_profiles f where f.id = portfolios.fee_profile_id and f.user_id = (select auth.uid()))) and (portfolios.cgt_rule_id is null or exists (select 1 from public.cgt_rules c where c.id = portfolios.cgt_rule_id and c.user_id = (select auth.uid()))));--> statement-breakpoint
CREATE POLICY "portfolios_update_own" ON "portfolios" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()) and (portfolios.fee_profile_id is null or exists (select 1 from public.fee_profiles f where f.id = portfolios.fee_profile_id and f.user_id = (select auth.uid()))) and (portfolios.cgt_rule_id is null or exists (select 1 from public.cgt_rules c where c.id = portfolios.cgt_rule_id and c.user_id = (select auth.uid()))));--> statement-breakpoint
CREATE POLICY "portfolios_delete_own" ON "portfolios" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "prices_select_all" ON "prices" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "profiles_select_own" ON "profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "profiles_update_own" ON "profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (id = (select auth.uid())) WITH CHECK (id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "realized_gains_select_own" ON "realized_gains" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from public.portfolios p where p.id = realized_gains.portfolio_id and p.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "securities_select_all" ON "securities" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "snapshots_select_own" ON "snapshots" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from public.portfolios p where p.id = snapshots.portfolio_id and p.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "transactions_select_own" ON "transactions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from public.portfolios p where p.id = transactions.portfolio_id and p.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "transactions_insert_own" ON "transactions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (exists (select 1 from public.portfolios p where p.id = transactions.portfolio_id and p.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "transactions_update_own" ON "transactions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (exists (select 1 from public.portfolios p where p.id = transactions.portfolio_id and p.user_id = (select auth.uid()))) WITH CHECK (exists (select 1 from public.portfolios p where p.id = transactions.portfolio_id and p.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "transactions_delete_own" ON "transactions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (exists (select 1 from public.portfolios p where p.id = transactions.portfolio_id and p.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "watchlists_select_own" ON "watchlists" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "watchlists_insert_own" ON "watchlists" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "watchlists_update_own" ON "watchlists" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "watchlists_delete_own" ON "watchlists" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "zakat_settings_select_own" ON "zakat_settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "zakat_settings_insert_own" ON "zakat_settings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "zakat_settings_update_own" ON "zakat_settings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "zakat_settings_delete_own" ON "zakat_settings" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()));