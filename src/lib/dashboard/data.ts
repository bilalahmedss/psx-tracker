import "server-only";
import { cache } from "react";
import { requireUser } from "@/lib/auth";
import { txnCashValue } from "@/lib/engine/fifo";
import { D, dec, sum, ZERO, type Dec } from "@/lib/engine/money";
import { mergeSeries } from "@/lib/engine/series";
import { getPortfolioBook } from "@/lib/portfolio/book";
import { pktParts } from "@/lib/psx/calendar";
import { mergeLayout, type LayoutItem } from "./cards";

// Home dashboard data: combines one or all portfolios (each rebuilt by the
// engine) and reads stored daily snapshots for the chart. supabase-js, RLS applies.

export type ChartPoint = { date: string; value: number; cost: number; estimated: boolean };

export type DashboardData = {
  portfolios: { id: string; name: string; isDefault: boolean }[];
  selected: "all" | string;
  totals: {
    marketValue: Dec;
    cost: Dec;
    dayChange: Dec;
    dayChangePct: Dec | null;
    unrealized: Dec;
    unrealizedPct: Dec | null;
    realized: Dec;
    dividendsNet: Dec;
    allTime: Dec;
    allTimePct: Dec | null;
    totalBought: Dec;
    charges: Dec;
    cash: Dec;
    cgt: Dec;
    unpriced: string[];
    delayed: boolean;
    demo: boolean;
  };
  chart: ChartPoint[];
  chartEstimated: boolean;
  layout: LayoutItem[];
};

const pct = (num: Dec, base: Dec) => (base.isZero() ? null : num.div(base).mul(100));

export const getDashboard = cache(async (selection: string): Promise<DashboardData | null> => {
  const { supabase } = await requireUser();
  const [{ data: plist, error }, { data: layoutRow }] = await Promise.all([
    supabase.from("portfolios").select("id, name, is_default").order("is_default", { ascending: false }).order("created_at"),
    supabase.from("dashboard_layouts").select("widgets").eq("name", "Default").maybeSingle(),
  ]);
  if (error) throw new Error(`Could not load portfolios: ${error.message}`);
  const portfolios = (plist ?? []).map((p) => ({ id: p.id as string, name: p.name as string, isDefault: p.is_default as boolean }));
  if (!portfolios.length) return null;

  const selected = selection !== "all" && portfolios.some((p) => p.id === selection) ? selection : "all";
  const ids = selected === "all" ? portfolios.map((p) => p.id) : [selected];
  const books = await Promise.all(ids.map((id) => getPortfolioBook(id)));

  const t = books.map((b) => b.result.totals);
  const s = (pick: (x: (typeof t)[number]) => Dec) => sum(t.map(pick));
  const marketValue = s((x) => x.marketValue);
  const cost = s((x) => x.cost);
  const dayChange = s((x) => x.dayChange);
  const unrealized = s((x) => x.unrealized);
  const realized = s((x) => x.realized);
  const dividendsNet = s((x) => x.dividendsNet);
  const allTime = unrealized.plus(realized).plus(dividendsNet);
  const totalBought = sum(books.flatMap((b) => b.txns.filter((x) => x.type === "buy").map(txnCashValue)));
  const pricedCost = sum(books.flatMap((b) => b.result.holdings.filter((h) => h.marketValue).map((h) => h.cost)));
  const quotes = books.flatMap((b) => Object.values(b.quotes));

  const { data: snaps } = await supabase
    .from("snapshots")
    .select("portfolio_id, date, market_value, cost, cash, estimated")
    .in("portfolio_id", ids)
    .order("date");
  const byPortfolio = ids.map((id) =>
    (snaps ?? [])
      .filter((r) => r.portfolio_id === id)
      .map((r) => ({ date: r.date as string, marketValue: r.market_value as string, cost: r.cost as string, cash: r.cash as string, estimated: r.estimated as boolean })),
  );
  const series = mergeSeries(byPortfolio);

  // Today's point is always live, so the chart ends at the header value.
  const today = pktParts(new Date()).date;
  const live = { date: today, marketValue, cost, cash: s((x) => x.cash), estimated: t.some((x) => x.unpricedSymbols.length > 0) };
  const points = [...series.filter((p) => p.date < today), ...(books.some((b) => b.txns.length) ? [live] : [])];

  return {
    portfolios,
    selected,
    totals: {
      marketValue,
      cost,
      dayChange,
      dayChangePct: pct(dayChange, marketValue.minus(dayChange)),
      unrealized,
      unrealizedPct: pct(unrealized, pricedCost),
      realized,
      dividendsNet,
      allTime,
      allTimePct: pct(allTime, totalBought),
      totalBought,
      charges: s((x) => x.charges),
      cash: s((x) => x.cash),
      cgt: D.max(s((x) => x.cgtIfSoldToday), ZERO),
      unpriced: [...new Set(t.flatMap((x) => x.unpricedSymbols))],
      delayed: quotes.some((q) => q.delayed),
      demo: quotes.some((q) => q.source === "demo"),
    },
    // 4 dp so range changes computed in the chart match the header to the paisa.
    chart: points.map((p) => ({ date: p.date, value: Number(p.marketValue.toFixed(4)), cost: Number(dec(p.cost).toFixed(4)), estimated: p.estimated })),
    chartEstimated: points.some((p) => p.estimated),
    layout: mergeLayout(layoutRow?.widgets),
  };
});
