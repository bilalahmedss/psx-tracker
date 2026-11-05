import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { requireUser } from "@/lib/auth";
import type { FeeProfile } from "@/lib/engine/fees";
import { buildPortfolio, type PortfolioResult } from "@/lib/engine/portfolio";
import { percentToFraction } from "@/lib/portfolio/rates";
import type { EngineCashEntry, EngineDividend, EnginePrice, EngineTxn, TaxStatusPeriod } from "@/lib/engine/types";
import { pktParts } from "@/lib/psx/calendar";
import { getPortfolio, type PortfolioDetail } from "./queries";

// Loads one portfolio's raw rows (supabase-js, RLS applies) and rebuilds every
// derived figure with the engine. Memoised per request so the layout and page
// share one load.

export type TxnRow = EngineTxn & { note: string | null };
export type DividendRow = EngineDividend & { shares: string | null; dps: string | null; note: string | null };
export type CashEntryRow = EngineCashEntry;
export type QuoteInfo = EnginePrice & { change: string | null; changePct: string | null; asOf: string; delayed: boolean; endOfDay: boolean; source: string };

export type PortfolioBook = {
  portfolio: PortfolioDetail;
  txns: TxnRow[];
  dividends: DividendRow[];
  cashEntries: CashEntryRow[];
  quotes: Record<string, QuoteInfo>;
  names: Record<string, string>;
  taxHistory: TaxStatusPeriod[];
  /** Non-filer CGT rate as a fraction. */
  nonFilerRate: string;
  asOf: string;
  result: PortfolioResult;
};

type TxnDb = {
  id: string;
  symbol: string;
  type: "buy" | "sell";
  qty: string;
  price: string;
  fee: string;
  tax: string;
  other_charges: string;
  trade_date: string;
  created_at: string;
  affects_cash: boolean;
  note: string | null;
};
type DivDb = {
  id: string;
  symbol: string;
  gross: string;
  wht: string;
  zakat_deducted: string;
  net: string;
  paid_on: string;
  affects_cash: boolean;
  created_at: string;
  shares: string | null;
  dps: string | null;
  note: string | null;
};
type CashDb = { id: string; type: EngineCashEntry["type"]; amount: string; date: string; note: string | null; created_at: string };
type QuoteDb = {
  symbol: string;
  price: string;
  prev_close: string | null;
  change: string | null;
  change_pct: string | null;
  as_of: string;
  delayed: boolean;
  end_of_day: boolean;
  source: string;
};

