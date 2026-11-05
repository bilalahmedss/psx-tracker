import Decimal from "decimal.js";
import {
  addDays,
  isTradingDay,
  lastCloseMinutes,
  pktParts,
  pktToDate,
  previousTradingDay,
  sessionProgress,
  type CalendarData,
} from "../calendar";
import { computeChange, toTick } from "../quote-math";
import type { Candle, MarketDataSource, Quote, SymbolInfo } from "../types";
import { DEMO_SYMBOLS } from "./demo-symbols";

// Deterministic fake prices: the same symbol and time always give the same quote,
// so jobs, the test page and tests agree. Prices only move during PSX sessions.

/** FNV-1a hash of a string mapped to [0, 1). */
export function unitHash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 2 ** 32;
}

const bySymbol = new Map(DEMO_SYMBOLS.map((s) => [s.symbol, s]));

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

/** Closing price for a trading day: a slow wave plus daily noise around the base. */
export function demoClose(symbol: string, date: string): Decimal {
  const s = bySymbol.get(symbol);
  if (!s) throw new Error(`Unknown demo symbol ${symbol}`);
  const phase = unitHash(`${symbol}:phase`) * Math.PI * 2;
  const wave = 0.12 * Math.sin(dayNumber(date) / 23 + phase);
  const noise = 0.04 * (unitHash(`${symbol}:${date}:close`) - 0.5);
  return new Decimal(s.base).mul(1 + wave + noise);
}

function demoOpen(symbol: string, date: string, prev: Decimal): Decimal {
  return prev.mul(1 + 0.006 * (unitHash(`${symbol}:${date}:open`) - 0.5));
}

export function demoQuote(symbol: string, now: Date, cal: CalendarData): Quote {
  const { date, minutes } = pktParts(now);
  const todayProgress = isTradingDay(date, cal) ? sessionProgress(date, minutes, cal) : 0;

  // Once today's market has opened, quote today; before that (or on a closed
  // day), show the last completed session.
  const sessionDay = todayProgress > 0 ? date : previousTradingDay(date, cal);
  const progress = todayProgress > 0 ? todayProgress : 1;

  const prev = demoClose(symbol, previousTradingDay(sessionDay, cal));
  const target = demoClose(symbol, sessionDay);
  const open = demoOpen(symbol, sessionDay, prev);
  const wiggle = progress < 1 ? prev.mul(0.004 * (unitHash(`${symbol}:${date}:${minutes}`) - 0.5)) : new Decimal(0);
  const priceD = open.plus(target.minus(open).mul(progress)).plus(wiggle);

  const price = toTick(priceD);
  const prevClose = toTick(prev);
  const spread = prev.mul(0.006 * unitHash(`${symbol}:${sessionDay}:range`)).mul(progress);
  const high = toTick(Decimal.max(open, priceD).plus(spread));
  const low = toTick(Decimal.min(open, priceD).minus(spread));
  const volume = Math.round(unitHash(`${symbol}:${sessionDay}:vol`) * 4_000_000 * progress);
  const asOf =
    progress < 1
      ? new Date(Math.floor(now.getTime() / 60_000) * 60_000)
      : pktToDate(sessionDay, lastCloseMinutes(sessionDay, cal) ?? 0);

  return {
    symbol,
    price,
    prevClose,
    ...computeChange(price, prevClose),
    open: toTick(open),
    high,
    low,
    volume,
    asOf,
  };
}

export function createDemoSource(cal: CalendarData, now: () => Date = () => new Date()): MarketDataSource {
  return {
    id: "demo",
    label: "Demo data",
    delayed: false,
    delayNote: "Simulated prices for testing; not real market data.",
    quoteMode: "live",
    metered: false,
    callCost: () => 0,
    async listSymbols(): Promise<SymbolInfo[]> {
      return DEMO_SYMBOLS.map((s) => ({
        symbol: s.symbol,
        name: s.name,
        sector: s.sector,
        isEtf: Boolean(s.isEtf),
        isShariah: s.isShariah,
      }));
    },
    async getQuotes(symbols: string[]): Promise<Quote[]> {
      const at = now();
      return symbols.filter((s) => bySymbol.has(s)).map((s) => demoQuote(s, at, cal));
    },
    async getDailyHistory(symbol: string, from: string, to: string): Promise<Candle[]> {
      if (!bySymbol.has(symbol)) return [];
      const candles: Candle[] = [];
      for (let d = from; d <= to; d = addDays(d, 1)) {
        if (!isTradingDay(d, cal)) continue;
        const close = lastCloseMinutes(d, cal)!;
        const at = pktToDate(d, close);
        if (at.getTime() > now().getTime()) break; // no candle for an unfinished day
        const q = demoQuote(symbol, new Date(at.getTime() + 60_000), cal);
        candles.push({ symbol, date: d, open: q.open, high: q.high, low: q.low, close: q.price, volume: q.volume });
      }
      return candles;
    },
    async getEodBulk(date: string): Promise<Candle[]> {
      const out: Candle[] = [];
      for (const s of DEMO_SYMBOLS) out.push(...(await this.getDailyHistory(s.symbol, date, date)));
      return out;
    },
  };
}
