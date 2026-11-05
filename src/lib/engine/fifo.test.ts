import { describe, expect, it } from "vitest";
import { OversellError, runFifo } from "./fifo";
import type { EngineTxn } from "./types";

let seq = 0;
function txn(partial: Partial<EngineTxn> & Pick<EngineTxn, "type" | "qty" | "price" | "tradeDate">): EngineTxn {
  seq += 1;
  return {
    id: partial.id ?? `t${seq}`,
    symbol: "OGDC",
    fee: "0",
    tax: "0",
    otherCharges: "0",
    affectsCash: true,
    createdAt: `2026-01-01T00:00:${String(seq).padStart(2, "0")}Z`,
    ...partial,
  };
}

describe("runFifo", () => {
  it("sells the oldest lot first and keeps the rest open", () => {
    // Buy 100 @ 10 (cost 1,000), buy 100 @ 20 (cost 2,000), sell 150 @ 30 (proceeds 4,500)
    // Lot 1: 100 sold, proceeds 3,000 - cost 1,000 = gain 2,000
    // Lot 2: 50 sold,  proceeds 1,500 - cost 1,000 = gain   500; 50 left costing 1,000
    const { lots, matches } = runFifo([
      txn({ id: "b1", type: "buy", qty: "100", price: "10", tradeDate: "2025-01-10" }),
      txn({ id: "b2", type: "buy", qty: "100", price: "20", tradeDate: "2025-02-10" }),
      txn({ id: "s1", type: "sell", qty: "150", price: "30", tradeDate: "2025-03-10" }),
    ]);
    expect(matches.map((m) => [m.lotId, m.qty.toFixed(), m.proceeds.toFixed(2), m.cost.toFixed(2), m.gain.toFixed(2)])).toEqual([
      ["b1", "100", "3000.00", "1000.00", "2000.00"],
      ["b2", "50", "1500.00", "1000.00", "500.00"],
    ]);
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({ lotId: "b2", acquiredOn: "2025-02-10" });
    expect(lots[0].qtyOpen.toFixed()).toBe("50");
    expect(lots[0].costOpen.toFixed(2)).toBe("1000.00");
    expect(lots[0].costPerShare.toFixed(2)).toBe("20.00");
  });

  it("includes commission, tax and other charges in cost and proceeds", () => {
    // Buy 1,000 @ 50: 50,000 + fee 75 + tax 11.25 + other 5 = cost 50,091.25 (50.09125/share)
    // Sell 400 @ 60:  24,000 - fee 36 - tax 5.40 - other 2  = proceeds 23,956.60
    // Cost of 400 = 50,091.25 x 400/1,000 = 20,036.50; gain = 3,920.10
    // Left: 600 shares costing 30,054.75 (still 50.09125/share)
    const { lots, matches } = runFifo([
      txn({ type: "buy", qty: "1000", price: "50", fee: "75", tax: "11.25", otherCharges: "5", tradeDate: "2025-01-10" }),
      txn({ type: "sell", qty: "400", price: "60", fee: "36", tax: "5.40", otherCharges: "2", tradeDate: "2025-03-10" }),
    ]);
    expect(matches[0].proceeds.toFixed(2)).toBe("23956.60");
    expect(matches[0].cost.toFixed(2)).toBe("20036.50");
    expect(matches[0].gain.toFixed(2)).toBe("3920.10");
    expect(matches[0].holdingDays).toBe(59);
    expect(lots[0].costOpen.toFixed(2)).toBe("30054.75");
    expect(lots[0].costPerShare.toFixed(5)).toBe("50.09125");
  });

  it("splits one sell's proceeds across three lots per share", () => {
    // Lots: 10 @ 100, 10 @ 110, 10 @ 120. Sell 25 @ 130 with fee 10: proceeds 3,240 = 129.60/share
    // 10 from lot 1: 1,296 - 1,000 = 296
    // 10 from lot 2: 1,296 - 1,100 = 196
    //  5 from lot 3:   648 -   600 =  48   (total gain 540 = 3,240 - 2,700)
    const { matches } = runFifo([
      txn({ type: "buy", qty: "10", price: "100", tradeDate: "2025-01-01" }),
      txn({ type: "buy", qty: "10", price: "110", tradeDate: "2025-01-02" }),
      txn({ type: "buy", qty: "10", price: "120", tradeDate: "2025-01-03" }),
      txn({ type: "sell", qty: "25", price: "130", fee: "10", tradeDate: "2025-01-04" }),
    ]);
    expect(matches.map((m) => m.gain.toFixed(2))).toEqual(["296.00", "196.00", "48.00"]);
    expect(matches.reduce((s, m) => s.plus(m.proceeds), matches[0].proceeds.mul(0)).toFixed(2)).toBe("3240.00");
  });

  it("allocates cost exactly with no rounding drift", () => {
    // Buy 3 @ 10 with fee 1 = cost 31, i.e. 10.333.../share. Selling 1 at a time three
    // times must use up exactly 31.00 in total, not 30.99 or 31.01.
    const { matches, lots } = runFifo([
      txn({ type: "buy", qty: "3", price: "10", fee: "1", tradeDate: "2025-01-01" }),
      txn({ type: "sell", qty: "1", price: "11", tradeDate: "2025-01-02" }),
      txn({ type: "sell", qty: "1", price: "11", tradeDate: "2025-01-03" }),
      txn({ type: "sell", qty: "1", price: "11", tradeDate: "2025-01-04" }),
    ]);
    const totalCost = matches.reduce((s, m) => s.plus(m.cost), matches[0].cost.mul(0));
    expect(totalCost.toFixed()).toBe("31");
    expect(lots).toHaveLength(0);
  });

  it("starts fresh after selling everything", () => {
    const { lots, matches } = runFifo([
      txn({ type: "buy", qty: "100", price: "10", tradeDate: "2025-01-01" }),
      txn({ type: "sell", qty: "100", price: "12", tradeDate: "2025-02-01" }),
      txn({ id: "rebuy", type: "buy", qty: "50", price: "15", tradeDate: "2025-03-01" }),
    ]);
    expect(matches[0].gain.toFixed(2)).toBe("200.00");
    expect(lots.map((l) => [l.lotId, l.costPerShare.toFixed(2)])).toEqual([["rebuy", "15.00"]]);
  });

  it("processes a day's buys before its sells, whatever order they were entered", () => {
    // Intraday round trip entered sell-first: still valid.
    const { matches } = runFifo([
      txn({ type: "sell", qty: "100", price: "11", tradeDate: "2025-01-05", createdAt: "2025-01-05T10:00:00Z" }),
      txn({ type: "buy", qty: "100", price: "10", tradeDate: "2025-01-05", createdAt: "2025-01-05T11:00:00Z" }),
    ]);
    expect(matches[0].gain.toFixed(2)).toBe("100.00");
    expect(matches[0].holdingDays).toBe(0);
  });

  it("keeps symbols separate", () => {
    const { lots } = runFifo([
      txn({ symbol: "OGDC", type: "buy", qty: "10", price: "100", tradeDate: "2025-01-01" }),
      txn({ symbol: "HBL", type: "buy", qty: "20", price: "150", tradeDate: "2025-01-01" }),
      txn({ symbol: "OGDC", type: "sell", qty: "10", price: "110", tradeDate: "2025-01-02" }),
    ]);
    expect(lots.map((l) => [l.symbol, l.qtyOpen.toFixed()])).toEqual([["HBL", "20"]]);
  });

  it("rejects selling more than is held on the trade date", () => {
    const run = () =>
      runFifo([
        txn({ type: "buy", qty: "100", price: "10", tradeDate: "2025-01-10" }),
        txn({ id: "bad", type: "sell", qty: "150", price: "12", tradeDate: "2025-02-01" }),
        txn({ type: "buy", qty: "100", price: "10", tradeDate: "2025-03-01" }), // too late to cover it
      ]);
    expect(run).toThrow(OversellError);
    try {
      run();
    } catch (e) {
      expect(e).toMatchObject({ symbol: "OGDC", txnId: "bad", tradeDate: "2025-02-01" });
      expect((e as OversellError).held.toFixed()).toBe("100");
      expect((e as OversellError).requested.toFixed()).toBe("150");
    }
  });
});
