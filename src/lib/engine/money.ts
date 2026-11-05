import Decimal from "decimal.js";

/** Decimal with headroom for exact cost allocation (per-share costs repeat). */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof D>;

export const ZERO = new D(0);

export function dec(value: Decimal.Value | null | undefined): Dec {
  return new D(value ?? 0);
}

/** Round half up to the paisa. */
export function paisa(value: Dec): Dec {
  return value.toDecimalPlaces(2, D.ROUND_HALF_UP);
}

export function sum(values: Dec[]): Dec {
  return values.reduce((a, b) => a.plus(b), ZERO);
}

/** Whole days from `from` to `to` (YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Same calendar date `years` later; 29 Feb becomes 28 Feb in non-leap years. */
export function addYears(date: string, years: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = y + years;
  const lastDay = new Date(Date.UTC(target, m, 0)).getUTCDate();
  return `${target}-${String(m).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}
