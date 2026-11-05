import { D, dec, paisa, ZERO, type Dec } from "./money";

/** Rates as fractions (0.15% = "0.0015"), amounts in Rs. */
export type FeeProfile = {
  threshold: string;
  pctAbove: string;
  perShareBelow: string;
  fedPct: string;
  minFee: string;
  /** Flat CDC charge per trade (Rs). */
  cdcPerTrade: string;
  /** Regulatory levies as fractions of trade value, their sales tax included. */
  psxLevyPct: string;
  secpLevyPct: string;
  nccplLevyPct: string;
};

/** Profiles saved before the CDC and levy fields existed charge none. */
export const NO_EXTRA_CHARGES = { cdcPerTrade: "0", psxLevyPct: "0", secpLevyPct: "0", nccplLevyPct: "0" } as const;

export type Fees = {
  commission: Dec;
  /** Sales tax on the commission. */
  tax: Dec;
  cdc: Dec;
  psx: Dec;
  secp: Dec;
  nccpl: Dec;
  /** CDC + PSX + SECP + NCCPL: what the trade form calls "other charges". */
  other: Dec;
  total: Dec;
};

/**
 * Charges for one trade, each rounded half up to the paisa on its own (as brokers
 * list them on the contract note):
 *  - commission: qty x price x pctAbove when price >= threshold, else qty x perShareBelow;
 *    then the minimum commission
 *  - tax = rounded commission x fedPct
 *  - CDC: flat per trade
 *  - PSX, SECP and NCCPL levies: trade value x their rate
 */
export function computeFees(profile: FeeProfile, qty: string, price: string): Fees {
  const q = dec(qty);
  if (q.lte(0)) return { commission: ZERO, tax: ZERO, cdc: ZERO, psx: ZERO, secp: ZERO, nccpl: ZERO, other: ZERO, total: ZERO };
  const p = dec(price);
  const value = q.mul(p);
  const raw = p.gte(profile.threshold) ? value.mul(profile.pctAbove) : q.mul(profile.perShareBelow);
  const commission = paisa(D.max(raw, dec(profile.minFee)));
  const tax = paisa(commission.mul(profile.fedPct));
  const cdc = paisa(dec(profile.cdcPerTrade));
  const psx = paisa(value.mul(profile.psxLevyPct));
  const secp = paisa(value.mul(profile.secpLevyPct));
  const nccpl = paisa(value.mul(profile.nccplLevyPct));
  const other = cdc.plus(psx).plus(secp).plus(nccpl);
  return { commission, tax, cdc, psx, secp, nccpl, other, total: commission.plus(tax).plus(other) };
}
