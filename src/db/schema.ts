// Database schema (PLAN.md §5). Source of truth for tables and RLS policies.
// Triggers, RPC functions and seed data live in the custom SQL migrations in /drizzle.
//
// RLS model:
//  - user-owned tables: owner only (user_id = auth.uid())
//  - portfolio-owned tables: owner of the parent portfolio only
//  - derived tables (lots, realized_gains, snapshots, alert_events): owner may read; jobs write
//  - shared market tables: any signed-in user may read; only jobs (privileged) write
//  - fee_profiles / cgt_rules: system defaults (user_id null) readable by all; user copies owner only
import { sql, type SQL } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgPolicy,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  check,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUid, authUsers } from "drizzle-orm/supabase";

// ---------- helpers ----------

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/** Rupee amounts: exact decimal, 4 dp to keep sub-paisa precision in intermediate values. */
const money = (name: string) => numeric(name, { precision: 18, scale: 4 });
/** Share quantities (bonus shares can be fractional before rounding). */
const qty = (name: string) => numeric(name, { precision: 18, scale: 4 });
/** Per-share prices. */
const price = (name: string) => numeric(name, { precision: 14, scale: 4 });
/** Rates stored as fractions: 0.15% => 0.0015, 15% => 0.15. */
const rate = (name: string) => numeric(name, { precision: 10, scale: 6 });

const isOwner = sql`user_id = ${authUid}`;

/** Full CRUD for the row owner. */
function ownerPolicies(table: string, extraCheck?: SQL) {
  const withCheck = extraCheck ? sql`${isOwner} and ${extraCheck}` : isOwner;
  return [
    pgPolicy(`${table}_select_own`, { for: "select", to: authenticatedRole, using: isOwner }),
    pgPolicy(`${table}_insert_own`, { for: "insert", to: authenticatedRole, withCheck }),
    pgPolicy(`${table}_update_own`, { for: "update", to: authenticatedRole, using: isOwner, withCheck }),
    pgPolicy(`${table}_delete_own`, { for: "delete", to: authenticatedRole, using: isOwner }),
  ];
}

/** True when the row's portfolio_id belongs to the current user. */
const ownsPortfolio = (table: string) =>
  sql.raw(
    `exists (select 1 from public.portfolios p where p.id = ${table}.portfolio_id and p.user_id = (select auth.uid()))`,
  );

function portfolioPolicies(table: string, readOnly = false) {
  const owns = ownsPortfolio(table);
  const select = pgPolicy(`${table}_select_own`, { for: "select", to: authenticatedRole, using: owns });
  if (readOnly) return [select];
  return [
    select,
    pgPolicy(`${table}_insert_own`, { for: "insert", to: authenticatedRole, withCheck: owns }),
    pgPolicy(`${table}_update_own`, { for: "update", to: authenticatedRole, using: owns, withCheck: owns }),
    pgPolicy(`${table}_delete_own`, { for: "delete", to: authenticatedRole, using: owns }),
  ];
}

/** Shared market data: read by any signed-in user; no write policy, so only privileged jobs write. */
const marketRead = (table: string) =>
  pgPolicy(`${table}_select_all`, { for: "select", to: authenticatedRole, using: sql`true` });

/** System defaults (user_id null) readable by all; user copies owner-only. */
function rulePolicies(table: string) {
  return [
    pgPolicy(`${table}_select_system_or_own`, {
      for: "select",
      to: authenticatedRole,
      using: sql`user_id is null or ${isOwner}`,
    }),
    pgPolicy(`${table}_insert_own`, { for: "insert", to: authenticatedRole, withCheck: isOwner }),
    pgPolicy(`${table}_update_own`, { for: "update", to: authenticatedRole, using: isOwner, withCheck: isOwner }),
    pgPolicy(`${table}_delete_own`, { for: "delete", to: authenticatedRole, using: isOwner }),
  ];
}

// ---------- enums ----------

