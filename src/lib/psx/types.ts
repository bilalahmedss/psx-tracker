// Shared shapes for market-data sources. Prices are decimal strings, never floats.

export type SymbolInfo = {
  symbol: string;
  name: string;
  sector: string | null;
  isEtf: boolean;
  isShariah: boolean | null; // null = source doesn't say
};

export type Quote = {
  symbol: string;
  price: string;
  prevClose: string | null;
  change: string | null;
  changePct: string | null;
  open: string | null;
  high: string | null;
  low: string | null;
  volume: number | null;
  /** When the source says the price is from. */
  asOf: Date;
};

export type Candle = {
  symbol: string;
  date: string; // YYYY-MM-DD (PKT trading day)
  open: string | null;
  high: string | null;
  low: string | null;
  close: string;
  volume: number | null;
};

export type SourceId = "demo" | "eodhd";

/** What a source's prices are: live, delayed intraday quotes, or daily closes only. */
export type QuoteMode = "live" | "delayed" | "eod";

export type CallKind = "quotes" | "history" | "symbols";

/**
 * A market-data provider. Everything PSX-related goes through one of these,
 * so changing provider is a one-file change in src/lib/psx/sources/.
 */
export interface MarketDataSource {
  id: SourceId;
  /** Human-readable name for the UI. */
  label: string;
  /** True when quotes lag the market (e.g. EODHD is 15-20 min delayed). */
  delayed: boolean;
  delayNote: string | null;
  /** How prices are refreshed. In "eod" mode jobs read closes with getDailyHistory instead of getQuotes. */
  quoteMode: QuoteMode;
  /** Metered sources spend from a daily call budget (see budget.ts). */
  metered: boolean;
  /** Calls a request costs: quotes for n symbols, history for n symbols, or the symbol list. */
  callCost(kind: CallKind, n?: number): number;
  listSymbols(): Promise<SymbolInfo[]>;
  getQuotes(symbols: string[]): Promise<Quote[]>;
  getDailyHistory(symbol: string, from: string, to: string): Promise<Candle[]>;
  /** Optional: all symbols' candles for one day in a single request. */
  getEodBulk?(date: string): Promise<Candle[]>;
}
