# Scheduling the market-data jobs

The jobs are HTTP endpoints in the Next.js app, protected by `CRON_SECRET`:

| Job | Endpoint | When |
| --- | --- | --- |
| Prices | `POST /api/jobs/prices` | Every minute on weekdays, 09:00-17:00 PKT. The job skips itself when the market is closed. |
| End of day | `POST /api/jobs/eod` | 17:00 PKT on weekdays. Skips non-trading days. |

Add `?force=1` to run outside market hours, and `?date=YYYY-MM-DD` (eod only) to store a specific day.

## Locally

```bash
npm run dev        # terminal 1
npm run jobs:dev   # terminal 2: prices every minute, eod after 17:00 PKT
npm run job -- prices --force   # one-off run
```

## Production (Supabase pg_cron + pg_net)

Vercel's free plan only allows daily cron jobs, so Supabase calls the deployed app instead. Do this once the app is deployed.

1. In Vercel, set `CRON_SECRET`, `MARKET_DATA_SOURCE` and (for EODHD) `EODHD_API_KEY`.
2. In Supabase → **Database → Extensions**, enable `pg_cron` and `pg_net`.
3. Store the secret and URL in Vault (SQL editor), replacing the placeholders:

```sql
select vault.create_secret('<your CRON_SECRET>', 'cron_secret');
select vault.create_secret('https://<your-app>.vercel.app', 'app_url');
```

4. Schedule the jobs. pg_cron runs in **UTC**; PKT is UTC+5, so 09:00-17:00 PKT is 04:00-12:00 UTC.

```sql
select cron.schedule(
  'psx-prices',
  '* 4-11 * * 1-5',
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

To stop: `select cron.unschedule('psx-prices'); select cron.unschedule('psx-eod');`
