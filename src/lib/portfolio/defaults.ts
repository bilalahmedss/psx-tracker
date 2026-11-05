import { fractionToPercent, trimDecimal } from "./rates";

/** Fee values as the form shows them: Rs amounts and percents, as strings. */
export type FeeFormValues = {
  threshold: string;
  pctAbove: string; // percent
  perShareBelow: string;
  fedPct: string; // percent
  minFee: string;
  cdcPerTrade: string; // Rs per trade
  psxLevyPct: string; // percent of trade value, tax included
  secpLevyPct: string; // percent
  nccplLevyPct: string; // percent
};

export type CgtFormValues = {
  filerRate: string; // percent
  nonFilerRate: string; // percent
};

/** Database row shape for a fee profile (numeric columns arrive as strings). */
export type FeeProfileRow = {
  threshold: string | number;
  pct_above: string | number;
  per_share_below: string | number;
  fed_pct: string | number;
  min_fee: string | number;
  cdc_per_trade?: string | number | null;
  psx_levy_pct?: string | number | null;
  secp_levy_pct?: string | number | null;
  nccpl_levy_pct?: string | number | null;
};

export type CgtRuleRow = {
  filer_rate: string | number;
  non_filer_rate: string | number;
};

/**
 * PSX defaults, matching the seeded system rows. Commission: 0.15% of value
 * at or above Rs 20/share, Rs 0.03/share below. Sales tax on commission: 15% (Sindh).
 */
export const PSX_DEFAULT_FEES: FeeFormValues = {
  threshold: "20",
  pctAbove: "0.15",
  perShareBelow: "0.03",
  fedPct: "15",
  minFee: "0",
  cdcPerTrade: "0",
  psxLevyPct: "0",
  secpLevyPct: "0",
  nccplLevyPct: "0",
};

/** CGT for shares acquired on or after 1 Jul 2024. Estimates only. */
export const PSX_DEFAULT_CGT: CgtFormValues = {
  filerRate: "15",
  nonFilerRate: "30",
};

export function feeRowToForm(row: FeeProfileRow): FeeFormValues {
  return {
    threshold: trimDecimal(row.threshold),
    pctAbove: fractionToPercent(row.pct_above),
    perShareBelow: trimDecimal(row.per_share_below),
    fedPct: fractionToPercent(row.fed_pct),
    minFee: trimDecimal(row.min_fee),
    cdcPerTrade: trimDecimal(row.cdc_per_trade ?? 0),
    psxLevyPct: fractionToPercent(row.psx_levy_pct ?? 0),
    secpLevyPct: fractionToPercent(row.secp_levy_pct ?? 0),
    nccplLevyPct: fractionToPercent(row.nccpl_levy_pct ?? 0),
  };
}

export function cgtRowToForm(row: CgtRuleRow): CgtFormValues {
  return {
    filerRate: fractionToPercent(row.filer_rate),
    nonFilerRate: fractionToPercent(row.non_filer_rate),
  };
}
