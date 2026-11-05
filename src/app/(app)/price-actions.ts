"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";

export type RefreshResult = { ok: boolean; message: string };

/**
 * The "Refresh prices" button. Asks the prices job to run with trigger=manual; the
 * job applies the 5-minute cooldown and the daily call limit, so the browser never
 * reaches a provider and user code never touches the privileged database client.
 */
export async function refreshPricesNow(): Promise<RefreshResult> {
  await requireUser();
  const secret = process.env.CRON_SECRET;
  // A fixed, configured origin: never build it from request headers, or the secret could be sent elsewhere.
  const base = process.env.JOBS_BASE_URL ?? "http://localhost:3000";
  if (!secret) return { ok: false, message: "Price refresh is not configured (CRON_SECRET)." };

  let body: { status?: string; rows?: number; message?: string; error?: string };
  try {
    const res = await fetch(`${base}/api/jobs/prices?trigger=manual`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    body = await res.json().catch(() => ({}));
  } catch {
    return { ok: false, message: "Could not reach the price job. Try again shortly." };
  }

  revalidatePath("/", "layout");
  if (body.status === "success") {
    if (body.message?.includes("not published yet")) return { ok: true, message: `${body.message}. Showing the last closes.` };
    return { ok: true, message: body.rows ? "Prices refreshed." : "Already up to date." };
  }
  if (body.status === "locked") return { ok: false, message: "A refresh is already running." };
  if (body.status === "failed") return { ok: false, message: "The refresh failed. The last prices are still shown." };
  return { ok: false, message: body.message ?? body.error ?? "Nothing to refresh." };
}
