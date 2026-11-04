import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/skeleton";
import { requireUser } from "@/lib/auth";
import { listPortfolios } from "@/lib/portfolio/queries";
import { TAX_STATUS_LABEL } from "./labels";

export const metadata: Metadata = { title: "Portfolios" };

export default function PortfoliosPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Portfolios</h1>
          <p className="text-sm text-muted-foreground">Each portfolio has its own broker, tax status and fee settings.</p>
        </div>
        <Link href="/portfolios/new" className={buttonVariants()}>
          New portfolio
        </Link>
      </div>
      <Suspense
        fallback={
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading portfolios">
            <Skeleton className="h-44" />
            <Skeleton className="h-44" />
          </div>
        }
      >
        <PortfolioList />
      </Suspense>
    </div>
  );
}

async function PortfolioList() {
  const { supabase } = await requireUser();
  const portfolios = await listPortfolios(supabase);

  if (portfolios.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No portfolios yet</CardTitle>
          <CardDescription>
            Create one for each broker account or family member you track. PSX fee defaults are filled in for you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/portfolios/new" className={buttonVariants()}>
            Create your first portfolio
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {portfolios.map((p) => (
        <li key={p.id}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex min-w-0 items-center gap-2">
                <span className="truncate">{p.name}</span>
                {p.isDefault ? (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Default</span>
                ) : null}
              </CardTitle>
              <CardDescription>{p.brokerName ?? "No broker set"}</CardDescription>
              <CardAction>
                <Link
                  href={`/portfolios/${p.id}/edit`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  aria-label={`Edit ${p.name}`}
                >
                  Edit
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Tax status</dt>
                <dd>{TAX_STATUS_LABEL[p.taxStatus]}</dd>
                <dt className="text-muted-foreground">CGT rate</dt>
                <dd>{p.taxStatus === "filer" ? p.cgt.filerRate : p.cgt.nonFilerRate}%</dd>
                <dt className="text-muted-foreground">Commission</dt>
                <dd>
                  {p.fees.pctAbove}% at or above Rs {p.fees.threshold}; Rs {p.fees.perShareBelow}/share below
                </dd>
                <dt className="text-muted-foreground">Sales tax</dt>
                <dd>{p.fees.fedPct}% of commission</dd>
              </dl>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
