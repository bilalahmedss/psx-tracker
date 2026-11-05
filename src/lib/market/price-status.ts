import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { configuredSourceId, readDailyLimit, usageDay, type QuoteMode } from "@/lib/psx";
import { priceStatusView, readRefreshConfig, type PriceStatusView } from "@/lib/psx/refresh-policy";
import { readQuoteMode } from "@/lib/psx/sources/eodhd";
import { getCalendar } from "./queries";

// The price status line and "Refresh prices" button state, read with the user's
// session (RLS applies). Only reads what the jobs stored; never calls a provider.

type StateRow = {
  source: string;
  quote_mode: QuoteMode;
  tracked_count: number;
  last_attempt_at: string | null;
  last_success_at: string | null;
  data_day: string | null;
};

export async function getPriceStatus(supabase: SupabaseClient, now = new Date()): Promise<PriceStatusView> {
  const sourceId = configuredSourceId();
  const metered = sourceId === "eodhd";
  const [{ cal }, stateRes, usageRes] = await Promise.all([
    getCalendar(supabase),
    supabase.from("market_data_state").select("source, quote_mode, tracked_count, last_attempt_at, last_success_at, data_day").eq("job", "prices").maybeSingle(),
    metered
      ? supabase.from("api_usage").select("calls").eq("provider", sourceId).eq("day", usageDay(now)).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (stateRes.error) throw new Error(`Could not load price status: ${stateRes.error.message}`);
  if (usageRes.error) throw new Error(`Could not load API usage: ${usageRes.error.message}`);

  const saved = stateRes.data as StateRow | null;
  const state = saved && saved.source === sourceId ? saved : null;
  const mode: QuoteMode = !metered ? "live" : readQuoteMode(process.env.EODHD_QUOTE_MODE) === "eod" ? "eod" : "delayed";
  const tracked = state?.tracked_count ?? 0;
  const used = (usageRes.data as { calls: number } | null)?.calls ?? 0;

  return priceStatusView({
    sourceId,
    mode,
    metered,
    now,
    cal,
    config: readRefreshConfig(process.env),
    state: { lastAttemptAt: state?.last_attempt_at ? new Date(state.last_attempt_at) : null, dataDay: state?.data_day ?? null },
    lastSuccessAt: state?.last_success_at ? new Date(state.last_success_at) : null,
    // Before the first run the count is unknown; assume one symbol so the button can start it.
    symbols: Math.max(tracked, 1),
    cost: metered ? Math.max(tracked, 1) : 0,
    remaining: metered ? Math.max(0, readDailyLimit(process.env.EODHD_DAILY_LIMIT) - used) : null,
  });
}
