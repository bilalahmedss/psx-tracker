import type { Metadata } from "next";
import { Suspense } from "react";
import { FormSkeleton } from "@/components/skeleton";
import { requireUser } from "@/lib/auth";
import { pktParts } from "@/lib/psx/calendar";
import { CashForm } from "../../cash-form";
import { saveCashEntry } from "../../entry-actions";

export const metadata: Metadata = { title: "Cash entry" };

export default function NewCashEntryPage({ params }: PageProps<"/portfolios/[id]/cash/new">) {
  return (
    <div className="mx-auto w-full max-w-xl">
      <Suspense fallback={<FormSkeleton />}>
        <NewCashEntry params={params} />
      </Suspense>
    </div>
  );
}

async function NewCashEntry({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Verifies the session and marks this render as request-time (it reads today's date).
  await requireUser();
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Add cash entry</h2>
      <CashForm
        action={saveCashEntry.bind(null, id, null)}
        cancelHref={`/portfolios/${id}/cash`}
        submitLabel="Save entry"
        initial={{ type: "deposit", direction: "in", amount: "", date: pktParts(new Date()).date, note: "" }}
      />
    </div>
  );
}
