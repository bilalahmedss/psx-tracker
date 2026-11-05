import { buildCashLedger } from "./cash";
import { cgtByTaxYear, cgtRate, type CgtRateResult, type TaxYearCgt } from "./cgt";
import { runFifo, type LotMatch, type OpenLot } from "./fifo";
import { D, daysBetween, dec, paisa, sum, ZERO, type Dec } from "./money";
import { statusOn } from "./tax-status";
import type { EngineCashEntry, EngineDividend, EnginePrice, EngineTxn, TaxStatusPeriod } from "./types";

export type LotView = OpenLot & {
  holdingDays: number;
  marketValue: Dec | null;
  unrealized: Dec | null;
  cgtRate: Dec;
  cgtRule: CgtRateResult["rule"];
  cgtRuleLabel: string;
  cgtBasis: CgtRateResult["basis"];
  cgtToConfirm: boolean;
  /** Unrealized gain x rate (negative for a loss, which offsets gains). */
  cgtIfSold: Dec | null;
};

export type Holding = {
  symbol: string;
  qty: Dec;
  cost: Dec;
  avgCost: Dec;
  price: Dec | null;
  prevClose: Dec | null;
  marketValue: Dec | null;
  unrealized: Dec | null;
  unrealizedPct: Dec | null;
  dayChange: Dec | null;
  realized: Dec;
  dividendsNet: Dec;
  lots: LotView[];
  cgtIfSold: Dec | null;
};

export type RealizedSale = LotMatch & {
  rate: Dec;
  rule: CgtRateResult["rule"];
  ruleLabel: string;
  basis: CgtRateResult["basis"];
  toConfirm: boolean;
  cgt: Dec;
};

export type PortfolioResult = {
  holdings: Holding[];
  realized: RealizedSale[];
  realizedByTaxYear: TaxYearCgt[];
  ledger: ReturnType<typeof buildCashLedger>;
  totals: {
    cost: Dec;
    marketValue: Dec;
    unrealized: Dec;
    unrealizedPct: Dec | null;
    dayChange: Dec;
    realized: Dec;
    dividendsGross: Dec;
    dividendsWht: Dec;
    dividendsNet: Dec;
    /** Commission + sales tax + other charges paid. */
    charges: Dec;
    cash: Dec;
    /** Estimated CGT if every priced holding were sold on the as-of date (>= 0). */
    cgtIfSoldToday: Dec;
    unpricedSymbols: string[];
  };
};

export type PortfolioInput = {
  txns: EngineTxn[];
  dividends: EngineDividend[];
  cashEntries: EngineCashEntry[];
  prices: Record<string, EnginePrice | undefined>;
  taxStatusHistory: TaxStatusPeriod[];
  /** Portfolio's non-filer CGT rate as a fraction. */
  nonFilerRate: string;
  /** Valuation date (YYYY-MM-DD, PKT). Later rows are ignored. */
  asOf: string;
};

