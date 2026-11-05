import "server-only";
import { addDays, getMarketSource, isTradingDay, lastCloseMinutes, pktParts } from "@/lib/psx";
import type { Candle } from "@/lib/psx";
import { getTrackedSymbols, getTradedSymbols, loadCalendar, symbolsNeedingHistory, syncSymbols, upsertCandles } from "./market-db";
import { runJob, type JobResult } from "./run-job";
import { markAllSnapshotsStale } from "./snapshots";

/** Wait this long after the last session closes before storing the day's candles. */
const SETTLE_MINUTES = 15;
/** Backfill at most this many symbols per run, to stay polite to the provider. */
const BACKFILL_PER_RUN = 5;
const BACKFILL_DAYS = 400;
const MIN_HISTORY = 20;

/**
 * End-of-day job: refresh the symbol list, store the day's daily candles, and
 * backfill history for tracked symbols that have little or none.
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

  const source = getMarketSource(cal);
  return runJob(
    "eod",
    source.id,
    async () => {
      const listed = await syncSymbols(source);
      const known = new Set(listed.map((s) => s.symbol));
      const tracked = await getTrackedSymbols();

      let closes: Candle[];
      if (source.getEodBulk) {
        closes = await source.getEodBulk(day);
      } else {
        closes = [];
        for (const s of tracked) closes.push(...(await source.getDailyHistory(s, day, day)));
      }
      closes = closes.filter((c) => known.has(c.symbol) && c.date === day);
      await upsertCandles(closes);

      // Held and traded stocks first: their history drives the value chart.
      const traded = new Set(await getTradedSymbols());
      const candidates = tracked.filter((s) => known.has(s)).sort((a, b) => Number(traded.has(b)) - Number(traded.has(a)));
      const backfill = (await symbolsNeedingHistory(candidates, MIN_HISTORY)).slice(0, BACKFILL_PER_RUN);
      let backfilled = 0;
      for (const s of backfill) backfilled += await upsertCandles(await source.getDailyHistory(s, addDays(day, -BACKFILL_DAYS), day));

      // New closes change every portfolio's history; the snapshots job rebuilds them.
      await markAllSnapshotsStale();

      return {
        status: "success",
        rows: closes.length + backfilled,
        message: `${listed.length} symbols synced; ${closes.length} closes for ${day}; ${backfilled} history rows for ${backfill.length} symbols`,
      };
    },
    30,
  );
}
