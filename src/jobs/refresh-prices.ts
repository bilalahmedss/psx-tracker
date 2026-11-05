import "server-only";
import { ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { pricesLatest } from "@/db/schema";
import {
  addDays,
  BudgetExceededError,
  configuredSourceId,
  getMarketSource,
  lastCloseMinutes,
  pktToDate,
  type CalendarData,
  type MarketDataSource,
  type Quote,
} from "@/lib/psx";
import { quoteFromCandles } from "@/lib/psx/quote-math";
import { decideRefresh, latestPublishedDay, LIMIT_MESSAGE, readRefreshConfig, shortDay, type RefreshTrigger } from "@/lib/psx/refresh-policy";
import {
  ensureSecurities,
  getRefreshSymbols,
  latestCandleDays,
  loadCalendar,
  loadRefreshState,
  marketBudget,
  saveRefreshState,
  securitiesCount,
  syncSymbols,
  upsertCandles,
} from "./market-db";
import { runJob, type JobResult } from "./run-job";
import { markAllSnapshotsStale } from "./snapshots";

/** History fetched for a symbol with none stored (the free EODHD plan has one year). */
const BACKFILL_DAYS = 365;
/** Refetch this many days before the newest stored close, to pick up corrections. */
const OVERLAP_DAYS = 10;

export type RefreshOptions = {
  trigger?: RefreshTrigger;
  /** Ignore timing rules (market hours, interval, cooldown, up to date). Never ignores the daily limit. */
  force?: boolean;
  now?: Date;
};

/**
 * Refresh prices for the symbols in PRICE_REFRESH_SCOPE.
 * - Intraday sources (demo, EODHD realtime): quotes every PRICE_REFRESH_MINUTES in market hours.
 * - End-of-day sources (EODHD free plan): daily closes once they are published.
 * Metered sources spend from the daily budget; when it runs out, the last prices stay.
 */
export async function refreshPrices({ trigger = "schedule", force = false, now = new Date() }: RefreshOptions = {}): Promise<JobResult> {
  const cal = await loadCalendar();
  const config = readRefreshConfig(process.env);
  const budget = configuredSourceId() === "eodhd" ? marketBudget() : undefined;
  const source = getMarketSource(cal, budget);
  const symbols = await getRefreshSymbols(config.scope, !source.metered);
  const cost = source.callCost(source.quoteMode === "eod" ? "history" : "quotes", symbols.length);
  const saved = await loadRefreshState();
  // Timing state from another source (e.g. demo before switching) doesn't apply.
  const state = saved && saved.source === source.id ? saved : null;

  const decision = decideRefresh({
    trigger,
    mode: source.quoteMode,
    metered: source.metered,
    now,
    cal,
    config,
    state: { lastAttemptAt: state?.lastAttemptAt ?? null, dataDay: state?.dataDay ?? null },
    symbols: symbols.length,
    cost,
    remaining: budget ? await budget.remaining() : null,
  });
  const overridable = !decision.run && force && decision.code !== "limit" && decision.code !== "no_symbols";
  if (!decision.run && !overridable) {
    // Not recorded in job_runs: the scheduler calls this every minute.
    return { job: "prices", status: "skipped", message: decision.message };
  }

  return runJob("prices", source.id, async () => {
    // Recorded first, so the cooldown covers a run that is still going.
    await saveRefreshState({ source: source.id, quoteMode: source.quoteMode, trackedCount: symbols.length, lastAttemptAt: now });
    try {
      const out =
        source.quoteMode === "eod"
          ? await refreshCloses(source, cal, symbols, (decision.run && decision.targetDay) || latestPublishedDay(now, cal, config.eodDelayMinutes))
          : await refreshQuotes(source, symbols);
      // Prices from a different source (e.g. demo) would be mislabelled; drop them.
      await db.delete(pricesLatest).where(ne(pricesLatest.source, source.id));
      await saveRefreshState({
        source: source.id,
        quoteMode: source.quoteMode,
        ...(out.rows ? { lastSuccessAt: now } : {}),
        ...(out.dataDay ? { dataDay: out.dataDay } : {}),
        message: out.message ?? null,
      });
      return { status: "success", rows: out.rows, message: out.message };
    } catch (e) {
      if (!(e instanceof BudgetExceededError)) throw e;
      await saveRefreshState({ source: source.id, quoteMode: source.quoteMode, message: LIMIT_MESSAGE });
      return { status: "skipped", message: `${LIMIT_MESSAGE} (${e.used} of ${e.limit} calls used today)` };
    }
  });
}

type RefreshOutcome = { rows: number; message?: string; dataDay?: string };

async function refreshQuotes(source: MarketDataSource, symbols: string[]): Promise<RefreshOutcome> {
  if (!source.metered && (await securitiesCount()) === 0) await syncSymbols(source);
  const quotes = await source.getQuotes(symbols);
  if (!quotes.length) return { rows: 0, message: "Source returned no quotes" };
  await ensureSecurities(quotes.map((q) => q.symbol));
  await upsertLatest(source, quotes, false);
  const missing = symbols.length - quotes.length;
  return { rows: quotes.length, message: missing > 0 ? `${missing} symbols had no quote` : undefined };
}

/**
 * End-of-day mode: one history call per symbol that lacks `target`'s close.
 * The first call doubles as a check that the day's closes are out; if they aren't,
 * the run stops after one call. A symbol that didn't trade on `target` while others
 * did is treated as done, so a suspended stock can't block the day.
 */
async function refreshCloses(source: MarketDataSource, cal: CalendarData, symbols: string[], target: string): Promise<RefreshOutcome> {
  const latest = await latestCandleDays(symbols);
  const done = symbols.filter((s) => (latest.get(s) ?? "") >= target);
  // Most recently updated first: the best check that the day is published.
  const todo = symbols.filter((s) => !done.includes(s)).sort((a, b) => (latest.get(b) ?? "").localeCompare(latest.get(a) ?? ""));
  const closeAt = (date: string) => pktToDate(date, lastCloseMinutes(date, cal) ?? 15 * 60 + 30);

  let published = done.length > 0;
  let candles = 0;
  let quotes = 0;
  for (const symbol of todo) {
    const last = latest.get(symbol);
    const from = last ? addDays(last, -OVERLAP_DAYS) : addDays(target, -BACKFILL_DAYS);
    const rows = (await source.getDailyHistory(symbol, from, target)).filter((c) => c.date <= target);
    candles += await upsertCandles(rows);
    const quote = quoteFromCandles(rows, closeAt);
    if (quote) {
      await upsertLatest(source, [quote], true);
      quotes++;
    }
    if (rows.at(-1)?.date === target) published = true;
    if (!published) {
      if (candles) await markAllSnapshotsStale();
      return { rows: quotes, message: `Closing prices for ${shortDay(target)} are not published yet` };
    }
  }
  if (candles) await markAllSnapshotsStale();
  return {
    rows: quotes,
    dataDay: target,
    message: `Closing prices for ${target}: ${todo.length} fetched, ${done.length} already stored; ${candles} daily rows saved`,
  };
}

async function upsertLatest(source: MarketDataSource, quotes: Quote[], endOfDay: boolean) {
  await db
    .insert(pricesLatest)
    .values(
      quotes.map((q) => ({
        symbol: q.symbol,
        price: q.price,
        prevClose: q.prevClose,
        change: q.change,
        changePct: q.changePct,
        open: q.open,
        high: q.high,
        low: q.low,
        volume: q.volume,
        asOf: q.asOf,
        source: source.id,
        delayed: source.quoteMode === "delayed",
        endOfDay,
      })),
    )
    .onConflictDoUpdate({
      target: pricesLatest.symbol,
      set: {
        price: sql`excluded.price`,
        prevClose: sql`excluded.prev_close`,
        change: sql`excluded.change`,
        changePct: sql`excluded.change_pct`,
        open: sql`excluded.open`,
        high: sql`excluded.high`,
        low: sql`excluded.low`,
        volume: sql`excluded.volume`,
        asOf: sql`excluded.as_of`,
        source: sql`excluded.source`,
        delayed: sql`excluded.delayed`,
        endOfDay: sql`excluded.end_of_day`,
        updatedAt: sql`now()`,
      },
    });
}
