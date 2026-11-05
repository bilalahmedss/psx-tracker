import type { Metadata } from "next";
import { Suspense } from "react";
import { FormSkeleton } from "@/components/skeleton";
import { requireUser } from "@/lib/auth";
import { preferredBroker } from "@/lib/portfolio/broker-default";
import { getFormOptions, listPortfolios } from "@/lib/portfolio/queries";
import { PortfolioForm } from "../portfolio-form";
import { createPortfolio } from "../actions";

export const metadata: Metadata = { title: "New portfolio" };

export default function NewPortfolioPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New portfolio</h1>
        <p className="text-sm text-muted-foreground">
          Your broker&apos;s fees are filled in. Change anything that differs on your contract notes.
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
  const [{ brokers, defaults }, mine] = await Promise.all([getFormOptions(supabase), listPortfolios(supabase)]);
  // Default portfolio first, then newest first.
  const ordered = [...mine.filter((p) => p.isDefault), ...mine.filter((p) => !p.isDefault).reverse()];
  const broker = preferredBroker(brokers, ordered.map((p) => p.brokerName));
  return (
    <PortfolioForm
      action={createPortfolio}
      submitLabel="Create portfolio"
      brokers={brokers}
      defaults={defaults}
      initial={{
        name: "",
        brokerId: broker?.id ?? "",
        taxStatus: "filer",
        statusEffectiveFrom: "",
        isDefault: false,
        nonFilerRate: defaults.cgt.nonFilerRate,
        ...(broker?.fees ?? defaults.fees),
      }}
    />
  );
}
