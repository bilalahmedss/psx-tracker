import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { marketDataState, marketHolidays, marketSessions, prices, securities } from "@/db/schema";
import { buildCalendar, createCallBudget, DEFAULT_TRACKED_SYMBOLS, pktParts, readDailyLimit, type BudgetStore, type CalendarData, type CallBudget } from "@/lib/psx";
import type { Candle, MarketDataSource, SymbolInfo } from "@/lib/psx";
import type { RefreshScope } from "@/lib/psx/refresh-policy";
import { chunk } from "@/lib/psx/sources/eodhd";

// Privileged DB helpers for jobs (Drizzle bypasses RLS; never use from user code).

export async function loadCalendar(): Promise<CalendarData> {
  const [holidays, overrides] = await Promise.all([db.select().from(marketHolidays), db.select().from(marketSessions)]);
  return buildCalendar(holidays, overrides);
}

/**
 * Symbols the price jobs refresh.
 * holdings: held now (net shares > 0) in any portfolio, or on any watchlist.
 * all: every listed symbol (too many for a metered free plan).
 * Unmetered sources (demo) also get the default liquid list so /market has data.
 */
export async function getRefreshSymbols(scope: RefreshScope, includeDefaults: boolean): Promise<string[]> {
  const rows =
    scope === "all"
      ? await db.execute<{ symbol: string }>(sql`select symbol from public.securities`)
      : await db.execute<{ symbol: string }>(sql`
          select symbol from public.transactions
          group by portfolio_id, symbol
          having sum(case when type in ('buy', 'bonus', 'transfer_in') then qty
                          when type in ('sell', 'transfer_out') then -qty else 0 end) > 0
          union select symbol from public.watchlists
        `);
  return [...new Set([...(includeDefaults ? DEFAULT_TRACKED_SYMBOLS : []), ...rows.map((r) => r.symbol)])].sort();
}

/** api_usage-backed call counts. The conditional upsert makes each reservation atomic. */
export const dbBudgetStore: BudgetStore = {
  async reserve(provider, day, calls, limit) {
    const rows = await db.execute<{ calls: number }>(sql`
      insert into public.api_usage (provider, day, calls) values (${provider}, ${day}, ${calls})
      on conflict (provider, day) do update set calls = api_usage.calls + excluded.calls, updated_at = now()
        where api_usage.calls + excluded.calls <= ${limit}
      returning calls`);
    return rows.length ? Number(rows[0].calls) : null;
  },
  async used(provider, day) {
    const rows = await db.execute<{ calls: number }>(sql`select calls from public.api_usage where provider = ${provider} and day = ${day}`);
    return rows.length ? Number(rows[0].calls) : 0;
  },
};

let eodhdBudget: CallBudget | null = null;
/** The EODHD daily budget (EODHD_DAILY_LIMIT, default 15 of the free plan's 20). */
export function marketBudget(): CallBudget {
  eodhdBudget ??= createCallBudget(dbBudgetStore, "eodhd", readDailyLimit(process.env.EODHD_DAILY_LIMIT));
  return eodhdBudget;
}

export type RefreshStateRow = typeof marketDataState.$inferSelect;

export async function loadRefreshState(): Promise<RefreshStateRow | null> {
  const [row] = await db.select().from(marketDataState).where(eq(marketDataState.job, "prices"));
  return row ?? null;
}

export async function saveRefreshState(
  patch: Pick<RefreshStateRow, "source" | "quoteMode"> & Partial<Omit<RefreshStateRow, "job" | "updatedAt">>,
): Promise<void> {
  await db
    .insert(marketDataState)
    .values({ job: "prices", ...patch })
    .onConflictDoUpdate({ target: marketDataState.job, set: { ...patch, updatedAt: new Date() } });
}

/** Latest stored daily candle per symbol, as a PKT date. */
export async function latestCandleDays(symbols: string[]): Promise<Map<string, string>> {
  if (!symbols.length) return new Map();
  const rows = await db
    .select({ symbol: prices.symbol, ts: sql<Date>`max(${prices.ts})` })
    .from(prices)
    .where(inArray(prices.symbol, symbols))
    .groupBy(prices.symbol);
  return new Map(rows.map((r) => [r.symbol, pktParts(new Date(r.ts)).date]));
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
