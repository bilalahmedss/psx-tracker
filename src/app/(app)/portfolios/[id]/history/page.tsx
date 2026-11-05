import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/skeleton";
import { txnCashValue } from "@/lib/engine/fifo";
import { dec } from "@/lib/engine/money";
import { formatDate } from "@/lib/format";
import { getPortfolioBook } from "@/lib/portfolio/book";
import { rs, shares } from "@/lib/portfolio/display";
import { deleteTrade } from "../entry-actions";
import { HistoryTable, type HistoryRow } from "./history-table";

export const metadata: Metadata = { title: "History" };

export default function HistoryPage({ params }: PageProps<"/portfolios/[id]/history">) {
  return (
    <Suspense fallback={<Skeleton className="h-72" />}>
      <History params={params} />
    </Suspense>
  );
}

async function History({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { txns } = await getPortfolioBook(id);
  const here = `/portfolios/${id}/history`;

  const rows: HistoryRow[] = [...txns]
    .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate) || b.createdAt.localeCompare(a.createdAt))
    .map((t) => ({
      id: t.id,
      date: formatDate(t.tradeDate),
      type: t.type,
      symbol: t.symbol,
      qty: shares(dec(t.qty)),
      price: rs(dec(t.price)),
      charges: rs(dec(t.fee).plus(t.tax).plus(t.otherCharges)),
      amount: `${t.type === "buy" ? "−" : "+"}${rs(txnCashValue(t))}`,
      affectsCash: t.affectsCash,
      note: t.note,
      editHref: `/portfolios/${id}/trades/${t.id}/edit?returnTo=${encodeURIComponent(here)}`,
      deleteAction: deleteTrade.bind(null, id, t.id),
    }));

  return <HistoryTable rows={rows} returnTo={here} />;
}
