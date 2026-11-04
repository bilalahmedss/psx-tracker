import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FormSkeleton } from "@/components/skeleton";
import { requireUser } from "@/lib/auth";
import { getFormOptions, getPortfolio } from "@/lib/portfolio/queries";
import { PortfolioForm } from "../../portfolio-form";
import { DeletePortfolio } from "../../delete-portfolio";
import { deletePortfolio, updatePortfolio } from "../../actions";

export const metadata: Metadata = { title: "Edit portfolio" };

export default function EditPortfolioPage({ params }: PageProps<"/portfolios/[id]/edit">) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Suspense fallback={<FormSkeleton />}>
        <EditPortfolio params={params} />
      </Suspense>
    </div>
  );
}

async function EditPortfolio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const [portfolio, { brokers, defaults }] = await Promise.all([getPortfolio(supabase, id), getFormOptions(supabase)]);
  if (!portfolio) notFound();

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Edit {portfolio.name}</h1>
        <p className="text-sm text-muted-foreground">Changes apply to this portfolio only.</p>
      </div>
      <PortfolioForm
        // Remount with fresh values whenever the saved portfolio changes.
        key={portfolio.updatedAt}
        action={updatePortfolio.bind(null, portfolio.id)}
        submitLabel="Save changes"
        brokers={brokers}
        defaults={defaults}
        initial={{
          name: portfolio.name,
          brokerId: portfolio.brokerId ?? "",
          taxStatus: portfolio.taxStatus,
          isDefault: portfolio.isDefault,
          ...portfolio.cgt,
          ...portfolio.fees,
        }}
      />
      <DeletePortfolio name={portfolio.name} action={deletePortfolio.bind(null, portfolio.id)} />
    </>
  );
}
