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
- **EODHD free plan** (`EODHD_QUOTE_MODE=eod`, the default): the free plan returns no intraday PSX quotes, only daily closes. From `EOD_PUBLISH_DELAY_MINUTES` (default 120) after the close, the job tries every `PRICE_REFRESH_MINUTES`. Each try first fetches one stock (1 call); only when that day's close is out does it fetch the rest. Once every held stock has the close, it does nothing until the next trading day.
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

Vercel's free plan only allows daily cron jobs, so Supabase calls the deployed app instead. Do this once the app is deployed.

1. In Vercel, set `CRON_SECRET`, `MARKET_DATA_SOURCE`, `JOBS_BASE_URL` (the deployed URL) and, for EODHD, `EODHD_API_KEY`, `EODHD_DAILY_LIMIT`, `EODHD_QUOTE_MODE`.
2. In Supabase → **Database → Extensions**, enable `pg_cron` and `pg_net`.
3. Store the secret and URL in Vault (SQL editor), replacing the placeholders:

```sql
select vault.create_secret('<your CRON_SECRET>', 'cron_secret');
select vault.create_secret('https://<your-app>.vercel.app', 'app_url');
```

4. Schedule the jobs. pg_cron runs in **UTC**; PKT is UTC+5.

```sql
select cron.schedule(
  'psx-prices',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/jobs/prices',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 55000
  );
  $$
);

select cron.schedule(
  'psx-snapshots',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/jobs/snapshots',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 55000
  );
  $$
);

select cron.schedule(
  'psx-eod',
  '0 12 * * 1-5',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/jobs/eod',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 55000
  );
  $$
);
```

5. Check it's working: `select * from cron.job_run_details order by start_time desc limit 10;` and the `job_runs` table (or the Market page's "Last price job" line).

To stop: `select cron.unschedule('psx-prices'); select cron.unschedule('psx-snapshots'); select cron.unschedule('psx-eod');`
