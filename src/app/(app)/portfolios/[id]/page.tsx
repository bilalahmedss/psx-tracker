import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Explain } from "@/components/explain";
import { Skeleton } from "@/components/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getPortfolioBook } from "@/lib/portfolio/book";
import { pct, rs, shares, signedRs, tone } from "@/lib/portfolio/display";
import { HoldingsTable, type HoldingRow } from "./holdings-table";

export const metadata: Metadata = { title: "Holdings" };

export default function HoldingsPage({ params }: PageProps<"/portfolios/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-72" />}>
      <Holdings params={params} />
    </Suspense>
  );
}

async function Holdings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { result, quotes, names } = await getPortfolioBook(id);
  const total = result.totals.marketValue;

  if (result.holdings.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 py-6">
          <p className="font-medium">No holdings yet</p>
          <p className="text-sm text-muted-foreground">Add your first buy to start tracking this portfolio. Fees fill in from your fee profile.</p>
          <Link href={`/portfolios/${id}/trades/new?type=buy`} className={buttonVariants()}>
            Add a buy
          </Link>
        </CardContent>
      </Card>
    );
  }

  const rows: HoldingRow[] = result.holdings.map((h) => ({
    symbol: h.symbol,
    name: names[h.symbol] ?? h.symbol,
    shares: shares(h.qty),
    avgCost: rs(h.avgCost),
    price: h.price ? rs(h.price) : null,
    delayed: quotes[h.symbol]?.delayed ?? false,
    marketValue: h.marketValue ? rs(h.marketValue) : null,
    unrealized: signedRs(h.unrealized),
    unrealizedPct: pct(h.unrealizedPct),
    unrealizedTone: tone(h.unrealized),
    dayChange: signedRs(h.dayChange),
    dayTone: tone(h.dayChange),
    weight: h.marketValue && !total.isZero() ? `${h.marketValue.div(total).mul(100).toFixed(1)}%` : "-",
    sort: {
      symbol: h.symbol,
      shares: Number(h.qty),
      avgCost: Number(h.avgCost),
      price: h.price ? Number(h.price) : -Infinity,
      marketValue: h.marketValue ? Number(h.marketValue) : -Infinity,
      unrealized: h.unrealized ? Number(h.unrealized) : -Infinity,
      unrealizedPct: h.unrealizedPct ? Number(h.unrealizedPct) : -Infinity,
      dayChange: h.dayChange ? Number(h.dayChange) : -Infinity,
    },
  }));

  return (
    <div className="flex flex-col gap-4">
      <HoldingsTable portfolioId={id} rows={rows} />
      <Explain>
        <p>
          <strong>Average cost</strong> = cost of the shares you still hold ÷ shares held. Cost includes commission, sales tax and other
          charges on each buy. Sells use up your oldest shares first (FIFO), so average cost stays the same after a sale.
        </p>
        <p>
          <strong>Unrealized P&amp;L</strong> = shares × latest price − cost. It does not deduct the fees you would pay to sell.
        </p>
        <p>
          <strong>Today</strong> = shares × (latest price − previous close). Total unrealized: {signedRs(result.totals.unrealized)} (
          {pct(result.totals.unrealizedPct)}) on Rs {rs(result.totals.cost)}.
        </p>
      </Explain>
    </div>
  );
}
