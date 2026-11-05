import { daysBetween, dec, ZERO, type Dec } from "./money";
import type { EngineTxn } from "./types";

export type OpenLot = {
  lotId: string; // the buy transaction's id
  symbol: string;
  acquiredOn: string;
  qtyOriginal: Dec;
  qtyOpen: Dec;
  /** Remaining cost basis, including the buy's fee, tax and other charges. */
  costOpen: Dec;
  costPerShare: Dec;
};

export type LotMatch = {
  sellTxnId: string;
  lotId: string;
  symbol: string;
  qty: Dec;
  acquiredOn: string;
  soldOn: string;
  /** This match's share of the sell's net proceeds (after fee, tax, other charges). */
  proceeds: Dec;
  cost: Dec;
  gain: Dec;
  holdingDays: number;
};

export class OversellError extends Error {
  constructor(
    readonly symbol: string,
    readonly txnId: string,
    readonly tradeDate: string,
    readonly held: Dec,
    readonly requested: Dec,
  ) {
    super(`Can't sell ${requested.toFixed()} ${symbol} on ${tradeDate}: only ${held.toFixed()} held`);
    this.name = "OversellError";
  }
}

/** Trade date, then a day's buys before its sells, then entry order. */
export function sortTxns<T extends EngineTxn>(txns: T[]): T[] {
  return [...txns].sort(
    (a, b) =>
      a.tradeDate.localeCompare(b.tradeDate) ||
      (a.type === b.type ? 0 : a.type === "buy" ? -1 : 1) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
}

/** Buy cost including charges; sell proceeds net of charges. */
export function txnCashValue(t: EngineTxn): Dec {
  const gross = dec(t.qty).mul(t.price);
  const charges = dec(t.fee).plus(t.tax).plus(t.otherCharges);
  return t.type === "buy" ? gross.plus(charges) : gross.minus(charges);
}

/**
 * Replay buys and sells in order, matching each sell against the oldest open
 * lots (FIFO). Cost and proceeds are split by quantity, with the last piece
 * taking the remainder, so totals stay exact.
 */
export function runFifo(txns: EngineTxn[]): { lots: OpenLot[]; matches: LotMatch[] } {
  const book = new LotBook();
  for (const t of sortTxns(txns)) book.apply(t);
  return { lots: book.openLots(), matches: book.matches };
}

/**
 * Incremental FIFO state. Apply transactions in sortTxns() order; read open
 * lots at any point (used for day-by-day value series).
 */
export class LotBook {
  private readonly open = new Map<string, OpenLot[]>();
  readonly matches: LotMatch[] = [];

  apply(t: EngineTxn): void {
    const lots = this.open.get(t.symbol) ?? [];
    this.open.set(t.symbol, lots);
    const qty = dec(t.qty);

    if (t.type === "buy") {
      const cost = txnCashValue(t);
      lots.push({ lotId: t.id, symbol: t.symbol, acquiredOn: t.tradeDate, qtyOriginal: qty, qtyOpen: qty, costOpen: cost, costPerShare: cost.div(qty) });
      return;
    }

    const held = lots.reduce((s, l) => s.plus(l.qtyOpen), ZERO);
    if (qty.gt(held)) throw new OversellError(t.symbol, t.id, t.tradeDate, held, qty);

    let remainingQty = qty;
    let remainingProceeds = txnCashValue(t);
    while (remainingQty.gt(0)) {
      const lot = lots[0];
      const take = Dec_min(lot.qtyOpen, remainingQty);
      const cost = take.eq(lot.qtyOpen) ? lot.costOpen : lot.costOpen.mul(take).div(lot.qtyOpen);
      const proceeds = take.eq(remainingQty) ? remainingProceeds : remainingProceeds.mul(take).div(remainingQty);

      this.matches.push({
        sellTxnId: t.id,
        lotId: lot.lotId,
        symbol: t.symbol,
        qty: take,
        acquiredOn: lot.acquiredOn,
        soldOn: t.tradeDate,
        proceeds,
        cost,
        gain: proceeds.minus(cost),
        holdingDays: daysBetween(lot.acquiredOn, t.tradeDate),
      });

      lot.qtyOpen = lot.qtyOpen.minus(take);
      lot.costOpen = lot.costOpen.minus(cost);
      remainingQty = remainingQty.minus(take);
      remainingProceeds = remainingProceeds.minus(proceeds);
      if (lot.qtyOpen.isZero()) lots.shift();
    }
  }

  openLots(): OpenLot[] {
    return [...this.open.values()].flat();
  }

  /** Open quantity and remaining cost per symbol. */
  positions(): Map<string, { qty: Dec; cost: Dec }> {
    const out = new Map<string, { qty: Dec; cost: Dec }>();
    for (const [symbol, lots] of this.open) {
      if (!lots.length) continue;
      out.set(symbol, { qty: lots.reduce((s, l) => s.plus(l.qtyOpen), ZERO), cost: lots.reduce((s, l) => s.plus(l.costOpen), ZERO) });
    }
    return out;
  }
}

function Dec_min(a: Dec, b: Dec): Dec {
  return a.lte(b) ? a : b;
}
