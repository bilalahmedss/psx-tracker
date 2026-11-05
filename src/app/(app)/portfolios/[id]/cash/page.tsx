import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/skeleton";
import { formatDate } from "@/lib/format";
import { getPortfolioBook } from "@/lib/portfolio/book";
import { rs, signedRs, tone } from "@/lib/portfolio/display";
import { deleteCashEntry } from "../entry-actions";
import { LedgerTable, type LedgerRow } from "./ledger-table";

export const metadata: Metadata = { title: "Cash" };

const KIND_LABEL = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  adjustment: "Adjustment",
  deduction: "Deduction",
  buy: "Buy",
  sell: "Sell",
  dividend: "Dividend",
} as const;

export default function CashPage({ params }: PageProps<"/portfolios/[id]/cash">) {
  return (
    <Suspense fallback={<Skeleton className="h-72" />}>
      <Cash params={params} />
    </Suspense>
  );
}

async function Cash({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { result } = await getPortfolioBook(id);
  const ledger = result.ledger;
  const here = `/portfolios/${id}/cash`;

  const rows: LedgerRow[] = ledger.lines
    .map((l) => ({
      key: l.key,
      isoDate: l.date,
      date: formatDate(l.date),
      kind: KIND_LABEL[l.kind],
      description: l.description,
      amount: signedRs(l.amount),
      amountTone: tone(l.amount),
      balance: rs(l.balance),
      negativeBalance: l.balance.isNegative(),
      editHref: l.manual
        ? `/portfolios/${id}/cash/${l.refId}/edit`
        : l.kind === "dividend"
          ? `/portfolios/${id}/dividends/${l.refId}/edit`
          : `/portfolios/${id}/trades/${l.refId}/edit?returnTo=${encodeURIComponent(here)}`,
      deleteAction: l.manual ? deleteCashEntry.bind(null, id, l.refId) : null,
      manual: l.manual,
    }))
    .reverse(); // newest first

  return (
    <LedgerTable
      portfolioId={id}
      rows={rows}
      returnTo={here}
      summary={{ balance: rs(ledger.balance), negative: ledger.balance.isNegative(), totalIn: rs(ledger.totalIn), totalOut: rs(ledger.totalOut.abs()) }}
    />
  );
}
