import type { Metadata } from "next";
import { Suspense } from "react";
import { FormSkeleton } from "@/components/skeleton";
import { requireUser } from "@/lib/auth";
import { getFormOptions } from "@/lib/portfolio/queries";
import { PortfolioForm } from "../portfolio-form";
import { createPortfolio } from "../actions";

export const metadata: Metadata = { title: "New portfolio" };

export default function NewPortfolioPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New portfolio</h1>
        <p className="text-sm text-muted-foreground">
          PSX defaults are filled in. Change anything that differs on your broker&apos;s contract notes.
        </p>
      </div>
      <Suspense fallback={<FormSkeleton />}>
        <NewPortfolioForm />
      </Suspense>
    </div>
  );
}

async function NewPortfolioForm() {
  const { supabase } = await requireUser();
  const { brokers, defaults } = await getFormOptions(supabase);
  return (
    <PortfolioForm
      action={createPortfolio}
      submitLabel="Create portfolio"
      brokers={brokers}
      defaults={defaults}
      initial={{ name: "", brokerId: "", taxStatus: "filer", isDefault: false, ...defaults.cgt, ...defaults.fees }}
    />
  );
}
