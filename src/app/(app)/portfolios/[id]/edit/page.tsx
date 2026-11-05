import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FormSkeleton } from "@/components/skeleton";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { pktParts } from "@/lib/psx/calendar";
import { getFormOptions, getPortfolio, type TaxStatusChange } from "@/lib/portfolio/queries";
import { PortfolioForm } from "../../portfolio-form";
import { DeletePortfolio } from "../../delete-portfolio";
import { deletePortfolio, deleteTaxStatusChange, updatePortfolio } from "../../actions";
import { TAX_STATUS_LABEL } from "../../labels";

export const metadata: Metadata = { title: "Edit portfolio" };

const FROM_THE_START = "1900-01-01";

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
        // Remount with fresh values whenever the saved portfolio or its status history changes.
        key={`${portfolio.updatedAt}:${portfolio.taxHistory.map((h) => h.id).join(",")}`}
        action={updatePortfolio.bind(null, portfolio.id)}
        submitLabel="Save changes"
        brokers={brokers}
        defaults={defaults}
        currentStatus={portfolio.taxStatus}
        initial={{
          name: portfolio.name,
          brokerId: portfolio.brokerId ?? "",
          taxStatus: portfolio.taxStatus,
          statusEffectiveFrom: pktParts(new Date()).date,
          isDefault: portfolio.isDefault,
          nonFilerRate: portfolio.cgt.nonFilerRate,
          ...portfolio.fees,
        }}
        taxHistory={<TaxHistory portfolioId={portfolio.id} history={portfolio.taxHistory} />}
      />
      <DeletePortfolio name={portfolio.name} action={deletePortfolio.bind(null, portfolio.id)} />
    </>
  );
}

function TaxHistory({ portfolioId, history }: { portfolioId: string; history: TaxStatusChange[] }) {
  if (history.length === 0) return null;
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">Status history</p>
      <ul className="divide-y rounded-lg border text-sm">
        {history.map((h) => (
          <li key={h.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <span>
              <span className="font-medium">{TAX_STATUS_LABEL[h.status]}</span>{" "}
              <span className="text-muted-foreground">
                {h.effectiveFrom === FROM_THE_START ? "from the start" : `from ${formatDate(h.effectiveFrom)}`}
              </span>
            </span>
            {h.effectiveFrom === FROM_THE_START ? null : (
              // Inside the main form, so this uses formAction instead of a nested form.
              <Button type="submit" variant="ghost" size="sm" formAction={deleteTaxStatusChange.bind(null, portfolioId, h.id)} formNoValidate>
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
