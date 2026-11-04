import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PSX_DEFAULT_CGT,
  PSX_DEFAULT_FEES,
  cgtRowToForm,
  feeRowToForm,
  type CgtFormValues,
  type CgtRuleRow,
  type FeeFormValues,
  type FeeProfileRow,
} from "./defaults";

// All reads go through the user's supabase-js client, so RLS applies.
// Explicit FK hints avoid PostgREST ambiguity (brokers also link to fee_profiles).

const FEE_COLS = "threshold, pct_above, per_share_below, fed_pct, min_fee";
const CGT_COLS = "filer_rate, non_filer_rate";

export type BrokerOption = { id: string; name: string; fees: FeeFormValues };

export type PortfolioSummary = {
  id: string;
  name: string;
  taxStatus: "filer" | "non_filer";
  isDefault: boolean;
  brokerName: string | null;
  fees: FeeFormValues;
  cgt: CgtFormValues;
};

export type PortfolioDetail = PortfolioSummary & { brokerId: string | null; updatedAt: string };

type PortfolioRow = {
  id: string;
  name: string;
  tax_status: "filer" | "non_filer";
  is_default: boolean;
  broker_id: string | null;
  updated_at: string;
  brokers: { name: string } | null;
  fee_profiles: FeeProfileRow | null;
  cgt_rules: CgtRuleRow | null;
};

const PORTFOLIO_SELECT = `id, name, tax_status, is_default, broker_id, updated_at,
  brokers!portfolios_broker_id_brokers_id_fk(name),
  fee_profiles!portfolios_fee_profile_id_fee_profiles_id_fk(${FEE_COLS}),
  cgt_rules!portfolios_cgt_rule_id_cgt_rules_id_fk(${CGT_COLS})`;

function toDetail(row: PortfolioRow): PortfolioDetail {
  return {
    id: row.id,
    name: row.name,
    taxStatus: row.tax_status,
    isDefault: row.is_default,
    brokerId: row.broker_id,
    updatedAt: row.updated_at,
    brokerName: row.brokers?.name ?? null,
    fees: row.fee_profiles ? feeRowToForm(row.fee_profiles) : PSX_DEFAULT_FEES,
    cgt: row.cgt_rules ? cgtRowToForm(row.cgt_rules) : PSX_DEFAULT_CGT,
  };
}

export async function listPortfolios(supabase: SupabaseClient): Promise<PortfolioSummary[]> {
  const { data, error } = await supabase
    .from("portfolios")
    .select(PORTFOLIO_SELECT)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .overrideTypes<PortfolioRow[], { merge: false }>();
  if (error) throw new Error(`Could not load portfolios: ${error.message}`);
  return data.map(toDetail);
}

export async function getPortfolio(supabase: SupabaseClient, id: string): Promise<PortfolioDetail | null> {
  const { data, error } = await supabase
    .from("portfolios")
    .select(PORTFOLIO_SELECT)
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<PortfolioRow, { merge: false }>();
  if (error) {
    // Invalid uuid in the URL -> treat as not found.
    if (error.code === "22P02") return null;
    throw new Error(`Could not load portfolio: ${error.message}`);
  }
  return data ? toDetail(data) : null;
}

/** Brokers with their default fee profiles, plus the system PSX defaults. */
export async function getFormOptions(supabase: SupabaseClient): Promise<{
  brokers: BrokerOption[];
  defaults: { fees: FeeFormValues; cgt: CgtFormValues };
}> {
  const [brokersRes, feeRes, cgtRes] = await Promise.all([
    supabase
      .from("brokers")
      .select(`id, name, fee_profiles!brokers_default_fee_profile_id_fee_profiles_id_fk(${FEE_COLS})`)
      .order("sort_order")
      .order("name")
      .overrideTypes<{ id: string; name: string; fee_profiles: FeeProfileRow | null }[], { merge: false }>(),
    supabase.from("fee_profiles").select(FEE_COLS).is("user_id", null).limit(1).maybeSingle<FeeProfileRow>(),
    supabase.from("cgt_rules").select(CGT_COLS).is("user_id", null).limit(1).maybeSingle<CgtRuleRow>(),
  ]);
  if (brokersRes.error) throw new Error(`Could not load brokers: ${brokersRes.error.message}`);

  const fees = feeRes.data ? feeRowToForm(feeRes.data) : PSX_DEFAULT_FEES;
  const cgt = cgtRes.data ? cgtRowToForm(cgtRes.data) : PSX_DEFAULT_CGT;
  return {
    brokers: brokersRes.data.map((b) => ({
      id: b.id,
      name: b.name,
      fees: b.fee_profiles ? feeRowToForm(b.fee_profiles) : fees,
    })),
    defaults: { fees, cgt },
  };
}
