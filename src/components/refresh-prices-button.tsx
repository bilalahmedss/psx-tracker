"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { refreshPricesNow } from "@/app/(app)/price-actions";
import { Button } from "@/components/ui/button";

export function RefreshPricesButton({ canRefresh, hint }: { canRefresh: boolean; hint: string | null }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!canRefresh || pending}
        title={hint ?? undefined}
        onClick={() =>
          start(async () => {
            const r = await refreshPricesNow();
            setResult(r.message);
          })
        }
      >
        <RefreshCw className={pending ? "animate-spin" : undefined} aria-hidden />
        {pending ? "Refreshing…" : "Refresh prices"}
      </Button>
      <span role="status" className="text-xs text-muted-foreground">
        {result ?? (!canRefresh && hint ? hint : null)}
      </span>
    </div>
  );
}
