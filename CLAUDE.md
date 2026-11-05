@AGENTS.md

# PSX Tracker — project rules

A personal portfolio tracker for the Pakistan Stock Exchange (PSX). The full product brief is in `PLAN.md`; read the relevant section before starting a milestone.

## Product stages

- **Stage 1:** rebuild the feature set listed in PLAN.md §1 so it behaves the same way, in three milestones (§6).
- **Stage 2:** customise, starting only after Stage 1 has been used and tested side by side.
- **Originality:** use our own name, logo, colours, layout, copy and wording everywhere. SmartPSX is a feature checklist only. Never copy its branding, text, UI copy, screenshots or design.

## Working rules

- **One milestone at a time.** Plan before coding, get approval, finish and test a milestone before starting the next.
- **Write tests for all money maths.** Fees (slabs, FED, minimums), FIFO lot matching, average cost, realized/unrealized P&L, CGT, dividends (gross/WHT/net), cash ledger balances, zakat and purification. Tests live next to the code as `*.test.ts` and run with `npm test` (Vitest). Use exact decimal handling, never float drift on rupee amounts.
- **Never commit secrets.** Real keys go only in `.env.local` (git-ignored). `.env.example` holds names and placeholders only. Never print key values in logs, commits or chat.
- This is Next.js 16: middleware is now `src/proxy.ts`. Check `node_modules/next/dist/docs/` before relying on older Next.js APIs.
- `cacheComponents` and `partialPrefetching` are on. Anything that reads the session, cookies, `params` or `searchParams` must sit inside a `<Suspense>` boundary; keep the page shell (headings, nav) outside it so it prerenders. `requireUser()` calls `connection()` because token checks read the clock.
- After a write, call `revalidatePath("/<section>", "layout")` so every cached page under it refreshes, and give forms built from saved data a `key` (e.g. `updated_at`) so they remount with fresh values.
- Don't call `redirect()` in a page that can prerender; use `next.config.ts` redirects or the proxy.
- Client components that read the URL (`usePathname`, `useSearchParams`) must sit inside `<Suspense>` with a static fallback (see `src/app/(app)/nav.tsx`), or dynamic routes fail to build and dev mode reload-loops.
- Wrap every personal amount (rupees, shares, P&L) in an element with the `money` class so the hide-amounts toggle masks it. Market prices on /market stay visible.
- Theme is `next-themes` (class strategy); hide-amounts is a per-browser preference set before paint by a script in the root layout.

## Stack (PLAN.md §6)

- Frontend + API: Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui; charts with Recharts or lightweight-charts.
- Database, auth, storage: Supabase (Postgres, Google + email auth, row-level security, file storage).
- Schema and migrations: Drizzle (`drizzle-kit`).
- Tests: Vitest.
- Jobs (later): Supabase cron or Inngest/Trigger.dev for price refresh, snapshots, alert checks, parsing.
- Inbound email (later): Cloudflare Email Routing → Worker, or Postmark/Mailgun inbound.
- Parsing (later): pdf-parse/pdfplumber; Claude API for fallback extraction and notice summaries.
- Push (later): Web Push for the PWA.
- Hosting: Vercel + Supabase. Error tracking: Sentry.

## Supabase access rules (security)

Drizzle connects with `DATABASE_URL` as a privileged Postgres role and **bypasses row-level security**. So:

- **User-facing reads and writes** (pages, server components, server actions, route handlers acting for a user) go through **supabase-js with the user's session** (`src/lib/supabase/server.ts` or `client.ts`), so RLS always applies.
- **Drizzle is only for** migrations and trusted server-side jobs (price poller, end-of-day job, notice poller, import pipeline). Its code lives in `src/db/` and must never be imported from client components or user-request code paths.
- The secret key (`SUPABASE_SECRET_KEY`) is server-only, same restriction as Drizzle.
- Every user-owned table has RLS enabled with policies scoped to `auth.uid()` in the same migration that creates it. Policies live next to the table in `src/db/schema.ts` (`pgPolicy`); use `(select auth.uid())`, scope them `to authenticated`, and qualify columns in subqueries.
- Multi-row user writes go through `SECURITY INVOKER` Postgres functions called with `supabase.rpc()` (see `drizzle/0001_functions_and_seed.sql`), so they are atomic and RLS still applies.
- Every new table or policy gets a case in `scripts/test-rls.mjs`; run `npm run test:rls` before committing schema changes.
- Schema changes: edit `src/db/schema.ts` → `npm run db:generate` → review the SQL → `npm run db:migrate`. Triggers, functions and seed data go in a custom migration (`npx drizzle-kit generate --custom --name <name>`).

