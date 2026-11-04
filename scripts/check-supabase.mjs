// Checks that the keys in .env.local work. Prints no secret values.
// Run: npm run check:supabase
import postgres from "postgres";

const env = process.env;
let failed = false;
const ok = (msg) => console.log(`  OK   ${msg}`);
const bad = (msg) => { console.log(`  FAIL ${msg}`); failed = true; };

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "DATABASE_URL",
  "DIRECT_URL",
];
console.log("Environment variables:");
for (const name of required) {
  if (!env[name] || env[name].includes("xxx") || env[name].includes("YOUR-PASSWORD")) bad(`${name} is missing or still a placeholder`);
  else ok(name);
}

async function checkApi(label, key) {
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: key },
    });
    if (res.ok) ok(`${label} accepted by Supabase`);
    else bad(`${label} rejected (HTTP ${res.status})`);
  } catch (e) {
    bad(`${label}: could not reach project URL (${e.message})`);
  }
}

async function checkDb(label, url, opts) {
  const sql = postgres(url, { ...opts, max: 1, connect_timeout: 10 });
  try {
    const [row] = await sql`select current_setting('server_version') as v`;
    ok(`${label} connected (Postgres ${row.v})`);
  } catch (e) {
    bad(`${label}: ${e.message}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (env.NEXT_PUBLIC_SUPABASE_URL) {
  console.log("Supabase API:");
  if (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) await checkApi("Publishable key", env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  if (env.SUPABASE_SECRET_KEY) await checkApi("Secret key", env.SUPABASE_SECRET_KEY);
}
console.log("Database:");
if (env.DATABASE_URL) {
  if (!env.DATABASE_URL.includes(":6543/")) bad("DATABASE_URL should be the transaction pooler (port 6543)");
  await checkDb("DATABASE_URL (transaction pooler)", env.DATABASE_URL, { prepare: false });
}
if (env.DIRECT_URL) {
  if (!env.DIRECT_URL.includes(":5432/")) bad("DIRECT_URL should use port 5432 (session pooler or direct)");
  await checkDb("DIRECT_URL (migrations)", env.DIRECT_URL, {});
}

console.log(failed ? "\nSome checks failed." : "\nAll Supabase checks passed.");
process.exit(failed ? 1 : 0);