export const taxStatus = pgEnum("tax_status", ["filer", "non_filer"]);
export const txnType = pgEnum("txn_type", ["buy", "sell", "bonus", "split", "transfer_in", "transfer_out"]);
export const entrySource = pgEnum("entry_source", ["manual", "csv", "pdf", "email", "image"]);
export const corporateActionType = pgEnum("corporate_action_type", ["cash_dividend", "bonus", "right", "split"]);
export const cashEntryType = pgEnum("cash_entry_type", [
  "deposit",
  "withdrawal",
  "buy",
  "sell",
  "dividend",
  "deduction",
  "adjustment",
]);
export const importChannel = pgEnum("import_channel", ["email", "pdf", "image", "csv"]);
export const importStatus = pgEnum("import_status", ["pending", "processing", "needs_review", "completed", "failed"]);
export const parsedRowKind = pgEnum("parsed_row_kind", ["trade", "dividend", "cash"]);
export const parsedRowStatus = pgEnum("parsed_row_status", ["pending", "accepted", "rejected"]);
export const alertKind = pgEnum("alert_kind", ["price", "pnl", "notice", "volume"]);
export const alertChannel = pgEnum("alert_channel", ["web_push", "email"]);

// ---------- users ----------

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    email: text("email"),
    name: text("name"),
    authProvider: text("auth_provider"),
    locale: text("locale").notNull().default("en"),
    theme: text("theme").notNull().default("system"),
    prefs: jsonb("prefs").notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [
    // Rows are created by the on-signup trigger; users can read and update their own.
    pgPolicy("profiles_select_own", { for: "select", to: authenticatedRole, using: sql`id = ${authUid}` }),
    pgPolicy("profiles_update_own", {
      for: "update",
      to: authenticatedRole,
      using: sql`id = ${authUid}`,
      withCheck: sql`id = ${authUid}`,
    }),
  ],
).enableRLS();

// ---------- rules ----------

export const feeProfiles = pgTable(
  "fee_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => authUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Price per share (Rs) at which the commission model switches. */
    threshold: price("threshold").notNull(),
    /** Commission as a fraction of trade value when price >= threshold. */
    pctAbove: rate("pct_above").notNull(),
    /** Commission in Rs per share when price < threshold. */
    perShareBelow: price("per_share_below").notNull(),
    /** Sales tax / FED on commission, as a fraction. */
    fedPct: rate("fed_pct").notNull(),
    /** Minimum commission per trade (Rs). */
    minFee: money("min_fee").notNull().default("0"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("fee_profiles_user_id_idx").on(t.userId),
    check("fee_profiles_non_negative", sql`threshold >= 0 and pct_above >= 0 and per_share_below >= 0 and fed_pct >= 0 and min_fee >= 0`),
    check("fee_profiles_sane_rates", sql`pct_above < 0.1 and fed_pct < 1`),
    ...rulePolicies("fee_profiles"),
  ],
).enableRLS();

export const cgtRules = pgTable(
  "cgt_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => authUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    filerRate: rate("filer_rate").notNull(),
    nonFilerRate: rate("non_filer_rate").notNull(),
    effectiveFrom: date("effective_from"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("cgt_rules_user_id_idx").on(t.userId),
    check("cgt_rules_rate_range", sql`filer_rate >= 0 and filer_rate < 1 and non_filer_rate >= 0 and non_filer_rate < 1`),
    // Non-ATL CGT follows income-tax slabs with a 15% floor (see src/lib/engine/tax-rules.ts).
    check("cgt_rules_non_filer_floor", sql`non_filer_rate >= 0.15`),
    ...rulePolicies("cgt_rules"),
  ],
).enableRLS();

// ---------- market (shared) ----------

export const brokers = pgTable(
  "brokers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    defaultFeeProfileId: uuid("default_fee_profile_id").references(() => feeProfiles.id, { onDelete: "set null" }),
    parserKeys: jsonb("parser_keys").notNull().default([]),
    senderEmails: text("sender_emails").array().notNull().default(sql`'{}'::text[]`),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: createdAt(),
  },
  () => [marketRead("brokers")],
).enableRLS();