## Database connections

- `DATABASE_URL`: transaction pooler (port 6543). Used at runtime by jobs. postgres-js **must** use `prepare: false` with it.
- `DIRECT_URL`: session pooler or direct connection (port 5432). Used by `drizzle-kit` for migrations.

## Portfolio engine

- `src/lib/engine/` is pure TypeScript with exact decimals: fees, FIFO lots, P&L, CGT, dividends, cash ledger.
- Fees: commission (0.15% or Rs 0.03/share below Rs 20), sales tax on it, flat CDC per trade, and PSX/SECP/NCCPL levies on trade value; each rounded half up to the paisa on its own. Worked examples from real Nafa orders are in `fees.test.ts`. A new portfolio preselects the user's existing broker, else Chase Securities (Nafa) (`broker-default.ts`). `buildPortfolio()` rebuilds everything from transactions on every request; derived figures are never stored by user code.
- All tax rates live in one dated rule set, `src/lib/engine/tax-rules.ts` (last checked Nov 2026, Finance Act 2026). Add new dated brackets for budget changes; don't edit old ones.
- Filer status is dated (`portfolio_tax_status`); the filer CGT rate needs ATL status on both buy and sell dates. The non-filer rate for post-July-2024 acquisitions is user-entered per portfolio (min 15%).
- Cash ledger: only manual entries are stored in `cash_entries`; trade and dividend lines are derived.
- Every write that changes trades is re-checked with `runFifo` so no sale can exceed holdings.
- Daily value history lives in `snapshots`, rebuilt by the `snapshots` job (`src/jobs/snapshots.ts`) using `buildValueSeries()`. A trigger flags a portfolio stale when its trades, dividends or cash change. The Home chart adds a live point for today.
- Dashboard card layout is per user in `dashboard_layouts` (`name = 'Default'`); `mergeLayout()` keeps old saved layouts valid when cards are added.
- CSV import (`src/lib/csv/import.ts`) uses the template columns; preview first, then `import_portfolio_rows` saves all rows or none. Exports use the same columns.
- Known gaps are listed in `docs/backlog.md`.

## Market data rule (PLAN.md §4b)

