// One-off check of what the EODHD plan returns, spending at most 5 metered calls.
// Every call is reserved in api_usage first (same rule as the jobs), so it can never
// pass EODHD_DAILY_LIMIT. /user (account info) is checked before and after to see
// how EODHD counted the multi-ticker request.
// Run: npm run eodhd:probe
import postgres from "postgres";

const key = process.env.EODHD_API_KEY;
if (!key) {
  console.error("EODHD_API_KEY is not set in .env.local");
  process.exit(1);
}
const limit = process.env.EODHD_DAILY_LIMIT ? Number(process.env.EODHD_DAILY_LIMIT) : 15;
const sql = postgres(process.env.DIRECT_URL, { max: 1 });
const day = new Date().toISOString().slice(0, 10);

async function reserve(calls) {
  const rows = await sql`
    insert into public.api_usage (provider, day, calls) values ('eodhd', ${day}, ${calls})
    on conflict (provider, day) do update set calls = api_usage.calls + excluded.calls, updated_at = now()
      where api_usage.calls + excluded.calls <= ${limit}
    returning calls`;
  if (calls > limit || !rows.length) throw new Error(`Budget: ${calls} more call(s) would pass the daily limit of ${limit}`);
  return rows[0].calls;
}

async function get(path, params = {}) {
  const u = new URL(`https://eodhd.com/api${path}`);
  u.searchParams.set("api_token", key);
  u.searchParams.set("fmt", "json");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u, { headers: { "User-Agent": "psx-tracker/0.1 (personal portfolio tracker; low-volume; server-side)" } });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }
  return { status: res.status, body };
}

async function account(label) {
  const { status, body } = await get("/user");
  if (status !== 200) return console.log(`${label}: /user HTTP ${status}`), null;
  const info = { apiRequests: body.apiRequests, dailyRateLimit: body.dailyRateLimit, apiRequestsDate: body.apiRequestsDate, subscriptionType: body.subscriptionType };
  console.log(`${label}:`, JSON.stringify(info));
  return info;
}

const pick = (q) => (q && typeof q === "object" ? { code: q.code, timestamp: q.timestamp, time: typeof q.timestamp === "number" ? new Date(q.timestamp * 1000).toISOString() : q.timestamp, close: q.close, previousClose: q.previousClose, volume: q.volume } : q);

try {
  console.log(`Day ${day} (UTC), limit ${limit}, used so far: ${(await sql`select calls from public.api_usage where provider = 'eodhd' and day = ${day}`)[0]?.calls ?? 0}`);
  const before = await account("Account before");

  // 1. Two tickers in one request.
  await reserve(2);
  const rt = await get("/real-time/MEBL.KAR", { s: "OGDC.KAR" });
  console.log(`\nreal-time MEBL.KAR + OGDC.KAR: HTTP ${rt.status}`);
  console.log(JSON.stringify(Array.isArray(rt.body) ? rt.body.map(pick) : pick(rt.body), null, 1));
  const afterRt = await account("Account after real-time");
  const afterRt2 = await account("Account after a second /user");
  if (before && afterRt) console.log(`-> the 2-ticker request counted as ${afterRt.apiRequests - before.apiRequests} call(s); /user itself counted as ${afterRt2 ? afterRt2.apiRequests - afterRt.apiRequests : "?"}`);

  // 2. Exchange symbol list.
  await reserve(1);
  const list = await get("/exchange-symbol-list/KAR");
  if (Array.isArray(list.body)) {
    const types = {};
    for (const r of list.body) types[r.Type ?? "?"] = (types[r.Type ?? "?"] ?? 0) + 1;
    console.log(`\nexchange-symbol-list/KAR: HTTP ${list.status}, ${list.body.length} rows, types ${JSON.stringify(types)}`);
    console.log("ETFs:", list.body.filter((r) => r.Type === "ETF").map((r) => r.Code).join(", "));
  } else console.log(`\nexchange-symbol-list/KAR: HTTP ${list.status}`, list.body);

  // 3. History depth.
  await reserve(1);
  const eod = await get("/eod/MEBL.KAR", { from: "2000-01-01", period: "d" });
  if (Array.isArray(eod.body) && eod.body.length) {
    console.log(`\neod/MEBL.KAR from 2000: HTTP ${eod.status}, ${eod.body.length} rows, first ${eod.body[0].date}, last ${eod.body.at(-1).date}`);
    console.log("last row:", JSON.stringify(eod.body.at(-1)));
  } else console.log(`\neod/MEBL.KAR: HTTP ${eod.status}`, eod.body);

  // 4. KSE-100.
  await reserve(1);
  const kse = await get("/real-time/KSE100.INDX");
  console.log(`\nreal-time KSE100.INDX: HTTP ${kse.status}`, JSON.stringify(pick(kse.body)));

  const after = await account("\nAccount after");
  if (before && after) console.log(`EODHD counted ${after.apiRequests - before.apiRequests} call(s) in this probe (incl. any /user calls).`);
  console.log(`api_usage now: ${(await sql`select calls from public.api_usage where provider = 'eodhd' and day = ${day}`)[0]?.calls}`);
} catch (e) {
  console.error(e.message.replaceAll(key, "REDACTED"));
  process.exitCode = 1;
} finally {
  await sql.end();
}
