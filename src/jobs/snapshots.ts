import "server-only";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { cashEntries, dividendReceipts, portfolios, prices, snapshots, transactions } from "@/db/schema";
import { buildValueSeries, type DailyClose } from "@/lib/engine/series";
import type { EngineCashEntry, EngineDividend, EngineTxn } from "@/lib/engine/types";
import { addDays, isTradingDay, lastCloseMinutes, pktParts, previousTradingDay, type CalendarData } from "@/lib/psx";
import { chunk } from "@/lib/psx/sources/eodhd";
import { loadCalendar } from "./market-db";
import { runJob, type JobResult } from "./run-job";

/** Portfolios rebuilt per run, so one run stays short. */
const PER_RUN = 25;

/** The latest trading day whose close is final at `now`. */
export function lastCompletedTradingDay(now: Date, cal: CalendarData): string {
  const { date, minutes } = pktParts(now);
  const close = isTradingDay(date, cal) ? lastCloseMinutes(date, cal) : null;
  return close !== null && minutes >= close ? date : previousTradingDay(date, cal);
}

function tradingDays(from: string, to: string, cal: CalendarData): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (isTradingDay(d, cal)) out.push(d);
  return out;
}

async function rebuildOne(portfolioId: string, cal: CalendarData, end: string): Promise<number> {
  const [t, d, c] = await Promise.all([
    db.select().from(transactions).where(and(eq(transactions.portfolioId, portfolioId), inArray(transactions.type, ["buy", "sell"]))),
    db.select().from(dividendReceipts).where(eq(dividendReceipts.portfolioId, portfolioId)),
    db.select().from(cashEntries).where(eq(cashEntries.portfolioId, portfolioId)),
  ]);

  const txns: EngineTxn[] = t.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    type: r.type as "buy" | "sell",
    qty: r.qty,
    price: r.price,
    fee: r.fee,
    tax: r.tax,
    otherCharges: r.otherCharges,
    tradeDate: r.tradeDate,
    createdAt: r.createdAt.toISOString(),
    affectsCash: r.affectsCash,
  }));
  const dividends: EngineDividend[] = d.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    gross: r.gross,
    wht: r.wht,
    zakatDeducted: r.zakatDeducted,
    net: r.net,
    paidOn: r.paidOn,
    affectsCash: r.affectsCash,
    createdAt: r.createdAt.toISOString(),
  }));
  const entries: EngineCashEntry[] = c.map((r) => ({
    id: r.id,
    type: r.type as EngineCashEntry["type"],
    amount: r.amount,
    date: r.date,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
  }));

  const firsts = [...txns.map((x) => x.tradeDate), ...dividends.map((x) => x.paidOn), ...entries.map((x) => x.date)].sort();
  if (!firsts.length || firsts[0] > end) {
    await db.delete(snapshots).where(eq(snapshots.portfolioId, portfolioId));
    return 0;
  }
  const dates = tradingDays(firsts[0], end, cal);

  const symbols = [...new Set(txns.map((x) => x.symbol))];
  const closes: Record<string, DailyClose[]> = {};
  if (symbols.length) {
    const rows = await db
      .select({ symbol: prices.symbol, ts: prices.ts, close: prices.close })
      .from(prices)
      .where(and(inArray(prices.symbol, symbols), gte(prices.ts, new Date(`${addDays(firsts[0], -30)}T00:00:00+05:00`)), lte(prices.ts, new Date(`${end}T23:59:59+05:00`))));
    for (const r of rows) (closes[r.symbol] ??= []).push({ date: pktParts(r.ts).date, close: r.close });
  }

  const series = buildValueSeries({ txns, dividends, cashEntries: entries, closes, dates });

  await db.transaction(async (tx) => {
    await tx.delete(snapshots).where(eq(snapshots.portfolioId, portfolioId));
    for (const batch of chunk(series, 500)) {
      await tx.insert(snapshots).values(
        batch.map((p) => ({
          portfolioId,
          date: p.date,
          marketValue: p.marketValue.toFixed(4),
          cost: p.cost.toFixed(4),
          cash: p.cash.toFixed(4),
          estimated: p.estimated,
        })),
      );
    }
  });
  return series.length;
}

/**
 * Rebuild daily snapshots for portfolios whose trades, dividends or cash changed
 * (flagged by a trigger), or for all portfolios with `all`.
 */
export async function rebuildSnapshots({ all = false, now = new Date() } = {}): Promise<JobResult> {
  const stale = await db
    .select({ id: portfolios.id })
    .from(portfolios)
    .where(all ? sql`true` : eq(portfolios.snapshotsStale, true))
    .limit(all ? 10_000 : PER_RUN);
  if (!stale.length) return { job: "snapshots", status: "skipped", message: "No portfolios need rebuilding" };

  return runJob("snapshots", "engine", async () => {
    const cal = await loadCalendar();
    const end = lastCompletedTradingDay(now, cal);
    let rows = 0;
    for (const { id } of stale) {
      // Clear the flag first: a change made during the rebuild sets it again.
      await db.update(portfolios).set({ snapshotsStale: false }).where(eq(portfolios.id, id));
      try {
        rows += await rebuildOne(id, cal, end);
      } catch (e) {
        await db.update(portfolios).set({ snapshotsStale: true }).where(eq(portfolios.id, id));
        throw e;
      }
    }
    return { status: "success", rows, message: `${stale.length} portfolios rebuilt through ${end}` };
  });
}

/** Called by the end-of-day job so every portfolio gets the new day's point. */
export async function markAllSnapshotsStale(): Promise<void> {
  await db.update(portfolios).set({ snapshotsStale: true }).where(eq(portfolios.snapshotsStale, false));
}

export { chunk };
