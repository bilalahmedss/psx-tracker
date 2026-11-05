import type { TaxStatus, TaxStatusPeriod } from "./types";

/**
 * Filer status in force on `date`: the latest period starting on or before it.
 * With no history, assume non-filer (the higher rate), so estimates err high.
 */
export function statusOn(history: TaxStatusPeriod[], date: string): TaxStatus {
  let best: TaxStatusPeriod | null = null;
  for (const h of history) {
    if (h.effectiveFrom <= date && (!best || h.effectiveFrom > best.effectiveFrom)) best = h;
  }
  if (best) return best.status;
  // Before the first recorded period: use the earliest one.
  const earliest = [...history].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
  return earliest?.status ?? "non_filer";
}
