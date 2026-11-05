import Decimal from "decimal.js";
import type { Candle, Quote } from "./types";

// Exact decimal helpers for quotes. Inputs come from APIs as numbers, strings or "NA".

/** Normalise an API price to a decimal string, or null when missing/invalid. */
export function toPrice(value: unknown): string | null {
  if (value === null || value === undefined || value === "" || value === "NA") return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  try {
    const d = new Decimal(value);
    if (!d.isFinite() || d.isNegative()) return null;
    return d.toDecimalPlaces(4).toFixed();
  } catch {
    return null;
  }
}

/** Normalise a volume to a non-negative integer, or null. */
export function toVolume(value: unknown): number | null {
  const p = toPrice(value);
  if (p === null) return null;
  const n = Number(new Decimal(p).toDecimalPlaces(0));
  return Number.isSafeInteger(n) ? n : null;
}

/** Change and % change vs previous close, rounded to 2 dp. */
export function computeChange(
  price: string,
  prevClose: string | null,
): { change: string | null; changePct: string | null } {
  if (prevClose === null) return { change: null, changePct: null };
  const prev = new Decimal(prevClose);
  if (prev.isZero()) return { change: null, changePct: null };
  const change = new Decimal(price).minus(prev);
  return {
    change: change.toDecimalPlaces(4).toFixed(),
    changePct: change.div(prev).mul(100).toDecimalPlaces(2).toFixed(),
  };
}

/** Round to PSX tick size (0.01). */
export function toTick(value: Decimal.Value): string {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

/**
 * A quote from daily candles (end-of-day mode): the newest close, with the
 * close before it as the previous close. `asOf` is when that close happened.
 */
export function quoteFromCandles(candles: Candle[], asOf: (date: string) => Date): Quote | null {
  const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted.at(-1);
  if (!last) return null;
  const prevClose = sorted.at(-2)?.close ?? null;
  return {
    symbol: last.symbol,
    price: last.close,
    prevClose,
    ...computeChange(last.close, prevClose),
    open: last.open,
    high: last.high,
    low: last.low,
    volume: last.volume,
    asOf: asOf(last.date),
  };
}
