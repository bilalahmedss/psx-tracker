import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCalendar, type CalendarData, type HolidayRow, type SessionOverrideRow } from "@/lib/psx/calendar";

// User-facing market reads: supabase-js with the user's session (RLS applies).
// Never calls a provider; only reads what the jobs stored.

export type QuoteRow = {
  symbol: string;
  name: string;
  sector: string | null;
  isShariah: boolean;
  price: string;
  change: string | null;
  changePct: string | null;
  high: string | null;
  low: string | null;
  volume: number | null;
  asOf: string;
  source: string;
  delayed: boolean;
  endOfDay: boolean;
};

type Row = {
  symbol: string;
  price: string;
  change: string | null;
  change_pct: string | null;
  high: string | null;
  low: string | null;
  volume: number | null;
  as_of: string;
  source: string;
  delayed: boolean;
  end_of_day: boolean;
  securities: { name: string; sector: string | null; is_shariah: boolean } | null;
};

export async function getLatestQuotes(supabase: SupabaseClient): Promise<QuoteRow[]> {
  const { data, error } = await supabase
    .from("prices_latest")
    .select("symbol, price, change, change_pct, high, low, volume, as_of, source, delayed, end_of_day, securities(name, sector, is_shariah)")
    .order("symbol")
    .overrideTypes<Row[], { merge: false }>();
  if (error) throw new Error(`Could not load prices: ${error.message}`);
  return data.map((r) => ({
    symbol: r.symbol,
    name: r.securities?.name ?? r.symbol,
    sector: r.securities?.sector ?? null,
    isShariah: r.securities?.is_shariah ?? false,
    price: r.price,
    change: r.change,
    changePct: r.change_pct,
    high: r.high,
    low: r.low,
    volume: r.volume,
    asOf: r.as_of,
    source: r.source,
    delayed: r.delayed,
    endOfDay: r.end_of_day,
  }));
}

export async function getCalendar(supabase: SupabaseClient): Promise<{ cal: CalendarData; holidays: HolidayRow[] }> {
  const [h, s] = await Promise.all([
    supabase.from("market_holidays").select("date, name, status").order("date"),
    supabase.from("market_sessions").select("date, name, sessions, status").order("date"),
  ]);
  if (h.error) throw new Error(`Could not load holidays: ${h.error.message}`);
  if (s.error) throw new Error(`Could not load market sessions: ${s.error.message}`);
  const holidays = h.data as HolidayRow[];
  return { cal: buildCalendar(holidays, s.data as SessionOverrideRow[]), holidays };
}

export type JobRunRow = { job: string; status: string; started_at: string; finished_at: string | null; rows: number | null; message: string | null };

export async function getLastRuns(supabase: SupabaseClient): Promise<Record<string, JobRunRow | undefined>> {
  const { data, error } = await supabase
    .from("job_runs")
    .select("job, status, started_at, finished_at, rows, message")
    .order("started_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`Could not load job runs: ${error.message}`);
  const out: Record<string, JobRunRow | undefined> = {};
  for (const r of data as JobRunRow[]) out[r.job] ??= r;
  return out;
}
