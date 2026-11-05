import Decimal from "decimal.js";
import { z } from "zod";
import { decimalPlaces, isDecimalString } from "./rates";
import { isIsoDate } from "./validation";

// Server-side validation for trade, dividend and cash entry forms. Amounts stay strings.

const EARLIEST_DATE = "2000-01-01";

function amount(label: string, { maxDp = 2, max = "1000000000", positive = false } = {}) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine(isDecimalString, `${label} must be a number`)
    .refine((v) => !isDecimalString(v) || decimalPlaces(v) <= maxDp, `${label} allows at most ${maxDp} decimal places`)
    .refine((v) => !isDecimalString(v) || new Decimal(v).lte(max), `${label} is too large`)
    .refine((v) => !positive || !isDecimalString(v) || new Decimal(v).gt(0), `${label} must be more than 0`);
}

const optionalAmount = (label: string, opts?: Parameters<typeof amount>[1]) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? "0" : v))
    .pipe(amount(label, opts));

/** A trading date: valid, not before 2000, not after `today` (PKT). */
function tradeDate(label: string, today: string) {
  return z
    .string()
    .trim()
    .refine(isIsoDate, `Enter a valid ${label.toLowerCase()}`)
    .refine((v) => !isIsoDate(v) || v >= EARLIEST_DATE, `${label} must be in 2000 or later`)
    .refine((v) => !isIsoDate(v) || v <= today, `${label} can't be in the future`);
}

const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true");

const symbol = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9.-]{1,20}$/, "Choose a stock from the list");

const note = z.string().trim().max(200, "Note must be 200 characters or fewer").transform((v) => (v === "" ? null : v));

export function tradeSchema(today: string) {
  return z.object({
    type: z.enum(["buy", "sell"], { error: "Choose buy or sell" }),
    symbol,
    qty: amount("Quantity", { maxDp: 0, positive: true, max: "100000000" }),
    price: amount("Price", { maxDp: 4, positive: true, max: "1000000" }),
    tradeDate: tradeDate("Trade date", today),
    fee: optionalAmount("Commission"),
    tax: optionalAmount("Sales tax"),
    otherCharges: optionalAmount("Other charges"),
    affectsCash: checkbox,
    note,
  });
}

export function dividendSchema(today: string) {
  return z
    .object({
      symbol,
      paidOn: tradeDate("Payment date", today),
      shares: amount("Shares", { maxDp: 0, positive: true, max: "100000000" }),
      dps: z
        .string()
        .trim()
        .transform((v) => (v === "" ? null : v))
        .pipe(amount("Dividend per share", { maxDp: 4, positive: true, max: "100000" }).nullable()),
      gross: amount("Gross dividend", { positive: true }),
      wht: optionalAmount("Withholding tax"),
      zakat: optionalAmount("Zakat"),
      affectsCash: checkbox,
      note,
    })
    .refine((v) => new Decimal(v.wht).plus(v.zakat).lte(v.gross), {
      message: "Tax and zakat can't be more than the gross dividend",
      path: ["wht"],
    });
}

export function cashEntrySchema(today: string) {
  return z
    .object({
      type: z.enum(["deposit", "withdrawal", "adjustment", "deduction"], { error: "Choose an entry type" }),
      // Only adjustments have a direction; other types send it empty.
      direction: z
        .string()
        .transform((v) => (v === "" ? undefined : v))
        .pipe(z.enum(["in", "out"], { error: "Choose money in or out" }).optional()),
      amount: amount("Amount", { positive: true }),
      date: tradeDate("Date", today),
      note,
    })
    .transform((v) => ({
      ...v,
      /** Signed amount as stored: positive adds cash. */
      signedAmount:
        v.type === "deposit" || (v.type === "adjustment" && v.direction !== "out") ? v.amount : new Decimal(v.amount).neg().toFixed(),
    }));
}

export type FieldErrorMap = Record<string, string>;

/** Parse FormData with a schema into data or per-field messages. */
export function parseForm<S extends z.ZodType>(schema: S, fd: FormData, keys: string[]) {
  const raw: Record<string, string> = {};
  for (const k of keys) {
    const v = fd.get(k);
    raw[k] = typeof v === "string" ? v : "";
  }
  const r = schema.safeParse(raw);
  if (r.success) return { ok: true as const, data: r.data as z.output<S> };
  const fieldErrors: FieldErrorMap = {};
  for (const issue of r.error.issues) {
    const key = String(issue.path[0] ?? "_form");
    fieldErrors[key] ??= issue.message;
  }
  return { ok: false as const, fieldErrors };
}

export const TRADE_FIELDS = ["type", "symbol", "qty", "price", "tradeDate", "fee", "tax", "otherCharges", "affectsCash", "note"];
export const DIVIDEND_FIELDS = ["symbol", "paidOn", "shares", "dps", "gross", "wht", "zakat", "affectsCash", "note"];
export const CASH_FIELDS = ["type", "direction", "amount", "date", "note"];
