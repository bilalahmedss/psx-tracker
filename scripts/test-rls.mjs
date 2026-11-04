// Row-level security isolation test against the real Supabase project.
// Creates two throwaway users (confirmed, no emails sent), checks that each can
// only see and change their own data, then deletes both users.
// Run: npm run test:rls
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !publishableKey || !secretKey) {
  console.error("Missing Supabase env vars. Fill in .env.local first.");
  process.exit(1);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secretKey, opts);

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail ? ` (${detail})` : ""}`);
  }
}

const PSX_FEES = {
  p_tax_status: "filer",
  p_filer_rate: "0.15",
  p_non_filer_rate: "0.3",
  p_threshold: "20",
  p_pct_above: "0.0015",
  p_per_share_below: "0.03",
  p_fed_pct: "0.15",
  p_min_fee: "0",
};

async function makeUser(label) {
  const email = `rls-test-${label}-${randomUUID().slice(0, 8)}@example.test`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser ${label}: ${error.message}`);
  const client = createClient(url, publishableKey, opts);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn ${label}: ${signInError.message}`);
  return { id: data.user.id, client };
}

const created = [];
try {
  const a = await makeUser("a");
  created.push(a.id);
  const b = await makeUser("b");
  created.push(b.id);
  const anon = createClient(url, publishableKey, opts);

  console.log("Setup:");
  const { data: aPortfolioId, error: createErr } = await a.client.rpc("create_portfolio", {
    p_name: "A main",
    p_broker_id: null,
    p_is_default: false,
    ...PSX_FEES,
  });
  check("user A can create a portfolio", !createErr && aPortfolioId, createErr?.message);
  const { data: aRow } = await a.client.from("portfolios").select("id, fee_profile_id, cgt_rule_id, is_default").eq("id", aPortfolioId).single();
  check("A's first portfolio became the default", aRow?.is_default === true);
  const { data: aProfile } = await a.client.from("profiles").select("id").eq("id", a.id).maybeSingle();
  check("sign-up trigger created A's profile row", aProfile?.id === a.id);

  console.log("Isolation (user B against user A's data):");
  const { data: bSees } = await b.client.from("portfolios").select("id");
  check("B sees none of A's portfolios", Array.isArray(bSees) && !bSees.some((p) => p.id === aPortfolioId));

  const { data: bFee } = await b.client.from("fee_profiles").select("id").eq("id", aRow.fee_profile_id);
  check("B can't read A's fee profile", bFee?.length === 0);

  const { data: bCgt } = await b.client.from("cgt_rules").select("id").eq("id", aRow.cgt_rule_id);
  check("B can't read A's CGT rule", bCgt?.length === 0);

  const { data: bProfile } = await b.client.from("profiles").select("id").eq("id", a.id);
  check("B can't read A's profile", bProfile?.length === 0);

  const { data: bUpdated } = await b.client.from("portfolios").update({ name: "hacked" }).eq("id", aPortfolioId).select();
  check("B can't rename A's portfolio", bUpdated?.length === 0);

  const { data: bFeeUpdated } = await b.client.from("fee_profiles").update({ pct_above: "0" }).eq("id", aRow.fee_profile_id).select();
  check("B can't edit A's fee profile", bFeeUpdated?.length === 0);

  const { error: rpcUpdateErr } = await b.client.rpc("update_portfolio", {
    p_id: aPortfolioId,
    p_name: "hacked",
    p_broker_id: null,
    p_is_default: true,
    ...PSX_FEES,
  });
  check("B's update_portfolio on A's portfolio fails as not found", rpcUpdateErr?.code === "P0002", rpcUpdateErr?.message);

  const { error: rpcDeleteErr } = await b.client.rpc("delete_portfolio", { p_id: aPortfolioId });
  check("B's delete_portfolio on A's portfolio fails as not found", rpcDeleteErr?.code === "P0002", rpcDeleteErr?.message);

  const { data: bDeleted } = await b.client.from("portfolios").delete().eq("id", aPortfolioId).select();
  check("B can't delete A's portfolio directly", bDeleted?.length === 0);

  const { error: stealFeeErr } = await b.client
    .from("portfolios")
    .insert({ name: "B steals fees", fee_profile_id: aRow.fee_profile_id });
  check("B can't attach A's fee profile to a portfolio", stealFeeErr?.code === "42501", stealFeeErr?.message);

  const { error: impersonateErr } = await b.client.from("portfolios").insert({ name: "B as A", user_id: a.id });
  check("B can't create a portfolio owned by A", impersonateErr?.code === "42501", impersonateErr?.message);

  const { error: cashErr } = await b.client
    .from("cash_entries")
    .insert({ portfolio_id: aPortfolioId, type: "deposit", amount: "1000", date: "2026-01-01" });
  check("B can't add cash entries to A's portfolio", cashErr?.code === "42501", cashErr?.message);

  const { data: aStill } = await a.client.from("portfolios").select("name").eq("id", aPortfolioId).single();
  check("A's portfolio is unchanged", aStill?.name === "A main");

  console.log("Shared and system data:");
  const { data: brokers } = await b.client.from("brokers").select("id");
  check("signed-in users can read brokers", (brokers?.length ?? 0) > 0);

  const { data: sysFee } = await b.client.from("fee_profiles").select("id").is("user_id", null);
  check("signed-in users can read the PSX default fee profile", sysFee?.length === 1);

  const { data: sysFeeUpdated } = await b.client.from("fee_profiles").update({ pct_above: "0" }).is("user_id", null).select();
  check("users can't edit the PSX default fee profile", sysFeeUpdated?.length === 0);

  const { error: brokerInsertErr } = await b.client.from("brokers").insert({ name: `Fake ${randomUUID()}` });
  check("users can't add brokers", brokerInsertErr?.code === "42501", brokerInsertErr?.message);

  const { error: secInsertErr } = await b.client.from("securities").insert({ symbol: "FAKE", name: "Fake Co" });
  check("users can't write market data", secInsertErr?.code === "42501", secInsertErr?.message);

  const { data: anonBrokers } = await anon.from("brokers").select("id");
  check("signed-out visitors can't read brokers", anonBrokers?.length === 0);

  const { error: anonRpcErr } = await anon.rpc("create_portfolio", { p_name: "anon", p_broker_id: null, p_is_default: false, ...PSX_FEES });
  check("signed-out visitors can't call create_portfolio", Boolean(anonRpcErr), "call succeeded");

  console.log("Owner operations:");
  const { error: aUpdateErr } = await a.client.rpc("update_portfolio", {
    p_id: aPortfolioId,
    p_name: "A renamed",
    p_broker_id: null,
    p_is_default: true,
    ...PSX_FEES,
    p_pct_above: "0.001",
  });
  const { data: aFeeAfter } = await a.client.from("fee_profiles").select("pct_above").eq("id", aRow.fee_profile_id).single();
  check("A can update own portfolio and fees", !aUpdateErr && Number(aFeeAfter?.pct_above) === 0.001, aUpdateErr?.message);

  const { data: second } = await a.client.rpc("create_portfolio", { p_name: "A second", p_broker_id: null, p_is_default: true, ...PSX_FEES });
  const { data: defaults } = await a.client.from("portfolios").select("id").eq("is_default", true);
  check("making a new default unsets the old one", defaults?.length === 1 && defaults[0].id === second);

  const { error: dupErr } = await a.client.rpc("create_portfolio", { p_name: "a SECOND", p_broker_id: null, p_is_default: false, ...PSX_FEES });
  check("duplicate names (any case) are rejected", dupErr?.code === "23505", dupErr?.message);

  const { error: aDeleteErr } = await a.client.rpc("delete_portfolio", { p_id: second });
  const { data: afterDelete } = await a.client.from("portfolios").select("id, is_default");
  const { data: orphanFee } = await admin.from("fee_profiles").select("id").eq("user_id", a.id);
  check("A can delete own portfolio", !aDeleteErr && afterDelete?.length === 1, aDeleteErr?.message);
  check("deleting the default promotes the remaining portfolio", afterDelete?.[0]?.is_default === true);
  check("deleting removes that portfolio's fee profile copy", orphanFee?.length === 1);
} catch (e) {
  failed++;
  console.error("  ERROR", e.message);
} finally {
  for (const id of created) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error(`  cleanup: could not delete test user ${id}: ${error.message}`);
  }
  console.log(`\n${passed} passed, ${failed} failed. Test users removed.`);
  process.exit(failed ? 1 : 0);
}
