import Decimal from "decimal.js";
import { defaultWhtRate } from "@/lib/engine/dividends";
import { computeFees, type FeeProfile } from "@/lib/engine/fees";
import { dec, paisa } from "@/lib/engine/money";
import { statusOn } from "@/lib/engine/tax-status";
import type { TaxStatusPeriod } from "@/lib/engine/types";
import { parseCsv } from "./csv";

// CSV import: parse, validate and normalise rows into inserts. Pure; the server
// action adds the oversell check and saves everything in one transaction.

export const IMPORT_COLUMNS = [
  "date",
  "type",
  "symbol",
  "quantity",
  "price",
  "commission",
  "sales_tax",
  "other_charges",
  "amount",
  "tax_withheld",
  "zakat",
  "affects_cash",
  "note",
] as const;

export const IMPORT_TYPES = ["buy", "sell", "dividend", "deposit", "withdrawal"] as const;

/**
 * Column names from other apps' exports, mapped to ours. SmartPSX's
 * broker_fees is the all-in charge per trade (commission + FED + other charges).
 */
export const COLUMN_ALIASES: Record<string, string> = {
  broker_fees: "total_charges",
  fees: "total_charges",
  notes: "note",
  qty: "quantity",
  shares: "quantity",
  trade_date: "date",
};

/** Accepted after aliasing: the template columns plus an all-in charges column. */
const KNOWN_COLUMNS = new Set<string>([...IMPORT_COLUMNS, "total_charges"]);
export const MAX_IMPORT_ROWS = 5000;

export type TradeInsert = {
  symbol: string;
  type: "buy" | "sell";
  qty: string;
  price: string;
  fee: string;
  tax: string;
  other_charges: string;
  trade_date: string;
  affects_cash: boolean;
  note: string | null;
};
export type DividendInsert = {
  symbol: string;
  shares: string;
  dps: string | null;
  gross: string;
  wht: string;
  zakat: string;
  net: string;
  paid_on: string;
  affects_cash: boolean;
  note: string | null;
};
export type CashInsert = { type: "deposit" | "withdrawal"; amount: string; date: string; note: string | null };

export type PreviewRow = {
  line: number;
  date: string;
  type: string;
  symbol: string;
  summary: string;
  error: string | null;
};

export type ImportResult = {
  /** File-level problem (no header, too many rows...). */
  fatal: string | null;
  /** Non-blocking notes, e.g. ignored or renamed columns. */
  warnings: string[];
  rows: PreviewRow[];
  trades: TradeInsert[];
  dividends: DividendInsert[];
  cash: CashInsert[];
  errorCount: number;
};

export type ImportContext = {
  today: string;
  feeProfile: FeeProfile;
  taxHistory: TaxStatusPeriod[];
  knownSymbols: Set<string>;
};

class RowError extends Error {}

/** "YYYY-MM-DD", "DD/MM/YYYY", "D-M-YYYY" -> ISO date. */
export function parseDate(raw: string): string {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else throw new RowError(`Date "${raw}" isn't YYYY-MM-DD or DD/MM/YYYY`);
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const check = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== iso) throw new RowError(`Date "${raw}" doesn't exist`);
  return iso;
}

/** "1,234.50", "Rs 1,234.50" -> "1234.50"; blank -> null. */
export function parseNumber(raw: string | undefined, label: string): string | null {
  const s = (raw ?? "").trim().replace(/^rs\.?\s*/i, "").replace(/,/g, "");
  if (s === "") return null;
  if (!/^\d+(\.\d+)?$/.test(s)) throw new RowError(`${label} "${raw}" isn't a number`);
  return new Decimal(s).toFixed();
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "") return fallback;
  if (["yes", "y", "true", "1"].includes(s)) return true;
  if (["no", "n", "false", "0"].includes(s)) return false;
  throw new RowError(`affects_cash "${raw}" should be yes or no`);
}

function required(value: string | null, label: string): string {
  if (value === null) throw new RowError(`${label} is required`);
  return value;
}

function positive(value: string, label: string, wholeNumber = false): string {
  const d = new Decimal(value);
  if (d.lte(0)) throw new RowError(`${label} must be more than 0`);
  if (wholeNumber && !d.isInteger()) throw new RowError(`${label} must be a whole number`);
  return value;
}

