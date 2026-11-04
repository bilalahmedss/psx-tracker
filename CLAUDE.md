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
- Every user-owned table has RLS enabled with policies scoped to `auth.uid()` in the same migration that creates it.

## Database connections

- `DATABASE_URL`: transaction pooler (port 6543). Used at runtime by jobs. postgres-js **must** use `prepare: false` with it.
- `DIRECT_URL`: session pooler or direct connection (port 5432). Used by `drizzle-kit` for migrations.

## PSX data rule (PLAN.md §4b)

- All PSX scraping and data-portal access lives in **`src/lib/psx/`**, so a PSX layout change is a one-folder fix.
- Never call PSX from the browser. The app reads only from our own database/API.
- Cache everything; send a polite User-Agent; rate-limit requests.
- Scraped data is unlicensed: fine for personal use and testing; check PSX terms before charging users.

## Data model (PLAN.md §5)

A user owns portfolios; a portfolio owns transactions. **Holdings, lots and realized gains are derived from transactions and can always be rebuilt.** Market tables are shared by all users.

| Entity | Key fields | Relationships |
| --- | --- | --- |
| User | id, email, name, auth provider, locale, theme, prefs (JSON) | has many Portfolio, Alert, Watchlist, ImportJob, DashboardLayout |
| Portfolio | id, user_id, name, broker_id, tax_status, cgt_rule_id, fee_profile_id, sync_address, is_default | belongs to User; has many Transaction, CashEntry, Snapshot |
| Broker | id, name, default fee profile, parser keys, sender emails | used by Portfolio, ImportJob |
| FeeProfile | id, threshold, pct_above, per_share_below, fed_pct, min_fee | used by Portfolio (user-editable copy) |
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
