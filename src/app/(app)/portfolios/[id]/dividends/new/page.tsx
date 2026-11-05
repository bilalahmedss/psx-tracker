import type { Metadata } from "next";
import { Suspense } from "react";
import { FormSkeleton } from "@/components/skeleton";
import { defaultWhtRate } from "@/lib/engine/dividends";
import { statusOn } from "@/lib/engine/tax-status";
import { getPortfolioBook, getSecurityOptions, heldBySymbol } from "@/lib/portfolio/book";
import { pktParts } from "@/lib/psx/calendar";
import { DividendForm } from "../../dividend-form";
import { saveDividend } from "../../entry-actions";

export const metadata: Metadata = { title: "Add dividend" };

export default function NewDividendPage({ params, searchParams }: PageProps<"/portfolios/[id]/dividends/new">) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Suspense fallback={<FormSkeleton />}>
        <NewDividend params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function NewDividend({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [book, securities] = await Promise.all([getPortfolioBook(id), getSecurityOptions()]);
  const held = heldBySymbol(book);
  const symbol = typeof sp.symbol === "string" && securities.some((s) => s.symbol === sp.symbol) ? sp.symbol : "";
  const today = pktParts(new Date()).date;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Add dividend</h2>
      <DividendForm
        action={saveDividend.bind(null, id, null)}
        securities={securities}
        held={held}
        taxHistory={book.taxHistory}
        cancelHref={`/portfolios/${id}/dividends`}
        submitLabel="Save dividend"
        initial={{
          symbol,
          paidOn: today,
          shares: symbol && held[symbol] ? held[symbol] : "",
          dps: "",
          gross: "",
          whtPct: defaultWhtRate(statusOn(book.taxHistory, today)).mul(100).toFixed(),
          wht: "",
          zakat: "",
          affectsCash: false,
          note: "",
        }}
      />
    </div>
  );
}
