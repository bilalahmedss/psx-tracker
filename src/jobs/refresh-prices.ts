import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { pricesLatest } from "@/db/schema";
import { getMarketSource, getSchedule, marketStatus, pktParts } from "@/lib/psx";
import { ensureSecurities, getTrackedSymbols, loadCalendar, securitiesCount, syncSymbols } from "./market-db";
import { runJob, type JobResult } from "./run-job";

/** Keep polling this long after a session closes, to capture final prices. */
const GRACE_MINUTES = 5;

/** Refresh prices_latest for tracked symbols. Skips when the market is closed unless forced. */
export async function refreshPrices({ force = false, now = new Date() } = {}): Promise<JobResult> {
  const cal = await loadCalendar();
  const status = marketStatus(now, cal);
  const { date, minutes } = pktParts(now);
  const inGrace = getSchedule(date, cal).sessions.some((s) => minutes >= s.close && minutes < s.close + GRACE_MINUTES);

  if (!force && status.state !== "open" && !inGrace) {
    // Not recorded in job_runs: this fires every minute outside market hours.
    return { job: "prices", status: "skipped", message: `Market closed (${status.reason})` };
  }

  const source = getMarketSource(cal);
  return runJob("prices", source.id, async () => {
    if ((await securitiesCount()) === 0) await syncSymbols(source);

    const symbols = await getTrackedSymbols();
    const quotes = await source.getQuotes(symbols);
    if (!quotes.length) return { status: "success", rows: 0, message: "Source returned no quotes" };

    await ensureSecurities(quotes.map((q) => q.symbol));
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
          delayed: source.delayed,
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
          updatedAt: sql`now()`,
        },
      });

    const missing = symbols.length - quotes.length;
    return {
      status: "success",
      rows: quotes.length,
      message: missing > 0 ? `${missing} tracked symbols had no quote` : undefined,
    };
  });
}
