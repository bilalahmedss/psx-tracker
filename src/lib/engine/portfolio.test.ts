import { describe, expect, it } from "vitest";
import { buildPortfolio } from "./portfolio";
import type { EngineTxn } from "./types";

const t = (p: Partial<EngineTxn> & Pick<EngineTxn, "id" | "symbol" | "type" | "qty" | "price" | "tradeDate">): EngineTxn => ({
  fee: "0",
  tax: "0",
  otherCharges: "0",
  affectsCash: true,
  createdAt: `${p.tradeDate}T10:00:00Z`,
  ...p,
});

const txns: EngineTxn[] = [
  t({ id: "b1", symbol: "OGDC", type: "buy", qty: "1000", price: "50", fee: "75", tax: "11.25", otherCharges: "5", tradeDate: "2025-01-10" }),
  t({ id: "s1", symbol: "OGDC", type: "sell", qty: "400", price: "60", fee: "36", tax: "5.40", otherCharges: "2", tradeDate: "2025-03-10" }),
  t({ id: "b2", symbol: "HBL", type: "buy", qty: "100", price: "150", tradeDate: "2025-05-01" }),
];

const portfolio = (overrides: Partial<Parameters<typeof buildPortfolio>[0]> = {}) =>
  buildPortfolio({
    txns,
    dividends: [
      { id: "d1", symbol: "OGDC", gross: "5500", wht: "825", zakatDeducted: "0", net: "4675", paidOn: "2025-04-01", affectsCash: false, createdAt: "2025-04-01T10:00:00Z" },
    ],
    cashEntries: [],
    prices: {
      OGDC: { price: "55", prevClose: "54" },
      // HBL has no price yet
    },
    taxStatusHistory: [{ status: "filer", effectiveFrom: "1900-01-01" }],
    nonFilerRate: "0.20",
    asOf: "2025-06-15",
    ...overrides,
  });

describe("buildPortfolio", () => {
  it("builds holdings with average cost and unrealized P&L", () => {
    const p = portfolio();
    const ogdc = p.holdings.find((h) => h.symbol === "OGDC")!;
    // 600 shares costing 30,054.75 (50.09125 each), worth 600 x 55 = 33,000
    // Unrealized 33,000 - 30,054.75 = 2,945.25 = 9.80% of cost
    // Day change 600 x (55 - 54) = 600
    expect(ogdc.qty.toFixed()).toBe("600");
    expect(ogdc.cost.toFixed(2)).toBe("30054.75");
    expect(ogdc.avgCost.toFixed(5)).toBe("50.09125");
    expect(ogdc.marketValue!.toFixed(2)).toBe("33000.00");
    expect(ogdc.unrealized!.toFixed(2)).toBe("2945.25");
    expect(ogdc.unrealizedPct!.toFixed(2)).toBe("9.80");
    expect(ogdc.dayChange!.toFixed(2)).toBe("600.00");
    expect(ogdc.realized.toFixed(2)).toBe("3920.10");
  });

  it("estimates CGT if each open lot were sold today", () => {
    const ogdc = portfolio().holdings.find((h) => h.symbol === "OGDC")!;
    // Acquired 10 Jan 2025 (2024-onwards rule), filer on both dates: 15%
    // 2,945.25 x 15% = 441.7875 -> 441.79
    expect(ogdc.lots[0].cgtRate.toFixed()).toBe("0.15");
    expect(ogdc.lots[0].cgtIfSold!.toFixed(2)).toBe("441.79");
    expect(ogdc.lots[0].holdingDays).toBe(156);
  });

  it("uses the non-filer rate after the status changes, even for older lots", () => {
    const ogdc = portfolio({
      taxStatusHistory: [
        { status: "filer", effectiveFrom: "1900-01-01" },
        { status: "non_filer", effectiveFrom: "2025-06-01" },
      ],
    }).holdings.find((h) => h.symbol === "OGDC")!;
    // Filer when bought, non-filer "today" (15 Jun 2025): portfolio rate 20%; 2,945.25 x 20% = 589.05
    expect(ogdc.lots[0].cgtRate.toFixed()).toBe("0.2");
    expect(ogdc.lots[0].cgtIfSold!.toFixed(2)).toBe("589.05");
  });

  it("leaves value blank for holdings without a price, and excludes them from totals", () => {
    const p = portfolio();
    const hbl = p.holdings.find((h) => h.symbol === "HBL")!;
    expect(hbl.marketValue).toBeNull();
    expect(hbl.unrealized).toBeNull();
    expect(p.totals.unpricedSymbols).toEqual(["HBL"]);
    // Cost includes HBL (15,000); market value and unrealized only cover priced holdings
    expect(p.totals.cost.toFixed(2)).toBe("45054.75");
    expect(p.totals.marketValue.toFixed(2)).toBe("33000.00");
    expect(p.totals.unrealized.toFixed(2)).toBe("2945.25");
  });

  it("totals realized gains, dividends, fees and CGT by tax year", () => {
    const { totals, realizedByTaxYear } = portfolio();
    expect(totals.realized.toFixed(2)).toBe("3920.10");
    expect(totals.dividendsGross.toFixed(2)).toBe("5500.00");
    expect(totals.dividendsNet.toFixed(2)).toBe("4675.00");
    // 75 + 11.25 + 5 + 36 + 5.40 + 2 = 134.65
    expect(totals.charges.toFixed(2)).toBe("134.65");
    // Sold 10 Mar 2025 -> TY2025; 3,920.10 x 15% = 588.015 -> 588.02
    expect(realizedByTaxYear.map((y) => [y.taxYear, y.cgt.toFixed(2)])).toEqual([[2025, "588.02"]]);
    expect(totals.cgtIfSoldToday.toFixed(2)).toBe("441.79");
  });

  it("records the CGT rate on each realized sale", () => {
    const { realized } = portfolio();
    expect(realized).toHaveLength(1);
    expect(realized[0]).toMatchObject({ symbol: "OGDC", sellTxnId: "s1", lotId: "b1", rule: "2024-onwards", basis: "filer" });
    expect(realized[0].cgt.toFixed(2)).toBe("588.02");
  });

  it("only counts transactions up to the as-of date", () => {
    const p = portfolio({ asOf: "2025-02-01" });
    expect(p.holdings.map((h) => [h.symbol, h.qty.toFixed()])).toEqual([["OGDC", "1000"]]);
    expect(p.realized).toHaveLength(0);
  });

  it("includes the cash ledger balance", () => {
    // -50,091.25 + 23,956.60 - 15,000 = -41,134.65 (dividend not in cash)
    expect(portfolio().totals.cash.toFixed(2)).toBe("-41134.65");
  });

  it("sorts holdings by market value, unpriced last", () => {
    expect(portfolio().holdings.map((h) => h.symbol)).toEqual(["OGDC", "HBL"]);
  });
});
