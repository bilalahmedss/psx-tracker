import { addYears, D, dec, paisa, sum, ZERO, type Dec } from "./money";
import { CGT_BRACKETS, NON_FILER_MIN_RATE, TAX_YEAR_START_MONTH, type CgtBracket } from "./tax-rules";

export type CgtRateResult = {
  rate: Dec;
  rule: CgtBracket["id"];
  ruleLabel: string;
  basis: "filer" | "non_filer";
  /** True when the rate is a placeholder we haven't modelled yet. */
  toConfirm: boolean;
};

export function bracketFor(acquiredOn: string): CgtBracket {
  const b = CGT_BRACKETS.find(
    (r) => (r.acquiredFrom === null || acquiredOn >= r.acquiredFrom) && (r.acquiredBefore === null || acquiredOn < r.acquiredBefore),
  );
  if (!b) throw new Error(`No CGT rule for acquisition date ${acquiredOn}`);
  return b;
}

function filerRate(b: CgtBracket, acquiredOn: string, soldOn: string): Dec {
  if (b.filer.kind === "flat") return dec(b.filer.rate);
  // "Holding period does not exceed N years": sold on or before the N-year anniversary.
  for (const slab of b.filer.slabs) if (soldOn <= addYears(acquiredOn, slab.maxYears)) return dec(slab.rate);
  return dec(b.filer.beyond);
}

/**
 * CGT rate for shares acquired on `acquiredOn` and sold on `soldOn`.
 * The filer rate needs ATL status on both dates; otherwise the non-filer rule applies.
 */
export function cgtRate(input: {
  acquiredOn: string;
  soldOn: string;
  filerOnBuy: boolean;
  filerOnSell: boolean;
  /** The portfolio's non-filer rate (fraction); floored at NON_FILER_MIN_RATE. */
  nonFilerRate: string;
}): CgtRateResult {
  const b = bracketFor(input.acquiredOn);
  const filer = input.filerOnBuy && input.filerOnSell;
  const base = { rule: b.id, ruleLabel: b.label };

  if (filer) return { ...base, rate: filerRate(b, input.acquiredOn, input.soldOn), basis: "filer", toConfirm: false };
  if (b.nonFiler === "portfolio_rate") {
    return { ...base, rate: D.max(dec(input.nonFilerRate), dec(NON_FILER_MIN_RATE)), basis: "non_filer", toConfirm: false };
  }
  return { ...base, rate: filerRate(b, input.acquiredOn, input.soldOn), basis: "non_filer", toConfirm: true };
}

/** Pakistan tax year (July-June), named by the year it ends. */
export function taxYearOf(date: string): number {
  const [y, m] = date.split("-").map(Number);
  return m >= TAX_YEAR_START_MONTH ? y + 1 : y;
}

export type TaxYearCgt = { taxYear: number; gains: Dec; losses: Dec; netGain: Dec; cgt: Dec };

/**
 * Estimated CGT per tax year: sum of (gain x rate) for every sale in the year,
 * so losses offset gains within the year; never below zero. Losses are not
 * carried forward to later years (see docs/backlog.md).
 */
export function cgtByTaxYear(items: { soldOn: string; gain: Dec | string; rate: Dec | string }[]): TaxYearCgt[] {
  const byYear = new Map<number, { gain: Dec; rate: Dec }[]>();
  for (const i of items) {
    const ty = taxYearOf(i.soldOn);
    byYear.set(ty, [...(byYear.get(ty) ?? []), { gain: dec(i.gain), rate: dec(i.rate) }]);
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([taxYear, rows]) => {
      const gains = sum(rows.filter((r) => r.gain.gt(0)).map((r) => r.gain));
      const losses = sum(rows.filter((r) => r.gain.lt(0)).map((r) => r.gain));
      const raw = sum(rows.map((r) => r.gain.mul(r.rate)));
      return { taxYear, gains, losses, netGain: gains.plus(losses), cgt: paisa(D.max(raw, ZERO)) };
    });
}