export const securities = pgTable(
  "securities",
  {
    symbol: text("symbol").primaryKey(),
    name: text("name").notNull(),
    sector: text("sector"),
    isShariah: boolean("is_shariah").notNull().default(false),
    isEtf: boolean("is_etf").notNull().default(false),
    sharesOut: numeric("shares_out", { precision: 20, scale: 0 }),
    freeFloat: numeric("free_float", { precision: 20, scale: 0 }),
    updatedAt: updatedAt(),
  },
  () => [marketRead("securities")],
).enableRLS();

export const prices = pgTable(
  "prices",
  {
    symbol: text("symbol")
      .notNull()
      .references(() => securities.symbol, { onDelete: "cascade" }),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    open: price("open"),
    high: price("high"),
    low: price("low"),
    close: price("close").notNull(),
    volume: bigint("volume", { mode: "number" }),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.ts] }), marketRead("prices")],
).enableRLS();

export const corporateActions = pgTable(
  "corporate_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    symbol: text("symbol")
      .notNull()
      .references(() => securities.symbol, { onDelete: "cascade" }),
    type: corporateActionType("type").notNull(),
    /** Cash dividend per share (Rs). */
    amount: price("amount"),
    /** Bonus/right/split ratio, e.g. 0.1 for 10% bonus. */
    ratio: numeric("ratio", { precision: 12, scale: 6 }),
    xdDate: date("xd_date"),
    bookClosureFrom: date("book_closure_from"),
    bookClosureTo: date("book_closure_to"),
    announcedAt: timestamp("announced_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("corporate_actions_symbol_idx").on(t.symbol, t.xdDate), marketRead("corporate_actions")],
).enableRLS();

export const notices = pgTable(
  "notices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    symbol: text("symbol").references(() => securities.symbol, { onDelete: "cascade" }),
    title: text("title").notNull(),
    pdfUrl: text("pdf_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    aiSummary: text("ai_summary"),
    category: text("category"),
    createdAt: createdAt(),
  },
  (t) => [index("notices_symbol_idx").on(t.symbol, t.publishedAt), marketRead("notices")],
).enableRLS();

export const calendarStatus = pgEnum("calendar_status", ["confirmed", "to_confirm"]);
export const jobStatus = pgEnum("job_status", ["running", "success", "skipped", "failed"]);

/** Latest quote per symbol, refreshed by the price job. */
export const pricesLatest = pgTable(
  "prices_latest",
  {
    symbol: text("symbol")
      .primaryKey()
      .references(() => securities.symbol, { onDelete: "cascade" }),
    price: price("price").notNull(),
    prevClose: price("prev_close"),
    change: price("change"),
    changePct: numeric("change_pct", { precision: 10, scale: 4 }),
    open: price("open"),
    high: price("high"),
    low: price("low"),
    volume: bigint("volume", { mode: "number" }),
    /** When the source says the quote is from (may lag for delayed sources). */
    asOf: timestamp("as_of", { withTimezone: true }).notNull(),
    source: text("source").notNull(),
    delayed: boolean("delayed").notNull().default(false),
    updatedAt: updatedAt(),
  },
  () => [marketRead("prices_latest")],
).enableRLS();

/** Days PSX is closed. Lunar dates stay "to_confirm" until PSX's notice is checked. */
export const marketHolidays = pgTable(
  "market_holidays",
  {
    date: date("date").primaryKey(),
    name: text("name").notNull(),
    status: calendarStatus("status").notNull().default("to_confirm"),
    note: text("note"),
  },
  () => [marketRead("market_holidays")],
).enableRLS();

/** Days with non-standard hours (e.g. Ramazan). Sessions are PKT "HH:MM" pairs. */
export const marketSessions = pgTable(
  "market_sessions",
  {
    date: date("date").primaryKey(),
    name: text("name").notNull(),
    sessions: jsonb("sessions").notNull().$type<{ open: string; close: string }[]>(),
    status: calendarStatus("status").notNull().default("to_confirm"),
  },
  () => [marketRead("market_sessions")],
).enableRLS();

/** Background job history. At most one running row per job acts as a lock. */
export const jobRuns = pgTable(
  "job_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    job: text("job").notNull(),
    status: jobStatus("status").notNull().default("running"),
    source: text("source"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    rows: integer("rows"),
    message: text("message"),
  },
  (t) => [
    index("job_runs_job_started_idx").on(t.job, t.startedAt),
    uniqueIndex("job_runs_one_running").on(t.job).where(sql`status = 'running'`),
    marketRead("job_runs"),
  ],
).enableRLS();

// ---------- portfolios ----------

export const portfolios = pgTable(
  "portfolios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .default(sql`auth.uid()`)
      .references(() => authUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    brokerId: uuid("broker_id").references(() => brokers.id, { onDelete: "set null" }),
    taxStatus: taxStatus("tax_status").notNull().default("filer"),
    cgtRuleId: uuid("cgt_rule_id").references(() => cgtRules.id, { onDelete: "restrict" }),
    feeProfileId: uuid("fee_profile_id").references(() => feeProfiles.id, { onDelete: "restrict" }),
    syncAddress: text("sync_address").unique(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("portfolios_user_id_idx").on(t.userId),
    uniqueIndex("portfolios_user_name_key").on(t.userId, sql`lower(${t.name})`),
    uniqueIndex("portfolios_one_default_per_user").on(t.userId).where(sql`is_default`),
    check("portfolios_name_length", sql`char_length(name) between 1 and 60`),
    // A portfolio may only use the caller's own fee profile / CGT rule copies.
    ...ownerPolicies(
      "portfolios",
      sql.raw(
        `(portfolios.fee_profile_id is null or exists (select 1 from public.fee_profiles f where f.id = portfolios.fee_profile_id and f.user_id = (select auth.uid())))` +
          ` and (portfolios.cgt_rule_id is null or exists (select 1 from public.cgt_rules c where c.id = portfolios.cgt_rule_id and c.user_id = (select auth.uid())))`,
      ),
    ),
  ],
).enableRLS();

/**
 * Filer (ATL) status over time. The status in force on a date is the latest row
 * with effective_from on or before that date. portfolios.tax_status mirrors the current one.
 */
export const portfolioTaxStatus = pgTable(
  "portfolio_tax_status",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    status: taxStatus("status").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("portfolio_tax_status_portfolio_date_key").on(t.portfolioId, t.effectiveFrom),
    ...portfolioPolicies("portfolio_tax_status"),
  ],
).enableRLS();

export const importJobs = pgTable(
  "import_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .default(sql`auth.uid()`)
      .references(() => authUsers.id, { onDelete: "cascade" }),
    portfolioId: uuid("portfolio_id").references(() => portfolios.id, { onDelete: "cascade" }),
    channel: importChannel("channel").notNull(),
    fileUrl: text("file_url"),
    status: importStatus("status").notNull().default("pending"),
    parserUsed: text("parser_used"),
    rawText: text("raw_text"),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("import_jobs_user_id_idx").on(t.userId),
    index("import_jobs_portfolio_id_idx").on(t.portfolioId),
    ...ownerPolicies(
      "import_jobs",
      sql.raw(
        `(import_jobs.portfolio_id is null or exists (select 1 from public.portfolios p where p.id = import_jobs.portfolio_id and p.user_id = (select auth.uid())))`,
      ),
    ),
  ],
).enableRLS();

