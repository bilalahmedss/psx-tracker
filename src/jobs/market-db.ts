import "server-only";
import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { marketHolidays, marketSessions, prices, securities } from "@/db/schema";
import { buildCalendar, DEFAULT_TRACKED_SYMBOLS, type CalendarData } from "@/lib/psx";
import type { Candle, MarketDataSource, SymbolInfo } from "@/lib/psx";
import { chunk } from "@/lib/psx/sources/eodhd";

// Privileged DB helpers for jobs (Drizzle bypasses RLS; never use from user code).

export async function loadCalendar(): Promise<CalendarData> {
  const [holidays, overrides] = await Promise.all([db.select().from(marketHolidays), db.select().from(marketSessions)]);
  return buildCalendar(holidays, overrides);
}

/** Symbols held in any portfolio or watchlist, plus the default liquid list. */
export async function getTrackedSymbols(): Promise<string[]> {
  const rows = await db.execute<{ symbol: string }>(sql`
    select symbol from public.transactions
    union select symbol from public.watchlists
  `);
  return [...new Set([...DEFAULT_TRACKED_SYMBOLS, ...rows.map((r) => r.symbol)])].sort();
}

/** Symbols currently or previously traded in any portfolio (backfilled first). */
export async function getTradedSymbols(): Promise<string[]> {
  const rows = await db.execute<{ symbol: string }>(sql`select distinct symbol from public.transactions`);
  return rows.map((r) => r.symbol);
}

/** Upsert the provider's symbol list. Keeps existing sector/Shariah data if the provider has none. */
export async function syncSymbols(source: MarketDataSource): Promise<SymbolInfo[]> {
  const list = await source.listSymbols();
  // Only overwrite Shariah status when the provider actually reports it.
  const reportsShariah = list.some((s) => s.isShariah !== null);
  for (const batch of chunk(list, 500)) {
    await db
      .insert(securities)
      .values(batch.map((s) => ({ symbol: s.symbol, name: s.name, sector: s.sector, isEtf: s.isEtf, isShariah: s.isShariah ?? false })))
      .onConflictDoUpdate({
        target: securities.symbol,
        set: {
          name: sql`excluded.name`,
          isEtf: sql`excluded.is_etf`,
          sector: sql`coalesce(excluded.sector, ${securities.sector})`,
          ...(reportsShariah ? { isShariah: sql`excluded.is_shariah` } : {}),
          updatedAt: sql`now()`,
        },
      });
  }
  return list;
}

/** Make sure every symbol has a securities row (FK target), without overwriting real names. */
export async function ensureSecurities(symbols: string[]): Promise<void> {
  if (!symbols.length) return;
  await db
    .insert(securities)
    .values(symbols.map((symbol) => ({ symbol, name: symbol })))
    .onConflictDoNothing();
}

export async function securitiesCount(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(securities);
  return row.n;
}

/** EOD candles are stored at PKT midnight of the trading day. */
export function candleTs(date: string): Date {
  return new Date(`${date}T00:00:00+05:00`);
}

export async function upsertCandles(candles: Candle[]): Promise<number> {
  for (const batch of chunk(candles, 500)) {
    await db
      .insert(prices)
      .values(
        batch.map((c) => ({ symbol: c.symbol, ts: candleTs(c.date), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume })),
      )
      .onConflictDoUpdate({
        target: [prices.symbol, prices.ts],
        set: {
          open: sql`excluded.open`,
          high: sql`excluded.high`,
          low: sql`excluded.low`,
          close: sql`excluded.close`,
          volume: sql`excluded.volume`,
        },
      });
  }
  return candles.length;
}

/** Tracked symbols with fewer than `min` stored daily candles. */
export async function symbolsNeedingHistory(symbols: string[], min: number): Promise<string[]> {
  if (!symbols.length) return [];
  const rows = await db
    .select({ symbol: prices.symbol, n: sql<number>`count(*)::int` })
    .from(prices)
    .where(inArray(prices.symbol, symbols))
    .groupBy(prices.symbol);
  const counts = new Map(rows.map((r) => [r.symbol, r.n]));
  return symbols.filter((s) => (counts.get(s) ?? 0) < min);
}
