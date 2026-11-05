// Local scheduler: calls the job endpoints on the running dev server, the same
// way the production cron does. Start `npm run dev` first.
//   npm run jobs:dev                 prices every minute (the job skips itself when the market is closed),
//                                    eod once a day after 17:00 PKT on weekdays
//   npm run job -- prices [--force]  run one job once
//   npm run job -- eod [--force] [--date=YYYY-MM-DD]
const base = process.env.JOBS_BASE_URL ?? "http://localhost:3000";
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("CRON_SECRET is not set in .env.local");
  process.exit(1);
}

async function call(job, query = "") {
  const started = Date.now();
  try {
    const res = await fetch(`${base}/api/jobs/${job}${query}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = await res.json().catch(() => ({}));
    const ms = Date.now() - started;
    console.log(`${new Date().toISOString()} ${job} ${res.status} ${body.status ?? ""} rows=${body.rows ?? "-"} ${body.message ?? body.error ?? ""} (${ms} ms)`);
    return body;
  } catch (e) {
    console.log(`${new Date().toISOString()} ${job} ERROR ${e.message} (is the dev server running at ${base}?)`);
  }
}

function pkt(now = new Date()) {
  const s = new Date(now.getTime() + 5 * 3600_000);
  return { date: s.toISOString().slice(0, 10), minutes: s.getUTCHours() * 60 + s.getUTCMinutes(), weekday: s.getUTCDay() };
}

const [mode, ...flags] = process.argv.slice(2);
if (mode === "once") {
  const [job, ...rest] = flags;
  const q = new URLSearchParams();
  if (rest.includes("--force")) q.set("force", "1");
  const date = rest.find((f) => f.startsWith("--date="));
  if (date) q.set("date", date.slice(7));
  const body = await call(job, q.size ? `?${q}` : "");
  process.exit(body && body.status !== "failed" ? 0 : 1);
}

console.log(`Job scheduler calling ${base}. Ctrl+C to stop.`);
let lastEod = null;
async function tick() {
  await call("prices");
  const { date, minutes, weekday } = pkt();
  if (weekday >= 1 && weekday <= 5 && minutes >= 17 * 60 && lastEod !== date) {
    lastEod = date;
    await call("eod");
  }
}
await tick();
setInterval(tick, 60_000);
