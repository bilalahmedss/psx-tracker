import { describe, expect, it } from "vitest";
import { buildValueSeries, mergeSeries } from "./series";
import type { EngineTxn } from "./types";

const t = (p: Partial<EngineTxn> & Pick<EngineTxn, "id" | "type" | "qty" | "price" | "tradeDate">): EngineTxn => ({
  symbol: "OGDC",
  fee: "0",
  tax: "0",
  otherCharges: "0",
  affectsCash: true,
  createdAt: `${p.tradeDate}T10:00:00Z`,
  ...p,
});

const closes = {
  OGDC: [
    { date: "2025-01-10", close: "52" },
    { date: "2025-01-13", close: "55" },
    { date: "2025-01-14", close: "53" },
  ],
  HBL: [{ date: "2025-01-13", close: "160" }],
};

const view = (rows: ReturnType<typeof buildValueSeries>) =>
  rows.map((r) => [r.date, r.marketValue.toFixed(2), r.cost.toFixed(2), r.cash.toFixed(2), r.estimated]);

describe("buildValueSeries", () => {
  it("values holdings at each day's close, carrying the last close forward", () => {
    // Buy 100 @ 50 on 10 Jan; sell 40 @ 54 on 14 Jan (proceeds 2,160)
    //   9 Jan: nothing held
    //  10 Jan: 100 x 52 = 5,200; cost 5,000; cash -5,000
    //  13 Jan: 100 x 55 = 5,500
    //  14 Jan:  60 x 53 = 3,180; cost 3,000; cash -5,000 + 2,160 = -2,840
    //  15 Jan: no close -> last close 53 -> 3,180
    const rows = buildValueSeries({
      txns: [
        t({ id: "b", type: "buy", qty: "100", price: "50", tradeDate: "2025-01-10" }),
        t({ id: "s", type: "sell", qty: "40", price: "54", tradeDate: "2025-01-14" }),
      ],
      dividends: [],
      cashEntries: [],
      closes,
      dates: ["2025-01-09", "2025-01-10", "2025-01-13", "2025-01-14", "2025-01-15"],
    });
    expect(view(rows)).toEqual([
      ["2025-01-09", "0.00", "0.00", "0.00", false],
      ["2025-01-10", "5200.00", "5000.00", "-5000.00", false],
      ["2025-01-13", "5500.00", "5000.00", "-5000.00", false],
      ["2025-01-14", "3180.00", "3000.00", "-2840.00", false],
      ["2025-01-15", "3180.00", "3000.00", "-2840.00", false],
    ]);
  });

  it("values a holding at cost before its first known close, and flags the day as estimated", () => {
    // HBL bought 10 Jan @ 150 (cost 1,500); first close on 13 Jan is 160 -> 1,600
    const rows = buildValueSeries({
      txns: [t({ id: "h", symbol: "HBL", type: "buy", qty: "10", price: "150", tradeDate: "2025-01-10" })],
      dividends: [],
      cashEntries: [],
      closes,
      dates: ["2025-01-10", "2025-01-13"],
    });
    expect(view(rows)).toEqual([
      ["2025-01-10", "1500.00", "1500.00", "-1500.00", true],
      ["2025-01-13", "1600.00", "1500.00", "-1500.00", false],
    ]);
  });

  it("gives the same result whatever order the rows arrive in (back-dated entries)", () => {
    const txns = [
      t({ id: "s", type: "sell", qty: "40", price: "54", tradeDate: "2025-01-14" }),
      t({ id: "b", type: "buy", qty: "100", price: "50", tradeDate: "2025-01-10", createdAt: "2025-02-01T00:00:00Z" }),
    ];
    const a = buildValueSeries({ txns, dividends: [], cashEntries: [], closes, dates: ["2025-01-13", "2025-01-14"] });
    const b = buildValueSeries({ txns: [...txns].reverse(), dividends: [], cashEntries: [], closes, dates: ["2025-01-13", "2025-01-14"] });
    expect(view(a)).toEqual(view(b));
  });

  it("includes deposits and dividends paid to cash in the cash line", () => {
    // Deposit 10,000 on 9 Jan; buy costs 5,000 on 10 Jan; dividend net 85 to cash on 13 Jan
    const rows = buildValueSeries({
      txns: [t({ id: "b", type: "buy", qty: "100", price: "50", tradeDate: "2025-01-10" })],
      dividends: [{ id: "d", symbol: "OGDC", gross: "100", wht: "15", zakatDeducted: "0", net: "85", paidOn: "2025-01-13", affectsCash: true, createdAt: "x" }],
      cashEntries: [{ id: "c", type: "deposit", amount: "10000", date: "2025-01-09", note: null, createdAt: "x" }],
      closes,
      dates: ["2025-01-09", "2025-01-10", "2025-01-13"],
    });
    expect(rows.map((r) => r.cash.toFixed(2))).toEqual(["10000.00", "5000.00", "5085.00"]);
  });
});

describe("mergeSeries", () => {
  it("sums several portfolios by date, carrying each one's last value forward", () => {
    const merged = mergeSeries([
      [
        { date: "2025-01-10", marketValue: "100", cost: "90", cash: "5", estimated: false },
        { date: "2025-01-13", marketValue: "110", cost: "90", cash: "5", estimated: false },
      ],
      [{ date: "2025-01-13", marketValue: "50", cost: "40", cash: "0", estimated: true }],
    ]);
    expect(merged.map((r) => [r.date, r.marketValue.toFixed(), r.cost.toFixed(), r.estimated])).toEqual([
      ["2025-01-10", "100", "90", false],
      ["2025-01-13", "160", "130", true],
    ]);
  });
});
