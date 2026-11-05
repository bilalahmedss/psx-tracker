import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FormSkeleton } from "@/components/skeleton";
import { dec } from "@/lib/engine/money";
import { getPortfolioBook, getSecurityOptions, heldBySymbol } from "@/lib/portfolio/book";
import { DividendForm } from "../../../dividend-form";
import { saveDividend } from "../../../entry-actions";

export const metadata: Metadata = { title: "Edit dividend" };

export default function EditDividendPage({ params }: PageProps<"/portfolios/[id]/dividends/[dividendId]/edit">) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Suspense fallback={<FormSkeleton />}>
        <EditDividend params={params} />
      </Suspense>
    </div>
  );
}

async function EditDividend({ params }: { params: Promise<{ id: string; dividendId: string }> }) {
  const { id, dividendId } = await params;
  const [book, securities] = await Promise.all([getPortfolioBook(id), getSecurityOptions()]);
  const d = book.dividends.find((x) => x.id === dividendId);
  if (!d) notFound();
  const gross = dec(d.gross);
  const money = (v: string) => dec(v).toFixed(2);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Edit dividend</h2>
      <DividendForm
        key={`${d.id}:${d.net}:${d.paidOn}`}
        action={saveDividend.bind(null, id, dividendId)}
        securities={securities}
        held={heldBySymbol(book)}
        taxHistory={book.taxHistory}
        cancelHref={`/portfolios/${id}/dividends`}
        submitLabel="Save changes"
        editing
        initial={{
          symbol: d.symbol,
          paidOn: d.paidOn,
          shares: d.shares ? dec(d.shares).toFixed() : "",
          dps: d.dps ? dec(d.dps).toFixed() : "",
          gross: money(d.gross),
          whtPct: gross.isZero() ? "0" : dec(d.wht).div(gross).mul(100).toDecimalPlaces(4).toFixed(),
          wht: money(d.wht),
          zakat: dec(d.zakatDeducted).isZero() ? "" : money(d.zakatDeducted),
          affectsCash: d.affectsCash,
          note: d.note ?? "",
        }}
      />
    </div>
  );
}