export const getPortfolioBook = cache(async (portfolioId: string): Promise<PortfolioBook> => {
  const { supabase } = await requireUser();
  const portfolio = await getPortfolio(supabase, portfolioId);
  if (!portfolio) notFound();

  const [t, d, c] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, symbol, type, qty, price, fee, tax, other_charges, trade_date, created_at, affects_cash, note")
      .eq("portfolio_id", portfolioId)
      .in("type", ["buy", "sell"])
      .overrideTypes<TxnDb[], { merge: false }>(),
    supabase
      .from("dividend_receipts")
      .select("id, symbol, gross, wht, zakat_deducted, net, paid_on, affects_cash, created_at, shares, dps, note")
      .eq("portfolio_id", portfolioId)
      .overrideTypes<DivDb[], { merge: false }>(),
    supabase
      .from("cash_entries")
      .select("id, type, amount, date, note, created_at")
      .eq("portfolio_id", portfolioId)
      .overrideTypes<CashDb[], { merge: false }>(),
  ]);
  for (const r of [t, d, c]) if (r.error) throw new Error(`Could not load portfolio data: ${r.error.message}`);

  const txns: TxnRow[] = t.data!.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    type: r.type,
    qty: r.qty,
    price: r.price,
    fee: r.fee,
    tax: r.tax,
    otherCharges: r.other_charges,
    tradeDate: r.trade_date,
    createdAt: r.created_at,
    affectsCash: r.affects_cash,
    note: r.note,
  }));
  const dividends: DividendRow[] = d.data!.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    gross: r.gross,
    wht: r.wht,
    zakatDeducted: r.zakat_deducted,
    net: r.net,
    paidOn: r.paid_on,
    affectsCash: r.affects_cash,
    createdAt: r.created_at,
    shares: r.shares,
    dps: r.dps,
    note: r.note,
  }));
  const cashEntries: CashEntryRow[] = c.data!.map((r) => ({ id: r.id, type: r.type, amount: r.amount, date: r.date, note: r.note, createdAt: r.created_at }));

  const symbols = [...new Set([...txns.map((x) => x.symbol), ...dividends.map((x) => x.symbol)])];
  const quotes: Record<string, QuoteInfo> = {};
  const names: Record<string, string> = {};
  if (symbols.length) {
    const [q, s] = await Promise.all([
      supabase
        .from("prices_latest")
        .select("symbol, price, prev_close, change, change_pct, as_of, delayed, end_of_day, source")
        .in("symbol", symbols)
        .overrideTypes<QuoteDb[], { merge: false }>(),
      supabase.from("securities").select("symbol, name").in("symbol", symbols),
    ]);
    for (const r of q.data ?? []) {
      quotes[r.symbol] = { price: r.price, prevClose: r.prev_close, change: r.change, changePct: r.change_pct, asOf: r.as_of, delayed: r.delayed, endOfDay: r.end_of_day, source: r.source };
    }
    for (const r of (s.data ?? []) as { symbol: string; name: string }[]) names[r.symbol] = r.name;
  }

  const taxHistory = portfolio.taxHistory.map((h) => ({ status: h.status, effectiveFrom: h.effectiveFrom }));
  const nonFilerRate = percentToFraction(portfolio.cgt.nonFilerRate);
  const asOf = pktParts(new Date()).date;

  const result = buildPortfolio({ txns, dividends, cashEntries, prices: quotes, taxStatusHistory: taxHistory, nonFilerRate, asOf });

  return { portfolio, txns, dividends, cashEntries, quotes, names, taxHistory, nonFilerRate, asOf, result };
});

/** All listed symbols for the stock search box. */
export const getSecurityOptions = cache(async (): Promise<{ symbol: string; name: string }[]> => {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("securities").select("symbol, name").order("symbol").limit(5000);
  if (error) throw new Error(`Could not load securities: ${error.message}`);
  return data as { symbol: string; name: string }[];
});

/** The portfolio's fee profile as engine fractions (the form shows percents). */
export function feeProfileOf(book: PortfolioBook): FeeProfile {
  const f = book.portfolio.fees;
  return {
    threshold: f.threshold,
    pctAbove: percentToFraction(f.pctAbove),
    perShareBelow: f.perShareBelow,
    fedPct: percentToFraction(f.fedPct),
    minFee: f.minFee,
    cdcPerTrade: f.cdcPerTrade,
    psxLevyPct: percentToFraction(f.psxLevyPct),
    secpLevyPct: percentToFraction(f.secpLevyPct),
    nccplLevyPct: percentToFraction(f.nccplLevyPct),
  };
}

/** Shares currently held per symbol, as plain strings. */
export function heldBySymbol(book: PortfolioBook): Record<string, string> {
  return Object.fromEntries(book.result.holdings.map((h) => [h.symbol, h.qty.toFixed()]));
}

/** Cash ledger inputs for client-side warnings (engine rows only, no notes). */
export function cashContextOf(book: PortfolioBook) {
  return {
    txns: book.txns.map((t) => ({ id: t.id, symbol: t.symbol, type: t.type, qty: t.qty, price: t.price, fee: t.fee, tax: t.tax, otherCharges: t.otherCharges, tradeDate: t.tradeDate, createdAt: t.createdAt, affectsCash: t.affectsCash })),
    dividends: book.dividends.map((d) => ({ id: d.id, symbol: d.symbol, gross: d.gross, wht: d.wht, zakatDeducted: d.zakatDeducted, net: d.net, paidOn: d.paidOn, affectsCash: d.affectsCash, createdAt: d.createdAt })),
    entries: book.cashEntries,
  };
}
