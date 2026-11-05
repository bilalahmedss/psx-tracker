import { txnCashValue } from "./fifo";
import { dec, sum, ZERO, type Dec } from "./money";
import type { EngineCashEntry, EngineDividend, EngineTxn } from "./types";

export type CashLineKind = EngineCashEntry["type"] | "buy" | "sell" | "dividend";

export type CashLine = {
  key: string;
  date: string;
  kind: CashLineKind;
  /** Trade or dividend symbol, if any. */
  symbol: string | null;
  description: string;
  amount: Dec;
  balance: Dec;
  /** Id of the source row (cash entry, transaction or dividend). */
  refId: string;
  /** Manual entries can be edited; derived lines come from their trade/dividend. */
  manual: boolean;
};

/** Shown when a trade or import would take cash below zero. A warning, never a block. */
export const NEGATIVE_CASH_WARNING = "Cash goes negative. Add a deposit or turn off 'affects cash'";

/**
 * Warning if adding `proposed` trades makes the cash balance go negative where it
 * wasn't before (so an already-negative ledger doesn't nag on every unrelated trade).
 */
export function negativeCashWarning(
  current: { txns: EngineTxn[]; dividends: EngineDividend[]; entries: EngineCashEntry[] },
  proposed: { txns?: EngineTxn[]; dividends?: EngineDividend[]; entries?: EngineCashEntry[]; replacesTxnId?: string | null },
): { message: string; date: string; balance: Dec } | null {
  const before = buildCashLedger(current);
  const after = buildCashLedger({
    txns: [...current.txns.filter((t) => t.id !== proposed.replacesTxnId), ...(proposed.txns ?? [])],
    dividends: [...current.dividends, ...(proposed.dividends ?? [])],
    entries: [...current.entries, ...(proposed.entries ?? [])],
  });
  if (!after.firstNegative) return null;
  const minBefore = before.lines.reduce((m, l) => (l.balance.lt(m) ? l.balance : m), ZERO);
  const minAfter = after.lines.reduce((m, l) => (l.balance.lt(m) ? l.balance : m), ZERO);
  if (minAfter.gte(minBefore) && before.firstNegative) return null;
  return { message: NEGATIVE_CASH_WARNING, ...after.firstNegative };
}

const KIND_ORDER: Record<CashLineKind, number> = { deposit: 0, adjustment: 1, withdrawal: 2, deduction: 3, buy: 4, sell: 5, dividend: 6 };

/**
 * Cash ledger: manual entries plus a line for every trade and dividend that
 * affects cash, in date order with a running balance. Trade and dividend lines
 * are derived on the fly, so editing a trade fixes the ledger automatically.
 */
export function buildCashLedger(input: { txns: EngineTxn[]; dividends: EngineDividend[]; entries: EngineCashEntry[] }) {
  type Row = Omit<CashLine, "balance"> & { createdAt: string };
  const rows: Row[] = [];

  for (const e of input.entries) {
    rows.push({ key: `c:${e.id}`, date: e.date, kind: e.type, symbol: null, description: e.note ?? "", amount: dec(e.amount), refId: e.id, manual: true, createdAt: e.createdAt });
  }
  for (const t of input.txns) {
    if (!t.affectsCash) continue;
    const value = txnCashValue(t);
    rows.push({
      key: `t:${t.id}`,
      date: t.tradeDate,
      kind: t.type,
      symbol: t.symbol,
      description: `${t.type === "buy" ? "Bought" : "Sold"} ${dec(t.qty).toFixed()} ${t.symbol} @ ${dec(t.price).toFixed()}`,
      amount: t.type === "buy" ? value.neg() : value,
      refId: t.id,
      manual: false,
      createdAt: t.createdAt,
    });
  }
  for (const d of input.dividends) {
    if (!d.affectsCash) continue;
    rows.push({ key: `d:${d.id}`, date: d.paidOn, kind: "dividend", symbol: d.symbol, description: `Dividend ${d.symbol} (net)`, amount: dec(d.net), refId: d.id, manual: false, createdAt: d.createdAt });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.createdAt.localeCompare(b.createdAt));

  let balance = ZERO;
  const lines: CashLine[] = rows.map((r) => {
    balance = balance.plus(r.amount);
    return { key: r.key, date: r.date, kind: r.kind, symbol: r.symbol, description: r.description, amount: r.amount, balance, refId: r.refId, manual: r.manual };
  });

  const negative = lines.find((l) => l.balance.isNegative()) ?? null;
  return {
    lines,
    /** First line where the running balance drops below zero, if any. */
    firstNegative: negative ? { date: negative.date, balance: negative.balance } : null,
    balance,
    totalIn: sum(lines.filter((l) => l.amount.gt(0)).map((l) => l.amount)),
    totalOut: sum(lines.filter((l) => l.amount.lt(0)).map((l) => l.amount)),
  };
}
