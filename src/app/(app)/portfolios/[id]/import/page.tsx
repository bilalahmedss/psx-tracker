import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/skeleton";
import { requireUser } from "@/lib/auth";
import { ImportFlow } from "./import-flow";

export const metadata: Metadata = { title: "Import CSV" };

export default function ImportPage({ params }: PageProps<"/portfolios/[id]/import">) {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <Suspense fallback={<Skeleton className="h-48" />}>
        <Import params={params} />
      </Suspense>
    </div>
  );
}

async function Import({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Import from CSV</h2>
      <ImportFlow portfolioId={id} />
    </div>
  );
}
