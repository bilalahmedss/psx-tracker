import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FormSkeleton } from "@/components/skeleton";
import { dec } from "@/lib/engine/money";
import { feeProfileOf, getPortfolioBook, getSecurityOptions, heldBySymbol } from "@/lib/portfolio/book";
import { saveTrade } from "../../../entry-actions";
import { TradeForm } from "../../../trade-form";

export const metadata: Metadata = { title: "Edit trade" };

export default function EditTradePage({ params, searchParams }: PageProps<"/portfolios/[id]/trades/[txnId]/edit">) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Suspense fallback={<FormSkeleton />}>
        <EditTrade params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function EditTrade({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; txnId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id, txnId }, sp] = await Promise.all([params, searchParams]);
  const [book, securities] = await Promise.all([getPortfolioBook(id), getSecurityOptions()]);
  const t = book.txns.find((x) => x.id === txnId);
  if (!t) notFound();
  const returnTo = typeof sp.returnTo === "string" && sp.returnTo.startsWith(`/portfolios/${id}`) ? sp.returnTo : `/portfolios/${id}/history`;
  const money = (v: string) => dec(v).toFixed(2);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Edit trade</h2>
      <TradeForm
        key={`${t.id}:${t.createdAt}:${t.qty}:${t.price}:${t.fee}`}
        action={saveTrade.bind(null, id, txnId)}
        returnTo={returnTo}
        securities={securities}
        feeProfile={feeProfileOf(book)}
        held={heldBySymbol(book)}
        cancelHref={returnTo}
        submitLabel="Save changes"
        feesStartEdited
        initial={{
          type: t.type,
          symbol: t.symbol,
          qty: dec(t.qty).toFixed(),
          price: dec(t.price).toFixed(),
          tradeDate: t.tradeDate,
          fee: money(t.fee),
          tax: money(t.tax),
          otherCharges: dec(t.otherCharges).isZero() ? "" : money(t.otherCharges),
          affectsCash: t.affectsCash,
          note: t.note ?? "",
        }}
      />
    </div>
  );
}
