import { describe, expect, it } from "vitest";
import { buildCalendar, pktToDate } from "./calendar";
import { decideRefresh, latestPublishedDay, priceStatusView, readRefreshConfig, shortDay, type RefreshInput } from "./refresh-policy";

const cal = buildCalendar([{ date: "2026-11-09", name: "Iqbal Day", status: "confirmed" }]);
const config = readRefreshConfig({});
// 5 Nov 2026 is a Thursday: one session 09:30-15:30 PKT.
const pkt = (date: string, time: string) => pktToDate(date, Number(time.slice(0, 2)) * 60 + Number(time.slice(3)));

function input(over: Partial<RefreshInput> = {}): RefreshInput {
  return {
    trigger: "schedule",
    mode: "eod",
    metered: true,
    now: pkt("2026-11-05", "18:00"),
    cal,
    config,
    state: { lastAttemptAt: null, dataDay: "2026-11-04" },
    symbols: 5,
    cost: 5,
    remaining: 15,
    ...over,
  };
}

describe("readRefreshConfig", () => {
  it("uses the defaults: 30 minutes, holdings, 5-minute cooldown, try closes 2 hours after the close", () => {
    expect(config).toEqual({ intervalMinutes: 30, scope: "holdings", cooldownMinutes: 5, eodDelayMinutes: 120 });
  });
  it("reads overrides and rejects bad values", () => {
    expect(readRefreshConfig({ PRICE_REFRESH_MINUTES: "150", PRICE_REFRESH_SCOPE: "ALL" })).toMatchObject({ intervalMinutes: 150, scope: "all" });
    expect(() => readRefreshConfig({ PRICE_REFRESH_MINUTES: "0" })).toThrow(/PRICE_REFRESH_MINUTES/);
    expect(() => readRefreshConfig({ PRICE_REFRESH_SCOPE: "watchlist" })).toThrow(/PRICE_REFRESH_SCOPE/);
  });
});

describe("latestPublishedDay", () => {
  it("is today only once the publish delay after the close has passed", () => {
    expect(latestPublishedDay(pkt("2026-11-05", "17:29"), cal, 120)).toBe("2026-11-04");
    expect(latestPublishedDay(pkt("2026-11-05", "17:30"), cal, 120)).toBe("2026-11-05");
  });
  it("skips weekends and holidays", () => {
    // Monday 9 Nov is a holiday, so on Monday and early Tuesday the latest day is Friday 6 Nov.
    expect(latestPublishedDay(pkt("2026-11-08", "12:00"), cal, 120)).toBe("2026-11-06");
    expect(latestPublishedDay(pkt("2026-11-09", "20:00"), cal, 120)).toBe("2026-11-06");
    expect(latestPublishedDay(pkt("2026-11-10", "09:00"), cal, 120)).toBe("2026-11-06");
  });
  it("uses the last session's close on Fridays", () => {
    expect(latestPublishedDay(pkt("2026-11-06", "18:00"), cal, 120)).toBe("2026-11-05");
    expect(latestPublishedDay(pkt("2026-11-06", "18:30"), cal, 120)).toBe("2026-11-06");
  });
});

describe("decideRefresh, end-of-day mode (free plan)", () => {
  it("fetches the day's closes once they should be published", () => {
    expect(decideRefresh(input())).toEqual({ run: true, targetDay: "2026-11-05" });
  });
  it("does nothing, and spends nothing, when the closes are already in", () => {
    expect(decideRefresh(input({ state: { lastAttemptAt: null, dataDay: "2026-11-05" } }))).toMatchObject({ run: false, code: "up_to_date" });
    // During market hours the latest published day is yesterday.
    expect(decideRefresh(input({ now: pkt("2026-11-05", "11:00") }))).toMatchObject({ run: false, code: "up_to_date" });
  });
  it("retries every interval while the closes are not out yet", () => {
    const state = { lastAttemptAt: pkt("2026-11-05", "17:40"), dataDay: "2026-11-04" };
    expect(decideRefresh(input({ state, now: pkt("2026-11-05", "18:05") }))).toMatchObject({ run: false, code: "interval", message: "Next scheduled refresh at 18:10" });
    expect(decideRefresh(input({ state, now: pkt("2026-11-05", "18:10") }))).toMatchObject({ run: true });
  });
  it("lets the button retry after the 5-minute cooldown", () => {
    const state = { lastAttemptAt: pkt("2026-11-05", "17:40"), dataDay: "2026-11-04" };
    expect(decideRefresh(input({ trigger: "manual", state, now: pkt("2026-11-05", "17:43") }))).toMatchObject({
      run: false,
      code: "cooldown",
      message: "Refreshed recently. Try again at 17:45",
    });
    expect(decideRefresh(input({ trigger: "manual", state, now: pkt("2026-11-05", "17:45") }))).toMatchObject({ run: true });
  });
  it("starts at once when nothing has been fetched yet", () => {
    expect(decideRefresh(input({ state: { lastAttemptAt: null, dataDay: null }, now: pkt("2026-11-05", "11:00") }))).toEqual({ run: true, targetDay: "2026-11-04" });
  });
});