const fmt = (v: string) => new Decimal(v).toFixed(2);

type AutoFees = { commission: { toFixed(dp: number): string }; tax: { toFixed(dp: number): string }; other: { toFixed(dp: number): string } };

/**
 * Charges for a trade row. The file's fees are used as-is: the fee profile only
 * fills in when commission and sales_tax are both blank (and then also fills
 * other_charges, e.g. CDC and levies, if that is blank too). An all-in total (e.g.
 * SmartPSX's broker_fees) is stored as the commission with no separate tax.
 */
export function tradeCharges(input: {
  commission: string | null;
  salesTax: string | null;
  other: string | null;
  total: string | null;
  auto: () => AutoFees;
}): { fee: string; tax: string; other: string } {
  const { commission, salesTax, other, total } = input;
  if (total !== null) {
    if (commission !== null || salesTax !== null || other !== null) {
      throw new RowError("Give either broker_fees (total charges) or commission/sales_tax/other_charges, not both");
    }
    return { fee: total, tax: "0", other: "0" };
  }
  if (commission === null && salesTax === null) {
    const a = input.auto();
    return { fee: a.commission.toFixed(2), tax: a.tax.toFixed(2), other: other ?? a.other.toFixed(2) };
  }
  // At least one of commission/sales_tax given: never top up the other from the profile.
  return { fee: commission ?? "0", tax: salesTax ?? "0", other: other ?? "0" };
}