export const parsedRows = pgTable(
  "parsed_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importJobId: uuid("import_job_id")
      .notNull()
      .references(() => importJobs.id, { onDelete: "cascade" }),
    kind: parsedRowKind("kind").notNull(),
    data: jsonb("data").notNull(),
    status: parsedRowStatus("status").notNull().default("pending"),
    createdAt: createdAt(),
  },
  (t) => {
    const owns = sql.raw(
      `exists (select 1 from public.import_jobs j where j.id = parsed_rows.import_job_id and j.user_id = (select auth.uid()))`,
    );
    return [
      index("parsed_rows_import_job_id_idx").on(t.importJobId),
      pgPolicy("parsed_rows_select_own", { for: "select", to: authenticatedRole, using: owns }),
      pgPolicy("parsed_rows_insert_own", { for: "insert", to: authenticatedRole, withCheck: owns }),
      pgPolicy("parsed_rows_update_own", { for: "update", to: authenticatedRole, using: owns, withCheck: owns }),
      pgPolicy("parsed_rows_delete_own", { for: "delete", to: authenticatedRole, using: owns }),
    ];
  },
).enableRLS();

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    symbol: text("symbol")
      .notNull()
      .references(() => securities.symbol, { onDelete: "restrict" }),
    type: txnType("type").notNull(),
    qty: qty("qty").notNull(),
    price: price("price").notNull().default("0"),
    /** Broker commission. */
    fee: money("fee").notNull().default("0"),
    /** Sales tax / FED on the commission. */
    tax: money("tax").notNull().default("0"),
    /** CDC, NCCPL, SECP and similar charges. Added to cost on buys, deducted from proceeds on sells. */
    otherCharges: money("other_charges").notNull().default("0"),
    tradeDate: date("trade_date").notNull(),
    settleDate: date("settle_date"),
    source: entrySource("source").notNull().default("manual"),
    importJobId: uuid("import_job_id").references(() => importJobs.id, { onDelete: "set null" }),
    affectsCash: boolean("affects_cash").notNull().default(true),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("transactions_portfolio_symbol_idx").on(t.portfolioId, t.symbol, t.tradeDate),
    check("transactions_positive", sql`qty > 0 and price >= 0 and fee >= 0 and tax >= 0 and other_charges >= 0`),
    ...portfolioPolicies("transactions"),
  ],
).enableRLS();

