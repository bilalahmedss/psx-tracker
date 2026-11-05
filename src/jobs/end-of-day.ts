import "server-only";
import { addDays, BudgetExceededError, configuredSourceId, getMarketSource, isTradingDay, lastCloseMinutes, pktParts } from "@/lib/psx";
import type { Candle } from "@/lib/psx";
import { LIMIT_MESSAGE, readRefreshConfig } from "@/lib/psx/refresh-policy";
import {
  getRefreshSymbols,
  getTradedSymbols,
  loadCalendar,
  loadRefreshState,
  marketBudget,
  saveRefreshState,
  securitiesCount,
  symbolsNeedingHistory,
  syncSymbols,
  upsertCandles,
} from "./market-db";
import { runJob, type JobResult } from "./run-job";
import { markAllSnapshotsStale } from "./snapshots";

/** Wait this long after the last session closes before storing the day's candles. */
const SETTLE_MINUTES = 15;
const BACKFILL_DAYS = 400;
const MIN_HISTORY = 20;
/** Metered sources re-read the symbol list (1 call) at most this often. */
const SYMBOL_SYNC_DAYS = 7;

/**
 * End-of-day job: refresh the symbol list, store the day's daily candles, and
 * backfill history for tracked symbols that have little or none.
 *
 * On a metered source every call comes out of the daily budget, so it does less:
 * the symbol list weekly, and in end-of-day mode no candles at all, because the
 * prices job already stores each day's closes and history.
 */
export async function endOfDay({ force = false, now = new Date(), date }: { force?: boolean; now?: Date; date?: string } = {}): Promise<JobResult> {
  const cal = await loadCalendar();
  const today = pktParts(now);
  const day = date ?? today.date;

  if (!force) {
    if (!isTradingDay(day, cal)) return { job: "eod", status: "skipped", message: `${day} is not a trading day` };
    const close = lastCloseMinutes(day, cal)!;
    if (day === today.date && today.minutes < close + SETTLE_MINUTES) {
      return { job: "eod", status: "skipped", message: "Market has not closed yet" };
    }
  }

  const budget = configuredSourceId() === "eodhd" ? marketBudget() : undefined;
  const source = getMarketSource(cal, budget);
  const config = readRefreshConfig(process.env);
  return runJob(
    "eod",
    source.id,
    async () => {
      const notes: string[] = [];
      try {
        const state = await loadRefreshState();
        const lastSync = state?.symbolsSyncedAt?.getTime() ?? 0;
        const syncDue = !source.metered || (await securitiesCount()) === 0 || now.getTime() - lastSync >= SYMBOL_SYNC_DAYS * 86_400_000;
        if (syncDue) {
          const listed = await syncSymbols(source);
          await saveRefreshState({ source: state?.source ?? source.id, quoteMode: state?.quoteMode ?? source.quoteMode, symbolsSyncedAt: now });
          notes.push(`${listed.length} symbols synced`);
        }

        if (source.quoteMode === "eod") {
          notes.push("closes and history come from the prices job");
          return { status: "success", rows: 0, message: notes.join("; ") };
        }

        const tracked = await getRefreshSymbols(config.scope, !source.metered);
        let closes: Candle[];
        if (source.getEodBulk && !source.metered) {
          closes = await source.getEodBulk(day);
        } else {
          closes = [];
          for (const s of tracked) closes.push(...(await source.getDailyHistory(s, day, day)));
        }
        const wanted = new Set(tracked);
        closes = closes.filter((c) => c.date === day && (!source.metered || wanted.has(c.symbol)));
        await upsertCandles(closes);
        notes.push(`${closes.length} closes for ${day}`);

        // Held and traded stocks first: their history drives the value chart.
        const traded = new Set(await getTradedSymbols());
        const candidates = [...tracked].sort((a, b) => Number(traded.has(b)) - Number(traded.has(a)));
        const backfill = (await symbolsNeedingHistory(candidates, MIN_HISTORY)).slice(0, source.metered ? 1 : 5);
        let backfilled = 0;
        for (const s of backfill) backfilled += await upsertCandles(await source.getDailyHistory(s, addDays(day, -BACKFILL_DAYS), day));
        notes.push(`${backfilled} history rows for ${backfill.length} symbols`);

        // New closes change every portfolio's history; the snapshots job rebuilds them.
        await markAllSnapshotsStale();
        return { status: "success", rows: closes.length + backfilled, message: notes.join("; ") };
      } catch (e) {
        if (!(e instanceof BudgetExceededError)) throw e;
        await markAllSnapshotsStale();
        return { status: "skipped", message: [...notes, LIMIT_MESSAGE].join("; ") };
      }
    },
    30,
  );
}
