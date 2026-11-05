import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Explain } from "@/components/explain";
import { PriceRefresh } from "@/components/price-refresh";
import { Skeleton } from "@/components/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { CardId } from "@/lib/dashboard/cards";
import { getDashboard } from "@/lib/dashboard/data";
import { pct, rs, signedRs, tone, toneClass } from "@/lib/portfolio/display";
import { DashboardCards, type CardValue } from "./dashboard-cards";
import { PortfolioPicker } from "./portfolio-picker";
import { ValueChart } from "./value-chart";

export const metadata: Metadata = { title: "Home" };

export default function HomePage({ searchParams }: PageProps<"/home">) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading dashboard">
          <Skeleton className="h-24" />
          <Skeleton className="h-72" />
          <Skeleton className="h-40" />
        </div>
      }
    >
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const data = await getDashboard(typeof sp.portfolio === "string" ? sp.portfolio : "all");

  if (!data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 py-8">
          <h1 className="text-xl font-semibold">Welcome</h1>
          <p className="text-sm text-muted-foreground">Create a portfolio to start tracking your PSX investments.</p>
          <Link href="/portfolios/new" className={buttonVariants()}>
            Create a portfolio
          </Link>
        </CardContent>
      </Card>
    );
  }

  const t = data.totals;
  const values: Record<CardId, CardValue> = {
    value: { value: `Rs ${rs(t.marketValue)}`, sub: t.unpriced.length ? `${t.unpriced.length} without a price` : undefined },
    today: { value: signedRs(t.dayChange), sub: pct(t.dayChangePct), tone: tone(t.dayChange) },
    allTime: { value: signedRs(t.allTime), sub: pct(t.allTimePct), tone: tone(t.allTime) },
    cost: { value: `Rs ${rs(t.cost)}` },
    unrealized: { value: signedRs(t.unrealized), sub: pct(t.unrealizedPct), tone: tone(t.unrealized) },
    realized: { value: signedRs(t.realized), tone: tone(t.realized) },
    dividends: { value: `Rs ${rs(t.dividendsNet)}` },
    charges: { value: `Rs ${rs(t.charges)}` },
    cash: { value: `Rs ${rs(t.cash)}`, tone: t.cash.isNegative() ? "down" : undefined },
    cgt: { value: `Rs ${rs(t.cgt)}`, sub: "Estimate" },
  };
  const selectedName = data.selected === "all" ? "All portfolios" : data.portfolios.find((p) => p.id === data.selected)?.name;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <PortfolioPicker portfolios={data.portfolios} selected={data.selected} />
          <h1 className="sr-only">Home: {selectedName}</h1>
          <p className="text-4xl font-semibold tracking-tight tabular-nums money">Rs {rs(t.marketValue)}</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span>
              <span className="text-muted-foreground">Today </span>
              <span className={`font-medium tabular-nums money ${toneClass[tone(t.dayChange)]}`}>
                {signedRs(t.dayChange)} ({pct(t.dayChangePct)})
              </span>
            </span>
            <span>
              <span className="text-muted-foreground">All time </span>
              <span className={`font-medium tabular-nums money ${toneClass[tone(t.allTime)]}`}>
                {signedRs(t.allTime)} ({pct(t.allTimePct)})
              </span>
            </span>
          </div>
          <PriceRefresh />
        </div>
        {data.selected !== "all" ? (
          <Link href={`/portfolios/${data.selected}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Open portfolio
          </Link>
        ) : null}
      </div>

      <Card>
        <CardContent className="pt-4">
          <ValueChart points={data.chart} estimated={data.chartEstimated} />
        </CardContent>
      </Card>

      <DashboardCards key={JSON.stringify(data.layout)} initial={data.layout} values={values} />

      <Explain>
        <p>
          <strong>Market value</strong> is your holdings at the latest prices. <strong>Today</strong> is the change since the previous
          close.
        </p>
        <p>
          <strong>All-time return</strong> = unrealized P&amp;L + realized P&amp;L + net dividends. All charges are already included
          because they&apos;re part of cost and proceeds. The percentage is relative to everything you&apos;ve spent on buys (Rs{" "}
          <span className="money">{rs(t.totalBought)}</span>).
        </p>
        <p>The chart uses daily snapshots rebuilt by a background job whenever your trades change; today&apos;s point is live.</p>
      </Explain>
    </div>
  );
}
