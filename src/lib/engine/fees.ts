import { D, dec, paisa, ZERO, type Dec } from "./money";

/** Rates as fractions (0.15% = "0.0015"), amounts in Rs. */
export type FeeProfile = {
  threshold: string;
  pctAbove: string;
  perShareBelow: string;
  fedPct: string;
  minFee: string;
};

/**
 * Broker commission and sales tax (FED) for one trade.
 *  - price >= threshold: commission = qty x price x pctAbove
 *  - price <  threshold: commission = qty x perShareBelow
 *  - then the minimum commission, rounded half up to the paisa
 *  - tax = rounded commission x fedPct, rounded to the paisa
 */
export function computeFees(profile: FeeProfile, qty: string, price: string): { commission: Dec; tax: Dec; total: Dec } {
  const q = dec(qty);
  if (q.lte(0)) return { commission: ZERO, tax: ZERO, total: ZERO };
  const p = dec(price);
  const raw = p.gte(profile.threshold) ? q.mul(p).mul(profile.pctAbove) : q.mul(profile.perShareBelow);
  const commission = paisa(D.max(raw, dec(profile.minFee)));
  const tax = paisa(commission.mul(profile.fedPct));
  return { commission, tax, total: commission.plus(tax) };
}
