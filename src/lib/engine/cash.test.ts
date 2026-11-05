import { describe, expect, it } from "vitest";
import { NEGATIVE_CASH_WARNING, buildCashLedger, negativeCashWarning } from "./cash";
import type { EngineCashEntry, EngineDividend, EngineTxn } from "./types";

const base = { fee: "0", tax: "0", otherCharges: "0", affectsCash: true };

describe("buildCashLedger", () => {
  const txns: EngineTxn[] = [
    // 1,000 @ 50 + 75 + 11.25 + 5 = 50,091.25 out
    { id: "b1", symbol: "OGDC", type: "buy", qty: "1000", price: "50", ...base, fee: "75", tax: "11.25", otherCharges: "5", tradeDate: "2025-01-10", createdAt: "2025-01-10T10:00:00Z" },
    // 400 @ 60 - 36 - 5.40 - 2 = 23,956.60 in
    { id: "s1", symbol: "OGDC", type: "sell", qty: "400", price: "60", ...base, fee: "36", tax: "5.40", otherCharges: "2", tradeDate: "2025-03-10", createdAt: "2025-03-10T10:00:00Z" },
    // Bought outside this cash account: not in the ledger
    { id: "b2", symbol: "HBL", type: "buy", qty: "10", price: "100", ...base, affectsCash: false, tradeDate: "2025-02-01", createdAt: "2025-02-01T10:00:00Z" },
  ];
  const dividends: EngineDividend[] = [
    { id: "d1", symbol: "OGDC", gross: "5500", wht: "825", zakatDeducted: "0", net: "4675", paidOn: "2025-04-01", affectsCash: true, createdAt: "2025-04-01T10:00:00Z" },
    { id: "d2", symbol: "OGDC", gross: "100", wht: "15", zakatDeducted: "0", net: "85", paidOn: "2025-04-02", affectsCash: false, createdAt: "2025-04-02T10:00:00Z" },
  ];
  const entries: EngineCashEntry[] = [
    { id: "c1", type: "deposit", amount: "100000", date: "2025-01-01", note: null, createdAt: "2025-01-01T09:00:00Z" },
    { id: "c2", type: "withdrawal", amount: "-10000", date: "2025-05-01", note: "To bank", createdAt: "2025-05-01T09:00:00Z" },
  ];

  it("merges deposits, trades and dividends with a running balance", () => {
    // 100,000.00 -> -50,091.25 = 49,908.75 -> +23,956.60 = 73,865.35
    //            -> +4,675.00 = 78,540.35 -> -10,000.00 = 68,540.35
    const ledger = buildCashLedger({ txns, dividends, entries });
    expect(ledger.lines.map((l) => [l.date, l.kind, l.amount.toFixed(2), l.balance.toFixed(2)])).toEqual([
      ["2025-01-01", "deposit", "100000.00", "100000.00"],
      ["2025-01-10", "buy", "-50091.25", "49908.75"],
      ["2025-03-10", "sell", "23956.60", "73865.35"],
      ["2025-04-01", "dividend", "4675.00", "78540.35"],
      ["2025-05-01", "withdrawal", "-10000.00", "68540.35"],
    ]);
    expect(ledger.balance.toFixed(2)).toBe("68540.35");
  });

  it("sums money in and out", () => {
    const ledger = buildCashLedger({ txns, dividends, entries });
    expect(ledger.totalIn.toFixed(2)).toBe("128631.60"); // 100,000 + 23,956.60 + 4,675
    expect(ledger.totalOut.toFixed(2)).toBe("-60091.25"); // -50,091.25 - 10,000
  });

  it("puts manual entries before trades on the same day", () => {
    const ledger = buildCashLedger({
      txns: [{ ...txns[0], tradeDate: "2025-01-01", createdAt: "2025-01-01T08:00:00Z" }],
      dividends: [],
      entries: [entries[0]],
    });
    expect(ledger.lines.map((l) => l.kind)).toEqual(["deposit", "buy"]);
  });

  it("starts at zero with nothing recorded", () => {
    expect(buildCashLedger({ txns: [], dividends: [], entries: [] }).balance.toFixed(2)).toBe("0.00");
  });
});

describe("negativeCashWarning", () => {
  const deposit: EngineCashEntry = { id: "c", type: "deposit", amount: "10000", date: "2025-01-01", note: null, createdAt: "2025-01-01T00:00:00Z" };
  const buy = (id: string, qty: string, price: string, affectsCash = true): EngineTxn => ({
    id,
    symbol: "OGDC",
    type: "buy",
    qty,
    price,
    fee: "0",
    tax: "0",
    otherCharges: "0",
    tradeDate: "2025-01-10",
    createdAt: `2025-01-10T10:00:0${id.length}Z`,
    affectsCash,
  });
  const current = { txns: [buy("a", "100", "50")], dividends: [], entries: [deposit] }; // 10,000 - 5,000 = 5,000

  it("warns when a new trade takes cash below zero", () => {
    // 5,000 left; buying 200 x 50 = 10,000 -> -5,000
    const w = negativeCashWarning(current, { txns: [buy("bb", "200", "50")] });
    expect(w?.message).toBe(NEGATIVE_CASH_WARNING);
    expect(w?.message).toBe("Cash goes negative. Add a deposit or turn off 'affects cash'");
    expect(w?.balance.toFixed(2)).toBe("-5000.00");
    expect(w?.date).toBe("2025-01-10");
  });

  it("is quiet when cash stays positive or the trade doesn't affect cash", () => {
    expect(negativeCashWarning(current, { txns: [buy("bb", "10", "50")] })).toBeNull();
    expect(negativeCashWarning(current, { txns: [buy("bb", "200", "50", false)] })).toBeNull();
  });

  it("accounts for the edited trade being replaced, not added", () => {
    // Editing trade "a" from 100 to 150 shares: 10,000 - 7,500 = 2,500, still positive
    expect(negativeCashWarning(current, { txns: [buy("a", "150", "50")], replacesTxnId: "a" })).toBeNull();
  });

  it("doesn't nag about a ledger that was already negative unless it gets worse", () => {
    const negative = { txns: [buy("a", "300", "50")], dividends: [], entries: [deposit] }; // -5,000 already
    expect(negativeCashWarning(negative, { entries: [{ ...deposit, id: "d2", amount: "1000" }] })).toBeNull();
    expect(negativeCashWarning(negative, { txns: [buy("bb", "10", "50")] })).not.toBeNull();
  });
});