export const lots = pgTable(
  "lots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    buyTxnId: uuid("buy_txn_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    qtyOpen: qty("qty_open").notNull(),
    costBasis: money("cost_basis").notNull(),
    acquiredOn: date("acquired_on").notNull(),
  },
  (t) => [index("lots_portfolio_symbol_idx").on(t.portfolioId, t.symbol), ...portfolioPolicies("lots", true)],
).enableRLS();

export const realizedGains = pgTable(
  "realized_gains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Denormalised from the sell transaction so RLS is a single lookup.
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    sellTxnId: uuid("sell_txn_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => lots.id, { onDelete: "cascade" }),
    qty: qty("qty").notNull(),
    gain: money("gain").notNull(),
    holdingDays: integer("holding_days").notNull(),
    cgtRate: rate("cgt_rate").notNull(),
    cgt: money("cgt").notNull(),
  },
  (t) => [index("realized_gains_portfolio_idx").on(t.portfolioId), ...portfolioPolicies("realized_gains", true)],
).enableRLS();

export const dividendReceipts = pgTable(
  "dividend_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    symbol: text("symbol")
      .notNull()
      .references(() => securities.symbol, { onDelete: "restrict" }),
    corporateActionId: uuid("corporate_action_id").references(() => corporateActions.id, { onDelete: "set null" }),
    gross: money("gross").notNull(),
    wht: money("wht").notNull().default("0"),
    zakatDeducted: money("zakat_deducted").notNull().default("0"),
    net: money("net").notNull(),
    /** Shares that earned the dividend and dividend per share (optional). */
    shares: qty("shares"),
    dps: price("dps"),
    /** PSX dividends are usually paid to the bank, not the broker, so off by default. */
    affectsCash: boolean("affects_cash").notNull().default(false),
    note: text("note"),
    paidOn: date("paid_on").notNull(),
    source: entrySource("source").notNull().default("manual"),
    createdAt: createdAt(),
  },
  (t) => [
    index("dividend_receipts_portfolio_idx").on(t.portfolioId, t.symbol),
    check("dividend_receipts_non_negative", sql`gross >= 0 and wht >= 0 and zakat_deducted >= 0 and net >= 0`),
    ...portfolioPolicies("dividend_receipts"),
  ],
).enableRLS();

