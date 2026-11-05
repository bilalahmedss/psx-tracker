import type { CallBudget } from "../budget";
import { PoliteClient } from "../http";
import { computeChange, toPrice, toVolume } from "../quote-math";
import type { CallKind, Candle, MarketDataSource, Quote, SymbolInfo } from "../types";

// EODHD adapter (https://eodhd.com). PSX tickers use the .KAR suffix.
//
// Checked against the live API on the free plan (5 Nov 2026, `npm run eodhd:probe`):
// - Calls are metered PER TICKER: a real-time request for 2 tickers counted as 2 calls.
//   /user (account info) is free. Every metered request reserves its cost from the
//   daily budget first, so the limit can never be overshot.
// - Real-time quotes for .KAR return "NA" for price, volume and time on the free plan
//   (only previousClose is filled), even after the close. So the free plan is end of
//   day only: EODHD_QUOTE_MODE=eod (default) reads daily closes from /eod instead.
//   Paid plans can set EODHD_QUOTE_MODE=realtime for quotes delayed ~15-20 minutes.
// - /eod history on the free plan goes back one year.
// - The bulk end-of-day endpoint costs 100 calls and is refused on the free plan, so
//   this adapter does not offer getEodBulk.

const BASE_URL = "https://eodhd.com/api";
const EXCHANGE = "KAR";
/** EODHD recommends batching real-time quotes; keep batches small. */
export const QUOTE_BATCH_SIZE = 15;

type EodhdSymbolRow = { Code: string; Name: string; Type?: string; Exchange?: string; Currency?: string };
type EodhdRealtimeRow = {
  code: string;
  timestamp: number | "NA";
  open: number | "NA";
  high: number | "NA";
  low: number | "NA";
  close: number | "NA";
  volume: number | "NA";
  previousClose: number | "NA";
  change?: number | "NA";
  change_p?: number | "NA";
};
type EodhdEodRow = { date: string; open: number; high: number; low: number; close: number; volume: number };

/** "OGDC.KAR" -> "OGDC" */
export function fromTicker(code: string): string {
  return code.replace(/\.KAR$/i, "").toUpperCase();
}

export function toTicker(symbol: string): string {
  return `${symbol.toUpperCase()}.${EXCHANGE}`;
}

export function parseSymbols(rows: EodhdSymbolRow[]): SymbolInfo[] {
  return rows
    .filter((r) => r.Code && (!r.Type || r.Type === "Common Stock" || r.Type === "ETF" || r.Type === "Preferred Stock"))
    .map((r) => ({
      symbol: r.Code.toUpperCase(),
      name: r.Name?.trim() || r.Code,
      sector: null,
      isEtf: r.Type === "ETF",
      isShariah: null,
    }));
}

export function parseRealtime(payload: EodhdRealtimeRow | EodhdRealtimeRow[]): Quote[] {
  const rows = Array.isArray(payload) ? payload : [payload];
  const out: Quote[] = [];
  for (const r of rows) {
    const price = toPrice(r.close);
    if (!r.code || price === null || typeof r.timestamp !== "number") continue;
    const prevClose = toPrice(r.previousClose);
    out.push({
      symbol: fromTicker(r.code),
      price,
      prevClose,
      // Recompute from price/prevClose so sign and rounding are consistent across sources.
      ...computeChange(price, prevClose),
      open: toPrice(r.open),
      high: toPrice(r.high),
      low: toPrice(r.low),
      volume: toVolume(r.volume),
      asOf: new Date(r.timestamp * 1000),
    });
  }
  return out;
}

export function parseEod(symbol: string, rows: EodhdEodRow[]): Candle[] {
  return rows
    .map((r) => ({
      symbol,
      date: r.date,
      open: toPrice(r.open),
      high: toPrice(r.high),
      low: toPrice(r.low),
      close: toPrice(r.close),
      volume: toVolume(r.volume),
    }))
    .filter((c): c is Candle => c.close !== null && /^\d{4}-\d{2}-\d{2}$/.test(c.date));
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Calls EODHD charges per request (metered per ticker). */
export function eodhdCallCost(kind: CallKind, n = 1): number {
  if (kind === "symbols") return 1;
  return Math.max(0, n);
}

export type EodhdQuoteMode = "eod" | "realtime";

export function readQuoteMode(raw: string | undefined): EodhdQuoteMode {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "" || v === "eod") return "eod";
  if (v === "realtime") return "realtime";
  throw new Error(`EODHD_QUOTE_MODE must be "eod" or "realtime", got "${raw}"`);
}

export function createEodhdSource(
  apiKey: string,
  { budget, client, mode = "eod" }: { budget: CallBudget; client?: PoliteClient; mode?: EodhdQuoteMode },
): MarketDataSource {
  if (!apiKey) throw new Error("EODHD_API_KEY is not set");
  if (!budget) throw new Error("EODHD needs a call budget");
  // A retry would spend a call the budget did not reserve, so the client never retries.
  const http =
    client ??
    new PoliteClient({ minIntervalMs: 500, maxRetries: 0, baseBackoffMs: 2000, secretParams: ["api_token"] });

  const getJson = async <T>(cost: number, u: string): Promise<T> => {
    await budget.spend(cost);
    return http.getJson<T>(u);
  };

  const url = (path: string, params: Record<string, string> = {}) => {
    const u = new URL(`${BASE_URL}${path}`);
    u.searchParams.set("api_token", apiKey);
    u.searchParams.set("fmt", "json");
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u.toString();
  };

  return {
    id: "eodhd",
    label: "EODHD",
    delayed: true,
    delayNote: mode === "eod" ? "Closing prices from the last trading day." : "Quotes are delayed by about 15-20 minutes.",
    quoteMode: mode === "eod" ? "eod" : "delayed",
    metered: true,
    callCost: eodhdCallCost,
    async listSymbols() {
      return parseSymbols(await getJson<EodhdSymbolRow[]>(eodhdCallCost("symbols"), url(`/exchange-symbol-list/${EXCHANGE}`)));
    },
    async getQuotes(symbols) {
      const out: Quote[] = [];
      for (const batch of chunk(symbols, QUOTE_BATCH_SIZE)) {
        const [first, ...rest] = batch.map(toTicker);
        const params: Record<string, string> = rest.length ? { s: rest.join(",") } : {};
        const rows = await getJson<EodhdRealtimeRow | EodhdRealtimeRow[]>(eodhdCallCost("quotes", batch.length), url(`/real-time/${first}`, params));
        out.push(...parseRealtime(rows));
      }
      return out;
    },
    async getDailyHistory(symbol, from, to) {
      const rows = await getJson<EodhdEodRow[]>(eodhdCallCost("history"), url(`/eod/${toTicker(symbol)}`, { from, to, period: "d" }));
      return parseEod(symbol.toUpperCase(), rows);
    },
  };
}
