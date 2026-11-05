// When to refresh prices, and what the "Refresh prices" button and status line say.
// Pure functions: the prices job and the pages both call these with the stored state.

import { formatMinutes, getSchedule, lastCloseMinutes, marketStatus, previousTradingDay, pktParts, pktToDate, type CalendarData } from "./calendar";
import type { QuoteMode } from "./types";

export type RefreshScope = "holdings" | "all";
export type RefreshTrigger = "schedule" | "manual";

export type RefreshConfig = {
  /** Gap between scheduled refreshes (PRICE_REFRESH_MINUTES). */
  intervalMinutes: number;
  /** holdings: symbols someone holds or watches. all: every listed symbol. */
  scope: RefreshScope;
  /** Gap after any refresh before the button works again. */
  cooldownMinutes: number;
  /** End-of-day mode: first try for a day's closes this long after the close (EOD_PUBLISH_DELAY_MINUTES). */
  eodDelayMinutes: number;
};

export const COOLDOWN_MINUTES = 5;
/** Intraday modes: one more refresh within this many minutes after the close, for final prices. */
export const GRACE_MINUTES = 5;
export const DEFAULT_INTERVAL_MINUTES = 30;
export const DEFAULT_EOD_DELAY_MINUTES = 120;

function whole(name: string, raw: string | undefined, fallback: number, min: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) throw new Error(`${name} must be a whole number of at least ${min}, got "${raw}"`);
  return n;
}

export function readRefreshConfig(env: Record<string, string | undefined>): RefreshConfig {
  const scope = (env.PRICE_REFRESH_SCOPE ?? "").trim().toLowerCase() || "holdings";
  if (scope !== "holdings" && scope !== "all") throw new Error(`PRICE_REFRESH_SCOPE must be "holdings" or "all", got "${env.PRICE_REFRESH_SCOPE}"`);
  return {
    intervalMinutes: whole("PRICE_REFRESH_MINUTES", env.PRICE_REFRESH_MINUTES, DEFAULT_INTERVAL_MINUTES, 1),
    scope,
    cooldownMinutes: COOLDOWN_MINUTES,
    eodDelayMinutes: whole("EOD_PUBLISH_DELAY_MINUTES", env.EOD_PUBLISH_DELAY_MINUTES, DEFAULT_EOD_DELAY_MINUTES, 0),
  };
}

/** End-of-day mode: the latest trading day whose closes should be published by now. */
export function latestPublishedDay(now: Date, cal: CalendarData, delayMinutes: number): string {
  const { date, minutes } = pktParts(now);
  const close = lastCloseMinutes(date, cal);
  if (close !== null && minutes >= close + delayMinutes) return date;
  return previousTradingDay(date, cal);
}

export type RefreshState = {
  /** Last run that spent calls. */
  lastAttemptAt: Date | null;
  /** End-of-day mode: the day every tracked symbol has a close for. */
  dataDay: string | null;
};

export type RefreshInput = {
  trigger: RefreshTrigger;
  mode: QuoteMode;
  metered: boolean;
  now: Date;
  cal: CalendarData;
  config: RefreshConfig;
  state: RefreshState;
  /** Symbols in scope. */
  symbols: number;
  /** Calls one full refresh costs. */
  cost: number;
  /** Calls left today; null when the source is not metered. */
  remaining: number | null;
};

export type SkipCode = "no_symbols" | "closed" | "interval" | "cooldown" | "up_to_date" | "limit";
export type RefreshDecision =
  | { run: true; targetDay: string | null }
  | { run: false; code: SkipCode; message: string; retryAt?: Date };

export const LIMIT_MESSAGE = "Daily limit reached, showing last prices";

const hhmm = (d: Date) => formatMinutes(pktParts(d).minutes);

