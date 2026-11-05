import { buildCashLedger } from "./cash";
import { LotBook, sortTxns } from "./fifo";
import { dec, sum, ZERO, type Dec } from "./money";
import type { EngineCashEntry, EngineDividend, EngineTxn } from "./types";

export type DailyClose = { date: string; close: string };

export type SeriesPoint = {
  date: string;
  /** Holdings valued at that day's close (or the last close before it). */
  marketValue: Dec;
  cost: Dec;
  cash: Dec;
  /** At least one holding had no close yet and was valued at cost. */
  estimated: boolean;
};

/**
 * Portfolio value on each of `dates` (ascending YYYY-MM-DD), rebuilt from
 * transactions and daily closes. Holdings without any close on or before a day
 * are valued at cost and the day is flagged as estimated.
 */
export function buildValueSeries(input: {
  txns: EngineTxn[];
  dividends: EngineDividend[];
  cashEntries: EngineCashEntry[];
  /** Closes per symbol, any order. */
  closes: Record<string, DailyClose[]>;
  dates: string[];
}): SeriesPoint[] {
  const txns = sortTxns(input.txns);
  const closes = new Map(Object.entries(input.closes).map(([s, rows]) => [s, [...rows].sort((a, b) => a.date.localeCompare(b.date))]));
  const cursor = new Map<string, number>(); // index of the latest close used per symbol
  const ledger = buildCashLedger({ txns: input.txns, dividends: input.dividends, entries: input.cashEntries }).lines;

  const book = new LotBook();
  let ti = 0;
  let li = 0;
  let cash = ZERO;
  const out: SeriesPoint[] = [];

  for (const date of [...input.dates].sort()) {
    while (ti < txns.length && txns[ti].tradeDate <= date) book.apply(txns[ti++]);
    while (li < ledger.length && ledger[li].date <= date) cash = cash.plus(ledger[li++].amount);

    let estimated = false;
    const values: Dec[] = [];
    const costs: Dec[] = [];
    for (const [symbol, pos] of book.positions()) {
      costs.push(pos.cost);
      const rows = closes.get(symbol) ?? [];
      let i = cursor.get(symbol) ?? -1;
      while (i + 1 < rows.length && rows[i + 1].date <= date) i++;
      cursor.set(symbol, i);
      if (i >= 0) values.push(pos.qty.mul(rows[i].close));
      else {
        values.push(pos.cost);
        estimated = true;
      }
    }
    out.push({ date, marketValue: sum(values), cost: sum(costs), cash, estimated });
  }
  return out;
}

/** Sum several portfolios' series by date; each carries its last point forward. */
export function mergeSeries(
  all: { date: string; marketValue: Dec | string; cost: Dec | string; cash: Dec | string; estimated: boolean }[][],
): SeriesPoint[] {
  const dates = [...new Set(all.flatMap((s) => s.map((p) => p.date)))].sort();
  const last: (SeriesPoint | null)[] = all.map(() => null);
  const idx = all.map(() => 0);
  return dates.map((date) => {
    all.forEach((series, k) => {
      while (idx[k] < series.length && series[idx[k]].date <= date) {
        const p = series[idx[k]++];
        last[k] = { date: p.date, marketValue: dec(p.marketValue), cost: dec(p.cost), cash: dec(p.cash), estimated: p.estimated };
      }
    });
    const present = last.filter((p): p is SeriesPoint => p !== null);
    return {
      date,
      marketValue: sum(present.map((p) => p.marketValue)),
      cost: sum(present.map((p) => p.cost)),
      cash: sum(present.map((p) => p.cash)),
      estimated: present.some((p) => p.estimated),
    };
  });
}
