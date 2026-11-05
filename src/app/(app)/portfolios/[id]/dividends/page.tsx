import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Explain } from "@/components/explain";
import { Skeleton } from "@/components/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { dec, sum } from "@/lib/engine/money";
import { DIVIDEND_WHT } from "@/lib/engine/tax-rules";
import { formatDate } from "@/lib/format";
import { getPortfolioBook } from "@/lib/portfolio/book";
import { rs, shares } from "@/lib/portfolio/display";
import { deleteDividend } from "../entry-actions";

export const metadata: Metadata = { title: "Dividends" };

export default function DividendsPage({ params }: PageProps<"/portfolios/[id]/dividends">) {
  return (
    <Suspense fallback={<Skeleton className="h-72" />}>
      <Dividends params={params} />
    </Suspense>
  );
}

async function Dividends({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { dividends } = await getPortfolioBook(id);
  const here = `/portfolios/${id}/dividends`;
  const rows = [...dividends].sort((a, b) => b.paidOn.localeCompare(a.paidOn) || b.createdAt.localeCompare(a.createdAt));
  const total = (k: "gross" | "wht" | "zakatDeducted" | "net") => rs(sum(rows.map((r) => dec(r[k]))));

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">No dividends recorded yet.</p>
        <Link href={`/portfolios/${id}/dividends/new`} className={buttonVariants()}>
          Add a dividend
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Paid</th>
              <th className="px-3 py-2 font-medium">Symbol</th>
              <th className="px-3 py-2 text-right font-medium">Shares</th>
              <th className="px-3 py-2 text-right font-medium">Per share</th>
              <th className="px-3 py-2 text-right font-medium">Gross</th>
              <th className="px-3 py-2 text-right font-medium">Tax withheld</th>
              <th className="px-3 py-2 text-right font-medium">Zakat</th>
              <th className="px-3 py-2 text-right font-medium">Net</th>
              <th className="px-3 py-2 font-medium">Cash</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="border-t">
                <td className="px-3 py-2 whitespace-nowrap">{formatDate(d.paidOn)}</td>
                <td className="px-3 py-2 font-medium">{d.symbol}</td>
                <td className="px-3 py-2 text-right tabular-nums money">{d.shares ? shares(dec(d.shares)) : "-"}</td>
                <td className="px-3 py-2 text-right tabular-nums money">{d.dps ? rs(dec(d.dps), 2) : "-"}</td>
                <td className="px-3 py-2 text-right tabular-nums money">{rs(dec(d.gross))}</td>
                <td className="px-3 py-2 text-right tabular-nums money text-muted-foreground">{rs(dec(d.wht))}</td>
                <td className="px-3 py-2 text-right tabular-nums money text-muted-foreground">{rs(dec(d.zakatDeducted))}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums money">{rs(dec(d.net))}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{d.affectsCash ? "Yes" : "No"}</td>
                <td className="px-3 py-1 text-right whitespace-nowrap">
                  <Link href={`/portfolios/${id}/dividends/${d.id}/edit`} className={buttonVariants({ size: "sm", variant: "ghost" })}>
                    Edit
                  </Link>
                  <ConfirmDelete action={deleteDividend.bind(null, id, d.id)} confirmText={`Delete this ${d.symbol} dividend?`} returnTo={here} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t bg-muted/30 font-medium">
            <tr>
              <td className="px-3 py-2" colSpan={4}>
                Total ({rows.length})
              </td>
              <td className="px-3 py-2 text-right tabular-nums money">{total("gross")}</td>
              <td className="px-3 py-2 text-right tabular-nums money">{total("wht")}</td>
              <td className="px-3 py-2 text-right tabular-nums money">{total("zakatDeducted")}</td>
              <td className="px-3 py-2 text-right tabular-nums money">{total("net")}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      <Explain>
        <p>
          <strong>Net</strong> = gross − tax withheld − zakat. Tax withheld defaults to {Number(DIVIDEND_WHT.filer) * 100}% for filers and{" "}
          {Number(DIVIDEND_WHT.non_filer) * 100}% for non-filers on the payment date; you can change it per dividend.
        </p>
        <p>Dividends are added to portfolio cash only if you tick &ldquo;Add to portfolio cash&rdquo;, since PSX pays most dividends to your bank.</p>
      </Explain>
    </div>
  );
}
