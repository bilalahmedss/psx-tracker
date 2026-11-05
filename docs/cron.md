# Scheduling the market-data jobs

The jobs are HTTP endpoints in the Next.js app, protected by `CRON_SECRET`:

| Job | Endpoint | When |
| --- | --- | --- |
| Prices | `POST /api/jobs/prices` | Every 5 minutes, all week. The job decides whether a refresh is due (`src/lib/psx/refresh-policy.ts`) and returns "skipped" without any provider call otherwise. |
| End of day | `POST /api/jobs/eod` | 17:00 PKT on weekdays. Skips non-trading days. Syncs the symbol list (weekly on EODHD) and marks every portfolio's snapshots stale. |
| Snapshots | `POST /api/jobs/snapshots` | Every 5 minutes, all day. Rebuilds daily value history only for portfolios whose trades, dividends or cash changed (`?force=1` rebuilds all). |

Add `?force=1` to ignore the timing rules (never the daily call limit), and `?date=YYYY-MM-DD` (eod only) to store a specific day. The "Refresh prices" button calls `/api/jobs/prices?trigger=manual` from a server action, using `JOBS_BASE_URL`.

## When prices refresh

- **Intraday sources** (demo; EODHD with `EODHD_QUOTE_MODE=realtime`): every `PRICE_REFRESH_MINUTES` (default 30) while PSX is open, plus one run in the 5 minutes after each close.
- **EODHD free plan** (`EODHD_QUOTE_MODE=eod`, the default): the free plan returns no intraday PSX quotes, only daily closes. From `EOD_CHECK_START` (default 22:30 PKT) on each trading day, the job checks for that day's closes, then hourly, at most 3 times (22:30, 23:30, 00:30). Each check first fetches one stock (1 call); only when the close is out does it fetch the rest. After 3 empty checks it gives up on that day and logs it (`job_runs`, `market_data_state.message`); the next trading day's closes still bring in the missed day's candles. The Refresh button can still try after giving up.
- **Daily limit:** every EODHD call is reserved in `api_usage` before it is sent, and nothing is sent past `EODHD_DAILY_LIMIT` (default 15, counted per UTC day, matching EODHD's reset). EODHD counts **one call per ticker**. Scheduled runs keep one full refresh in reserve for the button. When even that doesn't fit, pages show "Daily limit reached, showing last prices".
- **Button:** a 5-minute cooldown after any refresh (shared by all users).

With 5 held stocks, a full refresh costs 5 calls: one successful end-of-day fetch a day plus a few 1-call retries fits easily in 15.

## Locally

```bash
npm run dev        # terminal 1
npm run jobs:dev   # terminal 2: asks for prices every minute (the job decides), eod after 17:00 PKT
npm run job -- prices --force   # one-off run (still within the daily limit)
npm run eodhd:probe             # spends up to 5 EODHD calls to check what the plan returns
```

## Production (Supabase pg_cron + pg_net)

Vercel's free plan only allows daily cron jobs, so Supabase calls the deployed app instead. Local dev and production share one Supabase project, so they also share the EODHD call counter (`api_usage`) and refresh state: running `jobs:dev` locally can't push production over the daily limit.

1. `npm run deploy:env` writes `.env.vercel` (git-ignored): the production variables, with a new production `CRON_SECRET`. Paste it into Vercel → Project → Settings → Environment Variables.
2. Deploy, then run `npm run deploy:cron -- --url=https://<your-app>.vercel.app`. It enables `pg_cron` and `pg_net`, stores the URL and `CRON_SECRET` in Supabase Vault, and schedules (UTC):

| Job | Schedule | Calls |
| --- | --- | --- |
| `psx-prices` | `*/5 * * * *` | `/api/jobs/prices` (decides itself; most runs skip without a provider call) |
| `psx-eod` | `0 12 * * 1-5` | `/api/jobs/eod` (17:00 PKT) |
| `psx-snapshots` | `*/5 * * * *` | `/api/jobs/snapshots` |

3. `npm run deploy:cron -- --status` shows the jobs, recent runs and HTTP responses. `--remove` unschedules them.

If you rotate `CRON_SECRET`, change it in `.env.vercel`, update it in Vercel (and redeploy), then re-run `deploy:cron`.