export const cashEntries = pgTable(
  "cash_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    type: cashEntryType("type").notNull(),
    /** Signed: positive adds cash, negative removes it. */
    amount: money("amount").notNull(),
    date: date("date").notNull(),
    note: text("note"),
    linkedTxnId: uuid("linked_txn_id").references(() => transactions.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("cash_entries_portfolio_idx").on(t.portfolioId, t.date),
    // Trade and dividend cash lines are derived from transactions, so only manual types are stored.
    check("cash_entries_manual_types", sql`type in ('deposit', 'withdrawal', 'adjustment', 'deduction')`),
    check(
      "cash_entries_sign",
      sql`(type = 'deposit' and amount > 0) or (type in ('withdrawal', 'deduction') and amount < 0) or (type = 'adjustment' and amount <> 0)`,
    ),
    ...portfolioPolicies("cash_entries"),
  ],
).enableRLS();

export const snapshots = pgTable(
  "snapshots",
  {
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    marketValue: money("market_value").notNull(),
    cost: money("cost").notNull(),
    cash: money("cash").notNull(),
  },
  (t) => [primaryKey({ columns: [t.portfolioId, t.date] }), ...portfolioPolicies("snapshots", true)],
).enableRLS();

// ---------- user settings ----------

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .default(sql`auth.uid()`)
      .references(() => authUsers.id, { onDelete: "cascade" }),
    kind: alertKind("kind").notNull(),
    symbol: text("symbol").references(() => securities.symbol, { onDelete: "cascade" }),
    portfolioId: uuid("portfolio_id").references(() => portfolios.id, { onDelete: "cascade" }),
    condition: jsonb("condition").notNull(),
    channel: alertChannel("channel").notNull().default("web_push"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index("alerts_user_id_idx").on(t.userId),
    ...ownerPolicies(
      "alerts",
      sql.raw(
        `(alerts.portfolio_id is null or exists (select 1 from public.portfolios p where p.id = alerts.portfolio_id and p.user_id = (select auth.uid())))`,
      ),
    ),
  ],
).enableRLS();

export const alertEvents = pgTable(
  "alert_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    alertId: uuid("alert_id")
      .notNull()
      .references(() => alerts.id, { onDelete: "cascade" }),
    triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb("payload").notNull().default({}),
    delivered: boolean("delivered").notNull().default(false),
  },
  (t) => [
    index("alert_events_alert_id_idx").on(t.alertId),
    pgPolicy("alert_events_select_own", {
      for: "select",
      to: authenticatedRole,
      using: sql.raw(
        `exists (select 1 from public.alerts a where a.id = alert_events.alert_id and a.user_id = (select auth.uid()))`,
      ),
    }),
  ],
).enableRLS();

export const watchlists = pgTable(
  "watchlists",
  {
    userId: uuid("user_id")
      .notNull()
      .default(sql`auth.uid()`)
      .references(() => authUsers.id, { onDelete: "cascade" }),
    symbol: text("symbol")
      .notNull()
      .references(() => securities.symbol, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.symbol] }), ...ownerPolicies("watchlists")],
).enableRLS();

export const zakatSettings = pgTable(
  "zakat_settings",
  {
    userId: uuid("user_id")
      .primaryKey()
      .default(sql`auth.uid()`)
      .references(() => authUsers.id, { onDelete: "cascade" }),
    hijriMonth: smallint("hijri_month"),
    hijriDay: smallint("hijri_day"),
    method: text("method").notNull().default("market_value"),
    purificationPct: rate("purification_pct").notNull().default("0.05"),
    updatedAt: updatedAt(),
  },
  () => [
    check("zakat_settings_hijri", sql`(hijri_month is null or hijri_month between 1 and 12) and (hijri_day is null or hijri_day between 1 and 30)`),
    ...ownerPolicies("zakat_settings"),
  ],
).enableRLS();

export const dashboardLayouts = pgTable(
  "dashboard_layouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .default(sql`auth.uid()`)
      .references(() => authUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Default"),
    widgets: jsonb("widgets").notNull().default([]),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("dashboard_layouts_user_id_idx").on(t.userId), ...ownerPolicies("dashboard_layouts")],
).enableRLS();
