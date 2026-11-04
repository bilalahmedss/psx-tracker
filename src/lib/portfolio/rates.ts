import Decimal from "decimal.js";

// Rates are stored as fractions (0.15% => "0.0015") and shown as percents ("0.15").
// All conversions use exact decimal arithmetic, never JS floats.

const DECIMAL_RE = /^\d+(\.\d+)?$/;

/** True for a plain non-negative decimal string like "0.15" or "20". */
export function isDecimalString(value: string): boolean {
  return DECIMAL_RE.test(value.trim());
}

/** "0.15" (percent) -> "0.0015" (fraction). */
export function percentToFraction(percent: string): string {
  return new Decimal(percent.trim()).div(100).toFixed();
}

/** "0.0015" (fraction) -> "0.15" (percent), without trailing zeros. */
export function fractionToPercent(fraction: string | number): string {
  return new Decimal(fraction).mul(100).toFixed();
}

/** Strip trailing zeros from a numeric DB value: "20.0000" -> "20". */
export function trimDecimal(value: string | number): string {
  return new Decimal(value).toFixed();
}

/** Number of digits after the decimal point. */
export function decimalPlaces(value: string): number {
  return new Decimal(value.trim()).decimalPlaces();
}
