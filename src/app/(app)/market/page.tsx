import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/skeleton";
import { requireUser } from "@/lib/auth";
import { formatDate, formatPktDayTime, formatPktTime } from "@/lib/format";
import { getCalendar, getLastRuns, getLatestQuotes } from "@/lib/market/queries";
import { formatMinutes, marketStatus, pktParts, type MarketStatus } from "@/lib/psx/calendar";
import { AutoRefresh } from "./auto-refresh";
import { PriceTable } from "./price-table";

export const metadata: Metadata = { title: "Market" };

export default function MarketPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Market</h1>
        <p className="text-sm text-muted-foreground">Latest PSX prices from our own database, refreshed by the price job.</p>
      </div>
      <Suspense
        fallback={
          <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading market data">
            <Skeleton className="h-28" />
            <Skeleton className="h-96" />
          </div>
        }
      >
        <MarketBoard />
      </Suspense>
    </div>
  );
}

const REASON_LABEL: Record<MarketStatus["reason"], string> = {
  session: "Open",
  break: "Midday break",
  before_open: "Pre-open",
  after_close: "Closed for the day",
  weekend: "Weekend",
  holiday: "Holiday",
};

async function MarketBoard() {
  const { supabase } = await requireUser();
  const [quotes, { cal, holidays }, runs] = await Promise.all([getLatestQuotes(supabase), getCalendar(supabase), getLastRuns(supabase)]);
  const now = new Date();
  const status = marketStatus(now, cal);
  const today = pktParts(now).date;
  const upcoming = holidays.filter((h) => h.date >= today).slice(0, 4);

  const source = quotes[0]?.source ?? null;
  const delayed = quotes.some((q) => q.delayed);
  const endOfDay = quotes.some((q) => q.endOfDay);
  const lastPrices = runs["prices"];

  return (
    <>
      <AutoRefresh seconds={60} />
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardDescription>PSX market status</CardDescription>
            <CardTitle className="flex flex-wrap items-center gap-3 text-xl">
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={`size-2.5 rounded-full ${status.state === "open" ? "bg-emerald-500" : "bg-muted-foreground/50"}`}
                />
                {status.state === "open" ? "Open" : "Closed"}
              </span>
              <span className="text-sm font-normal text-muted-foreground">
                {status.dayName ?? REASON_LABEL[status.reason]}
                {" · "}
                {status.state === "open"
                  ? `closes at ${formatPktTime(status.nextChangeAt)} PKT`
                  : `opens ${formatPktDayTime(status.nextChangeAt)} PKT`}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>
              Today&apos;s hours:{" "}
              {status.today.sessions.length
                ? status.today.sessions.map((s) => `${formatMinutes(s.open)}–${formatMinutes(s.close)}`).join(", ") + " PKT"
                : "no trading"}
            </p>
            {status.toConfirm ? <ToConfirm>Today&apos;s hours or holiday are not yet confirmed against the PSX notice.</ToConfirm> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Upcoming closures</CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming.length ? (
              <ul className="flex flex-col gap-2 text-sm">
                {upcoming.map((h) => (
                  <li key={h.date} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-medium">{formatDate(h.date)}</span> · {h.name}
                    </span>
                    {h.status === "to_confirm" ? <ToConfirm compact /> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">None listed.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Prices
            {source === "demo" ? (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                Demo data
              </span>
            ) : null}
            {delayed ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Delayed 15–20 min</span>
            ) : null}
            {endOfDay ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Closing prices</span>
            ) : null}
          </CardTitle>
          <CardDescription>
            {source === "demo"
              ? "Simulated prices for testing the pipeline. Not real market data."
              : source
                ? `Source: ${source.toUpperCase()}.`
                : "No prices stored yet."}
            {lastPrices ? (
              <>
                {" "}
                Last price job: {formatPktDayTime(lastPrices.started_at)} PKT ({lastPrices.status}
                {lastPrices.rows !== null ? `, ${lastPrices.rows} symbols` : ""}).
              </>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {quotes.length ? (
            <PriceTable rows={quotes} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Run <code className="rounded bg-muted px-1">npm run job -- prices --force</code> with the dev server running to load prices.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function ToConfirm({ children, compact }: { children?: React.ReactNode; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
      <span className="rounded-full border border-amber-500/40 px-1.5 py-0.5 font-medium">To confirm</span>
      {compact ? null : children}
    </span>
  );
}