export function parseImport(text: string, ctx: ImportContext): ImportResult {
  const empty = { rows: [], trades: [], dividends: [], cash: [], errorCount: 0, warnings: [] as string[] };
  const table = parseCsv(text);
  if (table.length === 0) return { fatal: "The file is empty.", ...empty };

  const raw = table[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const header = raw.map((h) => COLUMN_ALIASES[h] ?? h);
  for (const col of ["date", "type"]) {
    if (!header.includes(col)) return { ...empty, fatal: `Missing the "${col}" column. Start from the template.` };
  }
  if (table.length - 1 > MAX_IMPORT_ROWS) return { ...empty, fatal: `Too many rows (max ${MAX_IMPORT_ROWS}). Split the file.` };

  // Unknown columns are skipped with a warning rather than failing the file.
  const warnings: string[] = [];
  const ignored = raw.filter((h, i) => h && !KNOWN_COLUMNS.has(header[i]));
  if (ignored.length) warnings.push(`Ignored column(s) we don't use: ${ignored.join(", ")}.`);
  const mapped = raw.filter((h, i) => COLUMN_ALIASES[h] && KNOWN_COLUMNS.has(header[i]));
  if (mapped.length) {
    const label = (h: string) => (COLUMN_ALIASES[h] === "total_charges" ? "total charges (commission + tax + other)" : COLUMN_ALIASES[h]);
    warnings.push(`Read ${mapped.map((h) => `${h} as ${label(h)}`).join("; ")}.`);
  }

  const result: ImportResult = { ...empty, fatal: null, warnings, rows: [], trades: [], dividends: [], cash: [] };

  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const get = (col: (typeof IMPORT_COLUMNS)[number] | "total_charges") => {
      const idx = header.indexOf(col);
      return idx >= 0 ? (cells[idx] ?? "").trim() : "";
    };
    const type = get("type").toLowerCase();
    const symbol = get("symbol").toUpperCase();
    const preview: PreviewRow = { line, date: get("date"), type, symbol, summary: "", error: null };

    try {
      if (!(IMPORT_TYPES as readonly string[]).includes(type)) throw new RowError(`Type "${get("type")}" should be one of ${IMPORT_TYPES.join(", ")}`);
      const date = parseDate(get("date"));
      preview.date = date;
      if (date > ctx.today) throw new RowError("Date is in the future");
      if (date < "2000-01-01") throw new RowError("Date must be in 2000 or later");
      const note = get("note").slice(0, 200) || null;

      if (type === "buy" || type === "sell") {
        if (!ctx.knownSymbols.has(symbol)) throw new RowError(symbol ? `Unknown symbol "${symbol}"` : "Symbol is required");
        const qty = positive(required(parseNumber(get("quantity"), "quantity"), "quantity"), "quantity", true);
        const price = positive(required(parseNumber(get("price"), "price"), "price"), "price");
        const { fee, tax, other } = tradeCharges({
          commission: parseNumber(get("commission"), "commission"),
          salesTax: parseNumber(get("sales_tax"), "sales_tax"),
          other: parseNumber(get("other_charges"), "other_charges"),
          total: parseNumber(get("total_charges"), "broker_fees"),
          auto: () => computeFees(ctx.feeProfile, qty, price),
        });
        const affectsCash = parseBool(get("affects_cash"), true);
        result.trades.push({ symbol, type, qty, price, fee, tax, other_charges: other, trade_date: date, affects_cash: affectsCash, note });
        preview.summary = `${type === "buy" ? "Buy" : "Sell"} ${qty} @ ${price}; charges ${fmt(dec(fee).plus(tax).plus(other).toFixed())}`;
      } else if (type === "dividend") {
        if (!ctx.knownSymbols.has(symbol)) throw new RowError(symbol ? `Unknown symbol "${symbol}"` : "Symbol is required");
        const shares = positive(required(parseNumber(get("quantity"), "quantity (shares)"), "quantity (shares)"), "quantity (shares)", true);
        const dps = parseNumber(get("price"), "price (dividend per share)");
        const amount = parseNumber(get("amount"), "amount (gross)");
        if (!dps && !amount) throw new RowError("Give either price (dividend per share) or amount (gross)");
        const gross = paisa(amount ? dec(amount) : dec(shares).mul(dps!));
        if (gross.lte(0)) throw new RowError("Gross dividend must be more than 0");
        const whtRaw = parseNumber(get("tax_withheld"), "tax_withheld");
        const wht = whtRaw !== null ? paisa(dec(whtRaw)) : paisa(gross.mul(defaultWhtRate(statusOn(ctx.taxHistory, date))));
        const zakat = paisa(dec(parseNumber(get("zakat"), "zakat") ?? "0"));
        const net = gross.minus(wht).minus(zakat);
        if (net.isNegative()) throw new RowError("Tax withheld and zakat are more than the gross dividend");
        const affectsCash = parseBool(get("affects_cash"), false);
        result.dividends.push({
          symbol,
          shares,
          dps,
          gross: gross.toFixed(2),
          wht: wht.toFixed(2),
          zakat: zakat.toFixed(2),
          net: net.toFixed(2),
          paid_on: date,
          affects_cash: affectsCash,
          note,
        });
        preview.summary = `Dividend ${gross.toFixed(2)} gross, ${wht.toFixed(2)} tax, ${net.toFixed(2)} net`;
      } else {
        const amount = positive(required(parseNumber(get("amount"), "amount"), "amount"), "amount");
        result.cash.push({ type: type as "deposit" | "withdrawal", amount: type === "deposit" ? amount : new Decimal(amount).neg().toFixed(), date, note });
        preview.summary = `${type === "deposit" ? "Deposit" : "Withdrawal"} ${fmt(amount)}`;
        preview.symbol = "";
      }
    } catch (e) {
      if (!(e instanceof RowError)) throw e;
      preview.error = e.message;
      result.errorCount++;
    }
    result.rows.push(preview);
  });

  return result;
}

/** Example rows for the downloadable template. */
export const TEMPLATE_CSV = [
  IMPORT_COLUMNS.join(","),
  "2025-01-01,deposit,,,,,,,100000,,,,Opening deposit",
  "2025-01-10,buy,OGDC,1000,50,,,5,,,,yes,Commission and tax left blank: filled from your fee profile",
  "10/03/2025,sell,OGDC,400,60,36,5.40,2,,,,yes,Commission and tax as on the contract note",
  "2025-04-01,dividend,OGDC,600,5.50,,,,,,,no,Tax withheld left blank: 15% or 30% by filer status",
  "2025-05-01,withdrawal,,,,,,,10000,,,,To bank account",
].join("\r\n") + "\r\n";
