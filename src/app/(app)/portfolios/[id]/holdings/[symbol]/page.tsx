import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Explain } from "@/components/explain";
import { Skeleton } from "@/components/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TAX_RULES_LAST_CHECKED } from "@/lib/engine/tax-rules";
import { D, dec, sum } from "@/lib/engine/money";
import { changeTone, formatDate, formatPct, formatPktAsOf, formatPrice, formatSigned } from "@/lib/format";
import { getPortfolioBook } from "@/lib/portfolio/book";
import { rs, ratePct, shares, signedRs, tone, toneClass } from "@/lib/portfolio/display";
import { deleteTrade } from "../../entry-actions";

export const metadata: Metadata = { title: "Holding" };

export default function HoldingPage({ params }: PageProps<"/portfolios/[id]/holdings/[symbol]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <HoldingDetail params={params} />
    </Suspense>
  );
}

async function HoldingDetail({ params }: { params: Promise<{ id: string; symbol: string }> }) {
  const { id, symbol: raw } = await params;
  const symbol = decodeURIComponent(raw).toUpperCase();
  const { result, txns, dividends, quotes, names } = await getPortfolioBook(id);

  const holding = result.holdings.find((h) => h.symbol === symbol);
  const symbolTxns = txns.filter((t) => t.symbol === symbol).sort((a, b) => b.tradeDate.localeCompare(a.tradeDate) || b.createdAt.localeCompare(a.createdAt));
  const sales = result.realized.filter((r) => r.symbol === symbol);
  const symbolDivs = dividends.filter((d) => d.symbol === symbol);
  if (!holding && symbolTxns.length === 0 && symbolDivs.length === 0) notFound();

  const quote = quotes[symbol];
  const realized = sales.length ? sum(sales.map((r) => r.gain)) : null;
  const dividendsNet = sum(symbolDivs.map((d) => dec(d.net)));
  const base = `/portfolios/${id}`;
  const here = `${base}/holdings/${encodeURIComponent(symbol)}`;
  const anyToConfirm = holding?.lots.some((l) => l.cgtToConfirm) || sales.some((s) => s.toConfirm);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{symbol}</h2>
          <p className="text-sm text-muted-foreground">{names[symbol] ?? ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`${base}/trades/new?type=buy&symbol=${encodeURIComponent(symbol)}`} className={buttonVariants({ size: "sm" })}>
            Buy
          </Link>
          {holding ? (
            <Link href={`${base}/trades/new?type=sell&symbol=${encodeURIComponent(symbol)}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
              Sell
            </Link>
          ) : null}
          <Link href={`${base}/dividends/new?symbol=${encodeURIComponent(symbol)}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
            Add dividend
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Latest price</CardDescription>
            <CardTitle className="flex flex-wrap items-baseline gap-2 text-2xl tabular-nums money">
              {quote ? `Rs ${formatPrice(quote.price)}` : "No price yet"}
              {quote?.change ? (
                <span className={`text-sm ${toneClass[changeTone(quote.change)]}`}>
                  {formatSigned(quote.change)} ({formatPct(quote.changePct)})
                </span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {quote ? (
              <>
                {quote.endOfDay ? "Closing price, " : "As of "}
                {formatPktAsOf(quote.asOf)} PKT{quote.delayed ? " · delayed 15–20 min" : ""}
                {quote.source === "demo" ? " · demo data" : ""}
              </>
            ) : (
              "Prices appear once the price job has run for this symbol."
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Your position</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Shares</dt>
              <dd className="text-right tabular-nums money">{shares(holding?.qty)}</dd>
              <dt className="text-muted-foreground">Average cost</dt>
              <dd className="text-right tabular-nums money">{holding ? `Rs ${rs(holding.avgCost, 4)}` : "-"}</dd>
              <dt className="text-muted-foreground">Cost</dt>
              <dd className="text-right tabular-nums money">{holding ? `Rs ${rs(holding.cost)}` : "-"}</dd>
              <dt className="text-muted-foreground">Market value</dt>
              <dd className="text-right tabular-nums money">{holding?.marketValue ? `Rs ${rs(holding.marketValue)}` : "-"}</dd>
              <dt className="text-muted-foreground">Unrealized P&amp;L</dt>
              <dd className={`text-right tabular-nums money ${toneClass[tone(holding?.unrealized)]}`}>{signedRs(holding?.unrealized)}</dd>
              <dt className="text-muted-foreground">Realized P&amp;L</dt>
              <dd className={`text-right tabular-nums money ${toneClass[tone(realized)]}`}>{signedRs(realized)}</dd>
              <dt className="text-muted-foreground">Dividends (net)</dt>
              <dd className="text-right tabular-nums money">Rs {rs(dividendsNet)}</dd>
              <dt className="text-muted-foreground">Est. CGT if sold today</dt>
              <dd className="text-right tabular-nums money">{holding?.cgtIfSold ? `Rs ${rs(D.max(holding.cgtIfSold, 0))}` : "-"}</dd>
            </dl>
          </CardContent>
        </Card>
      </div>

      {holding ? (
        <Card>
          <CardHeader>
            <CardTitle>Open lots</CardTitle>
            <CardDescription>Shares you still hold, oldest first. The next sale uses up the top lot first.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-2 pr-3 font-medium">Acquired</th>
                    <th className="py-2 pr-3 text-right font-medium">Shares</th>
                    <th className="py-2 pr-3 text-right font-medium">Cost / share</th>
                    <th className="py-2 pr-3 text-right font-medium">Cost</th>
                    <th className="py-2 pr-3 text-right font-medium">Unrealized</th>
                    <th className="py-2 pr-3 text-right font-medium">Held</th>
                    <th className="py-2 pr-3 text-right font-medium">CGT rate</th>
                    <th className="py-2 text-right font-medium">CGT if sold</th>
                  </tr>
                </thead>
                <tbody>
                  {holding.lots.map((l) => (
                    <tr key={l.lotId} className="border-t">
                      <td className="py-2 pr-3">{formatDate(l.acquiredOn)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums money">
                        {shares(l.qtyOpen)}
                        {!l.qtyOpen.eq(l.qtyOriginal) ? <span className="text-xs text-muted-foreground"> of {shares(l.qtyOriginal)}</span> : null}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums money">{rs(l.costPerShare, 4)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums money">{rs(l.costOpen)}</td>
                      <td className={`py-2 pr-3 text-right tabular-nums money ${toneClass[tone(l.unrealized)]}`}>{signedRs(l.unrealized)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums money">{l.holdingDays} days</td>
                      <td className="py-2 pr-3 text-right tabular-nums money" title={`${l.cgtRuleLabel}; ${l.cgtBasis === "filer" ? "filer on both dates" : "non-filer rate"}`}>
                        {ratePct(l.cgtRate)}
                        {l.cgtToConfirm ? <span className="ml-1 text-[10px] text-amber-700 dark:text-amber-400">to confirm</span> : null}
                      </td>
                      <td className="py-2 text-right tabular-nums money">
                        {l.cgtIfSold ? (l.cgtIfSold.isNegative() ? <span className="text-xs text-muted-foreground">Loss offsets {rs(l.cgtIfSold.neg())}</span> : rs(l.cgtIfSold)) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {sales.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Realized sales</CardTitle>
            <CardDescription>Each sale matched against the lots it used up (FIFO).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-2 pr-3 font-medium">Sold</th>
                    <th className="py-2 pr-3 font-medium">From lot</th>
                    <th className="py-2 pr-3 text-right font-medium">Shares</th>
                    <th className="py-2 pr-3 text-right font-medium">Proceeds</th>
                    <th className="py-2 pr-3 text-right font-medium">Cost</th>
                    <th className="py-2 pr-3 text-right font-medium">Gain</th>
                    <th className="py-2 pr-3 text-right font-medium">CGT rate</th>
                    <th className="py-2 text-right font-medium">Est. CGT</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s, i) => (
                    <tr key={`${s.sellTxnId}:${s.lotId}:${i}`} className="border-t">
                      <td className="py-2 pr-3">{formatDate(s.soldOn)}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {formatDate(s.acquiredOn)} · {s.holdingDays} days
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums money">{shares(s.qty)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums money">{rs(s.proceeds)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums money">{rs(s.cost)}</td>
                      <td className={`py-2 pr-3 text-right tabular-nums money ${toneClass[tone(s.gain)]}`}>{signedRs(s.gain)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums money" title={s.ruleLabel}>
                        {ratePct(s.rate)}
                        {s.toConfirm ? <span className="ml-1 text-[10px] text-amber-700 dark:text-amber-400">to confirm</span> : null}
                      </td>
                      <td className="py-2 text-right tabular-nums money">{s.cgt.isNegative() ? "-" : rs(s.cgt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Trades</CardTitle>
        </CardHeader>
        <CardContent>
          {symbolTxns.length ? (
            <ul className="divide-y text-sm">
              {symbolTxns.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className={t.type === "buy" ? "font-medium text-emerald-700 dark:text-emerald-400" : "font-medium text-red-700 dark:text-red-400"}>
                      {t.type === "buy" ? "Buy" : "Sell"}
                    </span>{" "}
                    {formatPrice(t.qty, 0)} @ Rs {formatPrice(t.price)}{" "}
                    <span className="text-muted-foreground">· {formatDate(t.tradeDate)}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Link href={`${base}/trades/${t.id}/edit?returnTo=${encodeURIComponent(here)}`} className={buttonVariants({ size: "sm", variant: "ghost" })}>
                      Edit
                    </Link>
                    <ConfirmDelete action={deleteTrade.bind(null, id, t.id)} confirmText={`Delete this ${t.type} of ${t.qty} ${symbol}?`} returnTo={here} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No trades.</p>
          )}
        </CardContent>
      </Card>

      <Explain>
        <p>
          <strong>Lots and FIFO:</strong> every buy is a lot. Its cost includes commission, sales tax and other charges. A sale uses up the
          oldest lots first, and each lot&apos;s share of the sale proceeds (after selling charges) minus its cost is the realized gain.
        </p>
        <p>
          <strong>CGT:</strong> the rate depends on when the lot was bought, how long it was held, and whether the portfolio was a filer on
          both the buy and sell dates. &ldquo;If sold today&rdquo; uses today&apos;s date and latest price; a loss offsets gains in the same tax
          year (July–June). Estimates only, rules last checked {TAX_RULES_LAST_CHECKED}.
          {anyToConfirm ? " Rates marked “to confirm” apply the filer schedule to non-filers on shares bought before July 2024, pending confirmation." : ""}
        </p>
      </Explain>
    </div>
  );
}
