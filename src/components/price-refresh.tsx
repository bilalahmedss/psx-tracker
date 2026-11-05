import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { getPriceStatus } from "@/lib/market/price-status";
import { RefreshPricesButton } from "./refresh-prices-button";

const TONE = {
  normal: "text-muted-foreground",
  stale: "text-amber-700 dark:text-amber-400",
  limit: "text-amber-700 dark:text-amber-400",
} as const;

/** "Updated HH:MM · delayed" plus the Refresh prices button. Reads the session, so it streams in. */
export function PriceRefresh() {
  return (
    <Suspense fallback={<div className="h-8" aria-hidden />}>
      <PriceRefreshInner />
    </Suspense>
  );
}

async function PriceRefreshInner() {
  const { supabase } = await requireUser();
  const status = await getPriceStatus(supabase);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p className={`text-xs ${TONE[status.tone]}`}>
        {status.text}
        {status.tone === "limit" && status.hint ? <span className="text-muted-foreground"> ({status.hint})</span> : null}
      </p>
      <RefreshPricesButton canRefresh={status.canRefresh} hint={status.tone === "limit" ? null : status.hint} />
    </div>
  );
}
