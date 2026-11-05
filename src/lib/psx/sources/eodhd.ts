import { PoliteClient } from "../http";
import { computeChange, toPrice, toVolume } from "../quote-math";
import type { Candle, MarketDataSource, Quote, SymbolInfo } from "../types";

// EODHD adapter (https://eodhd.com). PSX tickers use the .KAR suffix.
// Real-time quotes from EODHD are delayed ~15-20 minutes.
// Response shapes follow EODHD's public docs; verify against the live API
// with your key (see src/lib/psx/sources/__fixtures__/eodhd for the samples used in tests).

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
type EodhdBulkRow = EodhdEodRow & { code: string; exchange_short_name?: string };

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

export function parseBulk(rows: EodhdBulkRow[]): Candle[] {
  return rows.flatMap((r) => (r.code ? parseEod(r.code.toUpperCase(), [r]) : []));
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function createEodhdSource(apiKey: string, client?: PoliteClient): MarketDataSource {
  if (!apiKey) throw new Error("EODHD_API_KEY is not set");
  const http =
    client ??
    new PoliteClient({ minIntervalMs: 500, maxRetries: 3, baseBackoffMs: 2000, secretParams: ["api_token"] });

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
    delayNote: "Quotes are delayed by about 15-20 minutes.",
    async listSymbols() {
      return parseSymbols(await http.getJson<EodhdSymbolRow[]>(url(`/exchange-symbol-list/${EXCHANGE}`)));
    },
    async getQuotes(symbols) {
      const out: Quote[] = [];
      for (const batch of chunk(symbols, QUOTE_BATCH_SIZE)) {
        const [first, ...rest] = batch.map(toTicker);
        const params: Record<string, string> = rest.length ? { s: rest.join(",") } : {};
        out.push(...parseRealtime(await http.getJson<EodhdRealtimeRow | EodhdRealtimeRow[]>(url(`/real-time/${first}`, params))));
      }
      return out;
    },
    async getDailyHistory(symbol, from, to) {
      const rows = await http.getJson<EodhdEodRow[]>(url(`/eod/${toTicker(symbol)}`, { from, to, period: "d" }));
      return parseEod(symbol.toUpperCase(), rows);
    },
    async getEodBulk(date) {
      return parseBulk(await http.getJson<EodhdBulkRow[]>(url(`/eod-bulk-last-day/${EXCHANGE}`, { date })));
    },
  };
}