describe("decideRefresh, daily limit", () => {
  it("scheduled runs keep one full refresh for the button", () => {
    expect(decideRefresh(input({ remaining: 10 }))).toMatchObject({ run: true });
    expect(decideRefresh(input({ remaining: 9 }))).toMatchObject({ run: false, code: "limit", message: "Skipped: keeping the last 9 calls today for a manual refresh" });
    expect(decideRefresh(input({ trigger: "manual", remaining: 5 }))).toMatchObject({ run: true });
  });
  it("stops everything when one refresh no longer fits", () => {
    expect(decideRefresh(input({ remaining: 4 }))).toMatchObject({ run: false, code: "limit", message: "Daily limit reached, showing last prices" });
    expect(decideRefresh(input({ trigger: "manual", remaining: 4 }))).toMatchObject({ run: false, code: "limit" });
  });
  it("ignores the budget for unmetered sources", () => {
    expect(decideRefresh(input({ metered: false, remaining: null }))).toMatchObject({ run: true });
  });
  it("has nothing to do with no held or watched stocks", () => {
    expect(decideRefresh(input({ symbols: 0, cost: 0 }))).toMatchObject({ run: false, code: "no_symbols" });
  });
});

describe("decideRefresh, intraday modes (paid plan or demo)", () => {
  const live = (over: Partial<RefreshInput>) => input({ mode: "delayed", state: { lastAttemptAt: null, dataDay: null }, remaining: 100, ...over });
  it("runs only in market hours", () => {
    expect(decideRefresh(live({ now: pkt("2026-11-05", "09:00") }))).toMatchObject({ run: false, code: "closed" });
    expect(decideRefresh(live({ now: pkt("2026-11-05", "10:00") }))).toMatchObject({ run: true, targetDay: null });
    expect(decideRefresh(live({ now: pkt("2026-11-07", "10:00") }))).toMatchObject({ run: false, code: "closed" });
  });
  it("waits PRICE_REFRESH_MINUTES between scheduled runs", () => {
    const state = { lastAttemptAt: pkt("2026-11-05", "10:00"), dataDay: null };
    expect(decideRefresh(live({ state, now: pkt("2026-11-05", "10:29") }))).toMatchObject({ code: "interval" });
    expect(decideRefresh(live({ state, now: pkt("2026-11-05", "10:30") }))).toMatchObject({ run: true });
  });
  it("takes one final refresh just after the close, even inside the interval", () => {
    const state = { lastAttemptAt: pkt("2026-11-05", "15:20"), dataDay: null };
    expect(decideRefresh(live({ state, now: pkt("2026-11-05", "15:31") }))).toMatchObject({ run: true });
    const after = { lastAttemptAt: pkt("2026-11-05", "15:31"), dataDay: null };
    expect(decideRefresh(live({ state: after, now: pkt("2026-11-05", "15:33") }))).toMatchObject({ code: "interval" });
    expect(decideRefresh(live({ state: after, now: pkt("2026-11-05", "15:36") }))).toMatchObject({ code: "closed" });
  });
  it("lets the button run outside market hours after the cooldown", () => {
    const state = { lastAttemptAt: pkt("2026-11-05", "17:00"), dataDay: null };
    expect(decideRefresh(live({ trigger: "manual", state, now: pkt("2026-11-05", "17:04") }))).toMatchObject({ code: "cooldown" });
    expect(decideRefresh(live({ trigger: "manual", state, now: pkt("2026-11-05", "17:05") }))).toMatchObject({ run: true });
  });
});

describe("priceStatusView", () => {
  const view = (over: Partial<Parameters<typeof priceStatusView>[0]>) =>
    priceStatusView({ ...input(), sourceId: "eodhd", lastSuccessAt: pkt("2026-11-05", "16:05"), ...over });

  it("shows the update time and the closing day in end-of-day mode", () => {
    const v = view({ state: { lastAttemptAt: pkt("2026-11-05", "17:30"), dataDay: "2026-11-05" } });
    expect(v).toEqual({ text: "Updated 16:05 · closing prices 5 Nov", tone: "normal", canRefresh: false, hint: "Up to date: closing prices for 5 Nov" });
  });
  it("offers the button when newer closes should be out", () => {
    expect(view({})).toMatchObject({ text: "Updated 16:05 · closing prices 4 Nov", canRefresh: true, hint: null });
  });
  it("marks prices stale when more than a trading day behind", () => {
    expect(view({ state: { lastAttemptAt: null, dataDay: "2026-11-03" } })).toMatchObject({ text: "Updated 16:05 · closing prices 3 Nov · stale", tone: "stale" });
  });
  it("says the daily limit is reached and disables the button", () => {
    expect(view({ remaining: 2 })).toEqual({
      text: "Daily limit reached, showing last prices",
      tone: "limit",
      canRefresh: false,
      hint: "Updated 16:05 · closing prices 4 Nov",
    });
  });
  it("shows the limit even when prices are current", () => {
    const v = view({ remaining: 4, state: { lastAttemptAt: null, dataDay: "2026-11-05" } });
    expect(v).toMatchObject({ text: "Daily limit reached, showing last prices", tone: "limit", canRefresh: false });
  });

  it("labels delayed quotes", () => {
    const v = view({ mode: "delayed", now: pkt("2026-11-05", "11:00"), lastSuccessAt: pkt("2026-11-05", "10:45"), state: { lastAttemptAt: pkt("2026-11-05", "10:45"), dataDay: null } });
    expect(v).toMatchObject({ text: "Updated 10:45 · delayed", canRefresh: true });
    const late = view({ mode: "delayed", now: pkt("2026-11-05", "12:00"), lastSuccessAt: pkt("2026-11-05", "10:45"), state: { lastAttemptAt: pkt("2026-11-05", "10:45"), dataDay: null } });
    expect(late.text).toBe("Updated 10:45 · delayed · stale");
  });
  it("labels demo data", () => {
    expect(view({ sourceId: "demo", mode: "live", metered: false, remaining: null, lastSuccessAt: null }).text).toBe("Not updated yet · Demo data");
  });
  it("formats short days", () => {
    expect(shortDay("2026-01-09")).toBe("9 Jan");
  });
});
