import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FormSkeleton } from "@/components/skeleton";
import { dec } from "@/lib/engine/money";
import { getPortfolioBook } from "@/lib/portfolio/book";
import { CashForm } from "../../../cash-form";
import { saveCashEntry } from "../../../entry-actions";

export const metadata: Metadata = { title: "Edit cash entry" };

export default function EditCashEntryPage({ params }: PageProps<"/portfolios/[id]/cash/[entryId]/edit">) {
  return (
    <div className="mx-auto w-full max-w-xl">
      <Suspense fallback={<FormSkeleton />}>
        <EditCashEntry params={params} />
      </Suspense>
    </div>
  );
}

async function EditCashEntry({ params }: { params: Promise<{ id: string; entryId: string }> }) {
  const { id, entryId } = await params;
  const book = await getPortfolioBook(id);
  const e = book.cashEntries.find((x) => x.id === entryId);
  if (!e) notFound();
  const amount = dec(e.amount);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Edit cash entry</h2>
      <CashForm
        key={`${e.id}:${e.amount}:${e.date}`}
        action={saveCashEntry.bind(null, id, entryId)}
        cancelHref={`/portfolios/${id}/cash`}
        submitLabel="Save changes"
        initial={{ type: e.type, direction: amount.isNegative() ? "out" : "in", amount: amount.abs().toFixed(2), date: e.date, note: e.note ?? "" }}
      />
    </div>
  );
}