- All market-data access lives in **`src/lib/psx/`** behind the `MarketDataSource` interface (`types.ts`). Providers are files in `src/lib/psx/sources/` (`demo.ts`, `eodhd.ts`); `MARKET_DATA_SOURCE` picks one. A new provider = one new file.
- Never call a provider from the browser or from user-request code. Jobs (`src/jobs/`) fetch and store; pages read only from Supabase (`prices_latest`, `prices`, `securities`).
- All provider HTTP goes through `PoliteClient` (`http.ts`): serial, minimum gap, backoff, secrets redacted.
- **Do not scrape dps.psx.com.pk.** Its data endpoints are protected by a client token; never reverse-engineer or bypass bot protection on any site.
- **EODHD daily budget:** every metered call reserves its cost in `api_usage` first (`src/lib/psx/budget.ts`, store in `src/jobs/market-db.ts`) and is never sent past `EODHD_DAILY_LIMIT` (default 15 of the free plan's 20, per UTC day). EODHD counts one call per ticker. `getMarketSource()` refuses to build EODHD without the budget, and the adapter never retries. Don't call EODHD from anywhere else; `npm run eodhd:probe` is the only script that does, and it reserves too.
- **Refresh rules** live in `src/lib/psx/refresh-policy.ts` (pure, tested): `PRICE_REFRESH_MINUTES`, `PRICE_REFRESH_SCOPE` (holdings | all), the 5-minute button cooldown, keeping one refresh in reserve for the button, and the status line text. The free plan has no PSX intraday quotes, so `EODHD_QUOTE_MODE=eod` (default) stores daily closes, checked from `EOD_CHECK_START` (22:30 PKT) hourly, at most 3 times a day; `realtime` is for paid plans. Job state is in `market_data_state`.
- The "Refresh prices" button (`src/components/price-refresh.tsx`) calls a server action that POSTs `/api/jobs/prices?trigger=manual` with `CRON_SECRET` to the fixed `JOBS_BASE_URL`; never build that URL from request headers.
- Delayed sources (EODHD realtime, ~15-20 min) must be labelled "delayed" wherever their prices appear; daily closes (`prices_latest.end_of_day`) are labelled "close" / "closing prices". Demo data must be labelled "Demo data".
- Market hours and holidays come from `calendar.ts` + `market_holidays` / `market_sessions`, all in PKT. Lunar holidays and Friday hours stay "to confirm" until checked against the PSX notice.
- Job endpoints: `/api/jobs/prices` and `/api/jobs/eod`, Bearer `CRON_SECRET`. Locally `npm run jobs:dev`; production schedule in `docs/cron.md`.

## Data model (PLAN.md §5)

A user owns portfolios; a portfolio owns transactions. **Holdings, lots and realized gains are derived from transactions and can always be rebuilt.** Market tables are shared by all users.

| Entity | Key fields | Relationships |
| --- | --- | --- |
| User | id, email, name, auth provider, locale, theme, prefs (JSON) | has many Portfolio, Alert, Watchlist, ImportJob, DashboardLayout |
| Portfolio | id, user_id, name, broker_id, tax_status, cgt_rule_id, fee_profile_id, sync_address, is_default | belongs to User; has many Transaction, CashEntry, Snapshot |
| Broker | id, name, default fee profile, parser keys, sender emails | used by Portfolio, ImportJob |
| FeeProfile | id, threshold, pct_above, per_share_below, fed_pct, min_fee, cdc_per_trade, psx/secp/nccpl_levy_pct | used by Portfolio (user-editable copy); system rows: "PSX default", one per broker with its own charges (e.g. Chase Securities (Nafa)) |
| Security | symbol, name, sector, is_shariah, is_etf, shares_out, free_float | has many Price, Dividend (corporate), Notice |
| Price | symbol, ts, open, high, low, close, volume | belongs to Security |
| Transaction | id, portfolio_id, symbol, type (buy, sell, bonus, split, transfer_in/out), qty, price, fee, tax, trade_date, settle_date, source, import_job_id, affects_cash | belongs to Portfolio; feeds Lot |
| Lot | id, portfolio_id, symbol, buy_txn_id, qty_open, cost_basis, acquired_on | derived; consumed FIFO by sells |
| RealizedGain | sell_txn_id, lot_id, qty, gain, holding_days, cgt_rate, cgt | derived per FIFO match |
| DividendReceipt | id, portfolio_id, symbol, gross, wht, zakat_deducted, net, paid_on, source | belongs to Portfolio; links corporate Dividend |
| CorporateAction | symbol, type (cash div, bonus, right, split), amount/ratio, xd_date, book_closure | belongs to Security |
| CashEntry | id, portfolio_id, type, amount, date, note, linked_txn_id | belongs to Portfolio |
| ImportJob | id, user_id, portfolio_id, channel (email, pdf, image, csv), file_url, status, parser_used, raw_text | has many ParsedRow (staged until user confirms) |
| Snapshot | portfolio_id, date, market_value, cost, cash | daily; powers charts and zakat |
| Notice | id, symbol, title, pdf_url, published_at, ai_summary, category | belongs to Security |
| Alert | id, user_id, kind (price, pnl, notice, volume), symbol, condition, channel, active | has many AlertEvent |
| Watchlist | user_id, symbol, sort_order | |
| ZakatSetting | user_id, hijri_date, method, purification_pct | belongs to User |
| DashboardLayout | user_id, widgets (JSON: type, size, order, settings) | our customisation layer |

## Commands

- `npm run dev`: dev server
- `npm run build`, `npm run lint`, `npm test`
- `npm run db:generate` / `npm run db:migrate`: Drizzle migrations (use `DIRECT_URL`)
- `npm run test:rls`: RLS isolation test against the live project (creates and deletes two throwaway users)
- `npm run db:inspect`: read-only check of RLS status, policy counts and seed data
- `npm run dev-user -- create|delete`: confirmed local test login, stored in `.env.local` as `DEV_USER_EMAIL` / `DEV_USER_PASSWORD`
- `npm run check:supabase`: verify `.env.local` keys and connections
- `npm run jobs:dev`: local scheduler (needs `npm run dev` running)
- `npm run job -- prices|eod [--force] [--date=YYYY-MM-DD]`: run one job once (`--force` skips timing rules, never the daily limit)
- `npm run eodhd:probe`: spend up to 5 EODHD calls to see what the plan returns
