// Schedules the production jobs in Supabase (pg_cron + pg_net), calling the deployed app.
// The URL and CRON_SECRET are stored in Supabase Vault and read by the cron SQL, so no
// secret appears in cron.job. Safe to re-run: secrets are updated, jobs replaced by name.
//
//   npm run deploy:cron -- --url=https://<your-app>.vercel.app   set up or update
//   npm run deploy:cron -- --status                               show jobs and recent responses
//   npm run deploy:cron -- --remove                               unschedule all three
//
// Reads DIRECT_URL from .env.local and CRON_SECRET from .env.vercel (npm run deploy:env).
// The prices job is asked every 5 minutes but decides itself whether a refresh is due
// and never spends past EODHD_DAILY_LIMIT, so the schedule cannot overspend the budget.
import { existsSync, readFileSync } from "node:fs";
import postgres from "postgres";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? true]));

const JOBS = [
  // Decides itself; a skipped run makes no provider call.
  { name: "psx-prices", schedule: "*/5 * * * *", path: "/api/jobs/prices" },
  // 17:00 PKT (12:00 UTC) on weekdays; skips non-trading days.
  { name: "psx-eod", schedule: "0 12 * * 1-5", path: "/api/jobs/eod" },
  // Rebuilds only portfolios whose trades, dividends, cash or prices changed.
  { name: "psx-snapshots", schedule: "*/5 * * * *", path: "/api/jobs/snapshots" },
];

function vercelSecret() {
  if (!existsSync(".env.vercel")) return null;
  const m = readFileSync(".env.vercel", "utf8").match(/^CRON_SECRET=(.+)$/m);
  return m ? m[1].trim() : null;
}

const sql = postgres(process.env.DIRECT_URL, { max: 1, onnotice: () => {} });

async function setSecret(name, value) {
  const [row] = await sql`select id from vault.secrets where name = ${name}`;
  if (row) await sql`select vault.update_secret(${row.id}, ${value})`;
  else await sql`select vault.create_secret(${value}, ${name})`;
}

async function status() {
  const jobs = await sql`select jobid, jobname, schedule, active from cron.job where jobname like 'psx-%' order by jobname`;
  console.log("Scheduled jobs:");
  for (const j of jobs) console.log(`  ${j.jobname.padEnd(14)} ${j.schedule.padEnd(14)} ${j.active ? "active" : "paused"}`);
  if (!jobs.length) console.log("  (none)");
  const runs = await sql`
    select j.jobname, d.status, d.return_message, d.start_time
    from cron.job_run_details d join cron.job j using (jobid)
    where j.jobname like 'psx-%' order by d.start_time desc limit 6`;
  console.log("Recent cron runs:");
  for (const r of runs) console.log(`  ${r.start_time.toISOString()} ${r.jobname.padEnd(14)} ${r.status} ${r.return_message ?? ""}`);
  const http = await sql`select created, status_code, left(coalesce(content, error_msg, ''), 160) as body from net._http_response order by created desc limit 6`;
  console.log("Recent HTTP responses (pg_net):");
  for (const h of http) console.log(`  ${h.created.toISOString()} ${h.status_code ?? "-"} ${h.body.replace(/\s+/g, " ")}`);
}

try {
  if (args.status) {
    await status();
  } else if (args.remove) {
    for (const j of JOBS) await sql`select cron.unschedule(jobid) from cron.job where jobname = ${j.name}`;
    console.log("Unscheduled psx-prices, psx-eod, psx-snapshots.");
  } else {
    const url = typeof args.url === "string" ? args.url.replace(/\/$/, "") : null;
    if (!url || !/^https:\/\/[a-z0-9.-]+$/i.test(url)) throw new Error("Pass the production URL: --url=https://<your-app>.vercel.app");
    const secret = vercelSecret();
    if (!secret || secret.length < 16) throw new Error("No CRON_SECRET in .env.vercel. Run npm run deploy:env first.");

    await sql`create extension if not exists pg_cron`;
    await sql`create extension if not exists pg_net`;
    await setSecret("app_url", url);
    await setSecret("cron_secret", secret);

    for (const j of JOBS) {
      const command = `
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '${j.path}',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
          ),
          timeout_milliseconds := 55000
        );`;
      await sql`select cron.schedule(${j.name}, ${j.schedule}, ${command})`;
    }
    console.log(`Vault secrets app_url (${url}) and cron_secret set.`);
    await status();
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
