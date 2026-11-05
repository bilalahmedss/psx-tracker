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
    p_status_effective_from: null,
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

  const { data: aTxn, error: aTxnErr } = await a.client
    .from("transactions")
    .insert({ portfolio_id: aPortfolioId, symbol: "OGDC", type: "buy", qty: "100", price: "200", fee: "30", tax: "4.5", other_charges: "2", trade_date: "2025-01-10" })
    .select("id")
    .single();
  check("A can add a trade to own portfolio", !aTxnErr && aTxn?.id, aTxnErr?.message);
  const { error: aDivErr } = await a.client
    .from("dividend_receipts")
    .insert({ portfolio_id: aPortfolioId, symbol: "OGDC", gross: "550", wht: "82.5", net: "467.5", paid_on: "2025-04-01", shares: "100", dps: "5.5" });
  check("A can add a dividend to own portfolio", !aDivErr, aDivErr?.message);

  const { data: bTxns } = await b.client.from("transactions").select("id").eq("portfolio_id", aPortfolioId);
  check("B can't read A's trades", bTxns?.length === 0);
  const { data: bDivs } = await b.client.from("dividend_receipts").select("id").eq("portfolio_id", aPortfolioId);
  check("B can't read A's dividends", bDivs?.length === 0);
  const { data: bStatus } = await b.client.from("portfolio_tax_status").select("id").eq("portfolio_id", aPortfolioId);
  check("B can't read A's tax status history", bStatus?.length === 0);

  const { error: bTxnErr } = await b.client
    .from("transactions")
    .insert({ portfolio_id: aPortfolioId, symbol: "OGDC", type: "sell", qty: "100", price: "1", trade_date: "2025-02-01" });
  check("B can't add trades to A's portfolio", bTxnErr?.code === "42501", bTxnErr?.message);
  const { data: bTxnUpd } = await b.client.from("transactions").update({ qty: "1" }).eq("id", aTxn?.id).select();
  check("B can't edit A's trades", bTxnUpd?.length === 0);
  const { data: bTxnDel } = await b.client.from("transactions").delete().eq("id", aTxn?.id).select();
  check("B can't delete A's trades", bTxnDel?.length === 0);
  const { error: bDivErr } = await b.client
    .from("dividend_receipts")
    .insert({ portfolio_id: aPortfolioId, symbol: "OGDC", gross: "1", wht: "0", net: "1", paid_on: "2025-04-01" });
  check("B can't add dividends to A's portfolio", bDivErr?.code === "42501", bDivErr?.message);
  const { error: bStatusErr } = await b.client
    .from("portfolio_tax_status")
    .insert({ portfolio_id: aPortfolioId, status: "non_filer", effective_from: "2025-01-01" });
  check("B can't change A's tax status history", bStatusErr?.code === "42501", bStatusErr?.message);

  console.log("Dashboard, snapshots and import:");
  const { data: snapInsert, error: snapErr } = await b.client
    .from("snapshots")
    .insert({ portfolio_id: aPortfolioId, date: "2025-01-10", market_value: "1", cost: "1", cash: "0" })
    .select();
  check("users can't write snapshots (job only)", snapErr?.code === "42501" && !snapInsert, snapErr?.message);
  await admin.from("snapshots").insert({ portfolio_id: aPortfolioId, date: "2025-01-10", market_value: "20000", cost: "20036.5", cash: "0" });
  const { data: aSnaps } = await a.client.from("snapshots").select("date").eq("portfolio_id", aPortfolioId);
  const { data: bSnaps } = await b.client.from("snapshots").select("date").eq("portfolio_id", aPortfolioId);
  check("owners can read their snapshots", aSnaps?.length === 1);
  check("B can't read A's snapshots", bSnaps?.length === 0);
  const { data: staleNow } = await admin.from("portfolios").select("snapshots_stale").eq("id", aPortfolioId).single();
  check("adding a trade marks snapshots stale", staleNow?.snapshots_stale === true);

  const { error: aLayoutErr } = await a.client
    .from("dashboard_layouts")
    .upsert({ name: "Default", widgets: [{ id: "cash", visible: false }], is_active: true }, { onConflict: "user_id,name" });
  const { data: bLayouts } = await b.client.from("dashboard_layouts").select("id");
  check("A can save a dashboard layout", !aLayoutErr, aLayoutErr?.message);
  check("B can't see A's dashboard layout", bLayouts?.length === 0);
  const { error: bLayoutErr } = await b.client.from("dashboard_layouts").insert({ name: "Hack", widgets: [], user_id: a.id });
  check("B can't create a layout for A", bLayoutErr?.code === "42501", bLayoutErr?.message);

  const { error: bImportErr } = await b.client.rpc("import_portfolio_rows", {
    p_portfolio_id: aPortfolioId,
    p_trades: [],
    p_dividends: [],
    p_cash: [{ type: "deposit", amount: "1", date: "2025-01-01", note: null }],
  });
  check("B can't import into A's portfolio", bImportErr?.code === "P0002", bImportErr?.message);

  const { count: before } = await admin.from("transactions").select("id", { count: "exact", head: true }).eq("portfolio_id", aPortfolioId);
  const { error: badImportErr } = await a.client.rpc("import_portfolio_rows", {
    p_portfolio_id: aPortfolioId,
    p_trades: [{ symbol: "OGDC", type: "buy", qty: "10", price: "100", fee: "0", tax: "0", other_charges: "0", trade_date: "2025-02-01", affects_cash: true, note: null }],
    p_dividends: [],
    p_cash: [{ type: "withdrawal", amount: "500", date: "2025-02-01", note: null }], // positive withdrawal violates a check
  });
  const { count: after } = await admin.from("transactions").select("id", { count: "exact", head: true }).eq("portfolio_id", aPortfolioId);
  check("a failing import saves nothing (all or none)", Boolean(badImportErr) && before === after, badImportErr?.message);

  const { data: okImport, error: okImportErr } = await a.client.rpc("import_portfolio_rows", {
    p_portfolio_id: aPortfolioId,
    p_trades: [{ symbol: "OGDC", type: "buy", qty: "10", price: "100", fee: "1.5", tax: "0.23", other_charges: "0", trade_date: "2025-02-01", affects_cash: true, note: "csv" }],
    p_dividends: [],
    p_cash: [{ type: "deposit", amount: "5000", date: "2025-02-01", note: null }],
  });
  const { data: csvRows } = await a.client.from("transactions").select("source").eq("portfolio_id", aPortfolioId).eq("note", "csv");
  check("A can import into own portfolio, tagged source=csv", !okImportErr && okImport?.trades === 1 && okImport?.cash === 1 && csvRows?.[0]?.source === "csv", okImportErr?.message);

  const { error: badCashErr } = await a.client
    .from("cash_entries")
    .insert({ portfolio_id: aPortfolioId, type: "buy", amount: "-5", date: "2025-01-10" });
  check("trade lines can't be stored as cash entries (they are derived)", badCashErr?.code === "23514", badCashErr?.message);
  const { error: badSignErr } = await a.client
    .from("cash_entries")
    .insert({ portfolio_id: aPortfolioId, type: "withdrawal", amount: "500", date: "2025-01-10" });
  check("withdrawals must be stored as negative amounts", badSignErr?.code === "23514", badSignErr?.message);

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

  for (const table of ["prices_latest", "market_holidays", "market_sessions", "job_runs", "api_usage", "market_data_state"]) {
    const { error: readErr } = await b.client.from(table).select("*").limit(1);
    check(`signed-in users can read ${table}`, !readErr, readErr?.message);
  }
  const { data: holidaysAnon } = await anon.from("market_holidays").select("date");
  check("signed-out visitors can't read market_holidays", holidaysAnon?.length === 0);
  const { error: holidayInsertErr } = await b.client.from("market_holidays").insert({ date: "2099-01-01", name: "Fake" });
  check("users can't add market holidays", holidayInsertErr?.code === "42501", holidayInsertErr?.message);
  const { error: jobInsertErr } = await b.client.from("job_runs").insert({ job: "fake" });
  check("users can't write job_runs", jobInsertErr?.code === "42501", jobInsertErr?.message);
  const { error: priceInsertErr } = await b.client
    .from("prices_latest")
    .insert({ symbol: "OGDC", price: "1", as_of: new Date().toISOString(), source: "fake" });
  check("users can't write prices_latest", priceInsertErr?.code === "42501", priceInsertErr?.message);
  // The daily call counter and refresh state are written by jobs only: a user who
  // could lower the counter could make the app overspend the provider's limit.
  const { error: usageInsertErr } = await b.client.from("api_usage").insert({ provider: "eodhd", day: "2099-01-01", calls: 0 });
  check("users can't write api_usage", usageInsertErr?.code === "42501", usageInsertErr?.message);
  const { data: usageUpdated } = await b.client.from("api_usage").update({ calls: 0 }).neq("provider", "").select();
  check("users can't reset the call counter", usageUpdated?.length === 0);
  const { error: stateInsertErr } = await b.client.from("market_data_state").insert({ job: "fake", source: "x", quote_mode: "live" });
  check("users can't write market_data_state", stateInsertErr?.code === "42501", stateInsertErr?.message);
  const { data: stateUpdated } = await b.client.from("market_data_state").update({ last_attempt_at: null }).neq("job", "").select();
  check("users can't clear the refresh cooldown", stateUpdated?.length === 0);
  const { data: usageAnon } = await anon.from("api_usage").select("calls");
  check("signed-out visitors can't read api_usage", usageAnon?.length === 0);
  const { data: holidayUpdated } = await b.client.from("market_holidays").update({ name: "hacked" }).neq("date", "1900-01-01").select();
  check("users can't edit market holidays", holidayUpdated?.length === 0);

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
    p_status_effective_from: null,
  });
  const { data: aFeeAfter } = await a.client.from("fee_profiles").select("pct_above").eq("id", aRow.fee_profile_id).single();
  check("A can update own portfolio and fees", !aUpdateErr && Number(aFeeAfter?.pct_above) === 0.001, aUpdateErr?.message);

  // Regression: a portfolio's broker must be stored exactly as chosen, on create and on edit.
  const { data: jsGlobal } = await a.client.from("brokers").select("id").eq("name", "JS Global Capital").single();
  const { data: brokerPid, error: brokerCreateErr } = await a.client.rpc("create_portfolio", {
    p_name: "Broker check",
    p_broker_id: jsGlobal?.id,
    p_is_default: false,
    ...PSX_FEES,
  });
  const brokerOf = async (pid) =>
    (await a.client.from("portfolios").select("brokers!portfolios_broker_id_brokers_id_fk(name)").eq("id", pid).single()).data?.brokers?.name;
  check("the chosen broker is saved on create", !brokerCreateErr && (await brokerOf(brokerPid)) === "JS Global Capital", brokerCreateErr?.message);
  await a.client.rpc("update_portfolio", {
    p_id: brokerPid,
    p_name: "Broker check renamed",
    p_broker_id: jsGlobal?.id,
    p_is_default: false,
    ...PSX_FEES,
    p_status_effective_from: null,
  });
  check("the broker survives an edit", (await brokerOf(brokerPid)) === "JS Global Capital");
  await a.client.rpc("delete_portfolio", { p_id: brokerPid });

  const { data: startStatus } = await a.client.from("portfolio_tax_status").select("status, effective_from").eq("portfolio_id", aPortfolioId);
  check("a new portfolio starts with one status row 'from the start'", startStatus?.length === 1 && startStatus[0].effective_from === "1900-01-01");

  const { error: statusErr } = await a.client.rpc("update_portfolio", {
    p_id: aPortfolioId,
    p_name: "A renamed",
    p_broker_id: null,
    p_is_default: true,
    ...PSX_FEES,
    p_tax_status: "non_filer",
    p_status_effective_from: "2025-07-01",
  });
  const { data: statusRows } = await a.client
    .from("portfolio_tax_status")
    .select("id, status, effective_from")
    .eq("portfolio_id", aPortfolioId)
    .order("effective_from");
  const { data: aNow } = await a.client.from("portfolios").select("tax_status").eq("id", aPortfolioId).single();
  check(
    "a status change is recorded with its effective date",
    !statusErr && statusRows?.length === 2 && statusRows[1].status === "non_filer" && statusRows[1].effective_from === "2025-07-01",
    statusErr?.message,
  );
  check("the portfolio shows today's status", aNow?.tax_status === "non_filer");

  const { error: undoErr } = await a.client.rpc("delete_tax_status_change", { p_change_id: statusRows?.[1]?.id });
  const { data: aAfterUndo } = await a.client.from("portfolios").select("tax_status").eq("id", aPortfolioId).single();
  check("removing a status change restores the earlier status", !undoErr && aAfterUndo?.tax_status === "filer", undoErr?.message);
  const { error: undoStartErr } = await a.client.rpc("delete_tax_status_change", { p_change_id: statusRows?.[0]?.id });
  check("the starting status can't be removed", undoStartErr?.code === "22023", undoStartErr?.message);

  const { error: floorErr } = await a.client.rpc("create_portfolio", { p_name: "Low rate", p_broker_id: null, p_is_default: false, ...PSX_FEES, p_non_filer_rate: "0.10" });
  check("non-filer CGT rate below 15% is rejected", floorErr?.code === "23514", floorErr?.message);

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