/** Everything derived from a portfolio's transactions. Always rebuilt, never stored. */
export function buildPortfolio(input: PortfolioInput): PortfolioResult {
  const txns = input.txns.filter((t) => t.tradeDate <= input.asOf);
  const dividends = input.dividends.filter((d) => d.paidOn <= input.asOf);
  const entries = input.cashEntries.filter((e) => e.date <= input.asOf);
  const isFiler = (date: string) => statusOn(input.taxStatusHistory, date) === "filer";

  const { lots, matches } = runFifo(txns);

  const realized: RealizedSale[] = matches.map((m) => {
    const r = cgtRate({ acquiredOn: m.acquiredOn, soldOn: m.soldOn, filerOnBuy: isFiler(m.acquiredOn), filerOnSell: isFiler(m.soldOn), nonFilerRate: input.nonFilerRate });
    return { ...m, rate: r.rate, rule: r.rule, ruleLabel: r.ruleLabel, basis: r.basis, toConfirm: r.toConfirm, cgt: paisa(m.gain.mul(r.rate)) };
  });

  const symbols = [...new Set(lots.map((l) => l.symbol))];
  const holdings: Holding[] = symbols.map((symbol) => {
    const quote = input.prices[symbol];
    const price = quote ? dec(quote.price) : null;
    const prevClose = quote?.prevClose ? dec(quote.prevClose) : null;
    const symbolLots = lots.filter((l) => l.symbol === symbol);

    const lotViews: LotView[] = symbolLots.map((l) => {
      const r = cgtRate({ acquiredOn: l.acquiredOn, soldOn: input.asOf, filerOnBuy: isFiler(l.acquiredOn), filerOnSell: isFiler(input.asOf), nonFilerRate: input.nonFilerRate });
      const marketValue = price ? l.qtyOpen.mul(price) : null;
      const unrealized = marketValue ? marketValue.minus(l.costOpen) : null;
      return {
        ...l,
        holdingDays: daysBetween(l.acquiredOn, input.asOf),
        marketValue,
        unrealized,
        cgtRate: r.rate,
        cgtRule: r.rule,
        cgtRuleLabel: r.ruleLabel,
        cgtBasis: r.basis,
        cgtToConfirm: r.toConfirm,
        cgtIfSold: unrealized ? unrealized.mul(r.rate) : null,
      };
    });

    const qty = sum(symbolLots.map((l) => l.qtyOpen));
    const cost = sum(symbolLots.map((l) => l.costOpen));
    const marketValue = price ? qty.mul(price) : null;
    const unrealized = marketValue ? marketValue.minus(cost) : null;
    return {
      symbol,
      qty,
      cost,
      avgCost: cost.div(qty),
      price,
      prevClose,
      marketValue,
      unrealized,
      unrealizedPct: unrealized && !cost.isZero() ? unrealized.div(cost).mul(100) : null,
      dayChange: price && prevClose ? qty.mul(price.minus(prevClose)) : null,
      realized: sum(realized.filter((r) => r.symbol === symbol).map((r) => r.gain)),
      dividendsNet: sum(dividends.filter((d) => d.symbol === symbol).map((d) => dec(d.net))),
      lots: lotViews,
      cgtIfSold: price ? sum(lotViews.map((l) => l.cgtIfSold ?? ZERO)) : null,
    };
  });

  holdings.sort((a, b) => {
    if (a.marketValue && b.marketValue) return b.marketValue.comparedTo(a.marketValue) || a.symbol.localeCompare(b.symbol);
    if (a.marketValue) return -1;
    if (b.marketValue) return 1;
    return a.symbol.localeCompare(b.symbol);
  });

  const priced = holdings.filter((h) => h.marketValue);
  const pricedCost = sum(priced.map((h) => h.cost));
  const unrealized = sum(priced.map((h) => h.unrealized!));
  const ledger = buildCashLedger({ txns, dividends, entries });

  return {
    holdings,
    realized,
    realizedByTaxYear: cgtByTaxYear(realized.map((r) => ({ soldOn: r.soldOn, gain: r.gain, rate: r.rate }))),
    ledger,
    totals: {
      cost: sum(holdings.map((h) => h.cost)),
      marketValue: sum(priced.map((h) => h.marketValue!)),
      unrealized,
      unrealizedPct: pricedCost.isZero() ? null : unrealized.div(pricedCost).mul(100),
      dayChange: sum(holdings.map((h) => h.dayChange ?? ZERO)),
      realized: sum(realized.map((r) => r.gain)),
      dividendsGross: sum(dividends.map((d) => dec(d.gross))),
      dividendsWht: sum(dividends.map((d) => dec(d.wht))),
      dividendsNet: sum(dividends.map((d) => dec(d.net))),
      charges: sum(txns.map((t) => dec(t.fee).plus(t.tax).plus(t.otherCharges))),
      cash: ledger.balance,
      cgtIfSoldToday: paisa(D.max(sum(priced.map((h) => h.cgtIfSold!)), ZERO)),
      unpricedSymbols: holdings.filter((h) => !h.marketValue).map((h) => h.symbol),
    },
  };
}
