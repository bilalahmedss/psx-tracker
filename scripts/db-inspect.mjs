// Prints RLS status, policy counts and seed data. Read-only. Run: node --env-file=.env.local scripts/db-inspect.mjs
import postgres from "postgres";
const sql = postgres(process.env.DIRECT_URL, { max: 1 });
const t = await sql`
  select c.relname, c.relrowsecurity as rls,
    (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)::int as pols
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' order by 1`;
console.log(t.map((r) => `${r.relname.padEnd(20)} rls=${r.rls} policies=${r.pols}`).join("\n"));
console.log("brokers:", (await sql`select count(*)::int n from public.brokers`)[0].n);
console.log("fee default:", JSON.stringify(await sql`select threshold, pct_above, per_share_below, fed_pct, min_fee from public.fee_profiles where user_id is null`));
console.log("cgt default:", JSON.stringify(await sql`select filer_rate, non_filer_rate from public.cgt_rules where user_id is null`));
console.log("functions:", (await sql`select proname from pg_proc where pronamespace = 'public'::regnamespace order by 1`).map((r) => r.proname).join(", "));
await sql.end();
