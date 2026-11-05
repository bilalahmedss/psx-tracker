import type { Metadata } from "next";
import { Suspense } from "react";
import { FormSkeleton } from "@/components/skeleton";
import { cashContextOf, feeProfileOf, getPortfolioBook, getSecurityOptions, heldBySymbol } from "@/lib/portfolio/book";
import { pktParts } from "@/lib/psx/calendar";
import { saveTrade } from "../../entry-actions";
import { TradeForm } from "../../trade-form";

export const metadata: Metadata = { title: "Add trade" };

export default function NewTradePage({ params, searchParams }: PageProps<"/portfolios/[id]/trades/new">) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Suspense fallback={<FormSkeleton />}>
        <NewTrade params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function NewTrade({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [book, securities] = await Promise.all([getPortfolioBook(id), getSecurityOptions()]);
  const type = sp.type === "sell" ? "sell" : "buy";
  const symbol = typeof sp.symbol === "string" ? sp.symbol.toUpperCase() : "";
  const held = heldBySymbol(book);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Add trade</h2>
      <TradeForm
        action={saveTrade.bind(null, id, null)}
        securities={securities}
        feeProfile={feeProfileOf(book)}
        cash={cashContextOf(book)}
        held={held}
        cancelHref={symbol ? `/portfolios/${id}/holdings/${encodeURIComponent(symbol)}` : `/portfolios/${id}`}
        submitLabel={type === "buy" ? "Save buy" : "Save sell"}
        initial={{
          type,
          symbol: securities.some((s) => s.symbol === symbol) ? symbol : "",
          qty: type === "sell" && held[symbol] ? held[symbol] : "",
          price: "",
          tradeDate: pktParts(new Date()).date,
          fee: "",
          tax: "",
          otherCharges: "",
          affectsCash: true,
          note: "",
        }}
      />
    </div>
  );
}