export function decideRefresh(i: RefreshInput): RefreshDecision {
  if (i.symbols === 0) return { run: false, code: "no_symbols", message: "No held or watched stocks to refresh" };
  const minutesSince = i.state.lastAttemptAt ? (i.now.getTime() - i.state.lastAttemptAt.getTime()) / 60_000 : Infinity;
  const wait = (code: "interval" | "cooldown", gap: number): RefreshDecision => {
    const retryAt = new Date(i.state.lastAttemptAt!.getTime() + gap * 60_000);
    return {
      run: false,
      code,
      retryAt,
      message: code === "cooldown" ? `Refreshed recently. Try again at ${hhmm(retryAt)}` : `Next scheduled refresh at ${hhmm(retryAt)}`,
    };
  };

  let targetDay: string | null = null;
  if (i.mode === "eod") {
    targetDay = latestPublishedDay(i.now, i.cal, i.config.eodDelayMinutes);
    if (i.state.dataDay && i.state.dataDay >= targetDay) {
      return { run: false, code: "up_to_date", message: `Up to date: closing prices for ${shortDay(targetDay)}` };
    }
    if (i.trigger === "manual" && minutesSince < i.config.cooldownMinutes) return wait("cooldown", i.config.cooldownMinutes);
    if (i.trigger === "schedule" && minutesSince < i.config.intervalMinutes) return wait("interval", i.config.intervalMinutes);
  } else if (i.trigger === "manual") {
    if (minutesSince < i.config.cooldownMinutes) return wait("cooldown", i.config.cooldownMinutes);
  } else {
    const { date, minutes } = pktParts(i.now);
    const close = getSchedule(date, i.cal).sessions.find((s) => minutes >= s.close && minutes < s.close + GRACE_MINUTES)?.close;
    const finalRun = close !== undefined && (!i.state.lastAttemptAt || i.state.lastAttemptAt < pktToDate(date, close));
    if (marketStatus(i.now, i.cal).state !== "open" && close === undefined) return { run: false, code: "closed", message: "Market closed" };
    if (!finalRun && minutesSince < i.config.intervalMinutes) return wait("interval", i.config.intervalMinutes);
  }

  if (i.metered && i.remaining !== null) {
    // Scheduled runs leave one full refresh for the button.
    const need = i.trigger === "schedule" ? i.cost * 2 : i.cost;
    if (i.remaining < need) {
      const message =
        i.trigger === "schedule" && i.remaining >= i.cost
          ? `Skipped: keeping the last ${i.remaining} calls today for a manual refresh`
          : LIMIT_MESSAGE;
      return { run: false, code: "limit", message };
    }
  }
  return { run: true, targetDay };
}

export type PriceStatusView = {
  /** e.g. "Updated 16:05 · delayed" */
  text: string;
  tone: "normal" | "stale" | "limit";
  canRefresh: boolean;
  /** Why the button is disabled, if it is. */
  hint: string | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function shortDay(date: string): string {
  return `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
}

/** The status line and button state for pages, from the same inputs as decideRefresh. */
export function priceStatusView(
  i: Omit<RefreshInput, "trigger"> & { sourceId: string; lastSuccessAt: Date | null },
): PriceStatusView {
  const manual = decideRefresh({ ...i, trigger: "manual" });
  const updated = i.lastSuccessAt ? `Updated ${hhmm(i.lastSuccessAt)}` : "Not updated yet";

  let suffix: string;
  let stale = false;
  if (i.sourceId === "demo") suffix = "Demo data";
  else if (i.mode === "eod") {
    suffix = i.state.dataDay ? `closing prices ${shortDay(i.state.dataDay)}` : "closing prices";
    const target = latestPublishedDay(i.now, i.cal, i.config.eodDelayMinutes);
    // More than one trading day behind what should be published.
    stale = !i.state.dataDay || i.state.dataDay < previousTradingDay(target, i.cal);
  } else {
    suffix = i.mode === "delayed" ? "delayed" : "live";
    stale =
      marketStatus(i.now, i.cal).state === "open" &&
      (!i.lastSuccessAt || i.now.getTime() - i.lastSuccessAt.getTime() > 2 * i.config.intervalMinutes * 60_000);
  }

  // Shown whenever one more refresh would not fit, even if prices are current.
  const limitReached = (!manual.run && manual.code === "limit") || (i.metered && i.remaining !== null && i.remaining < i.cost);
  if (limitReached) {
    return { text: LIMIT_MESSAGE, tone: "limit", canRefresh: false, hint: `${updated} · ${suffix}` };
  }
  return {
    text: `${updated} · ${suffix}${stale ? " · stale" : ""}`,
    tone: stale ? "stale" : "normal",
    canRefresh: manual.run,
    hint: manual.run ? null : manual.message,
  };
}
