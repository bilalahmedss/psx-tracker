import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { getPortfolioBook } from "@/lib/portfolio/book";
import { pct, rs, signedRs, tone, toneClass } from "@/lib/portfolio/display";
import { TAX_STATUS_LABEL } from "../labels";
import { PortfolioTabs } from "./tabs";

export default function PortfolioLayout({ children, params }: LayoutProps<"/portfolios/[id]">) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<Skeleton className="h-44" />}>
        <PortfolioHeader params={params} />
      </Suspense>
      {children}
    </div>
  );
}

async function PortfolioHeader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { portfolio, result } = await getPortfolioBook(id);
  const t = result.totals;

  const stats: { label: string; value: string; sub?: string; toneOf?: Parameters<typeof tone>[0] }[] = [
    { label: "Market value", value: `Rs ${rs(t.marketValue)}`, sub: t.unpricedSymbols.length ? `${t.unpricedSymbols.length} without a price` : undefined },
    { label: "Cost of holdings", value: `Rs ${rs(t.cost)}` },
    { label: "Unrealized P&L", value: signedRs(t.unrealized), sub: pct(t.unrealizedPct), toneOf: t.unrealized },
    { label: "Today", value: signedRs(t.dayChange), toneOf: t.dayChange },
    { label: "Realized P&L", value: signedRs(t.realized), toneOf: t.realized },
    { label: "Dividends (net)", value: `Rs ${rs(t.dividendsNet)}` },
    { label: "Charges paid", value: `Rs ${rs(t.charges)}`, sub: "Commission, tax, other" },
    { label: "Cash balance", value: `Rs ${rs(t.cash)}`, toneOf: t.cash.isNegative() ? t.cash : undefined },
    { label: "Est. CGT if sold today", value: `Rs ${rs(t.cgtIfSoldToday)}`, sub: "Estimate" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href="/portfolios" className="text-sm text-muted-foreground hover:text-foreground">
            ← Portfolios
          </Link>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{portfolio.name}</h1>
          <p className="text-sm text-muted-foreground">
            {portfolio.brokerName ?? "No broker"} · {TAX_STATUS_LABEL[portfolio.taxStatus]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/portfolios/${id}/trades/new?type=buy`} className={buttonVariants({ size: "sm" })}>
            Add trade
          </Link>
          <Link href={`/portfolios/${id}/dividends/new`} className={buttonVariants({ size: "sm", variant: "outline" })}>
            Add dividend
          </Link>
          <Link href={`/portfolios/${id}/cash/new`} className={buttonVariants({ size: "sm", variant: "outline" })}>
            Cash entry
          </Link>
          <Link href={`/portfolios/${id}/edit`} className={buttonVariants({ size: "sm", variant: "ghost" })}>
            Settings
          </Link>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
        {stats.map((s) => (
          <div key={s.label} className="bg-card px-3 py-2.5">
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className={`text-sm font-semibold tabular-nums ${s.toneOf !== undefined ? toneClass[tone(s.toneOf)] : ""}`}>{s.value}</dd>
            {s.sub ? <dd className="text-xs text-muted-foreground">{s.sub}</dd> : null}
          </div>
        ))}
      </dl>
      <PortfolioTabs id={id} />
    </div>
  );
}
