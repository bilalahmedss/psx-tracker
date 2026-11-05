import { describe, expect, it } from "vitest";
import {
  addDays,
  buildCalendar,
  hm,
  isTradingDay,
  marketStatus,
  pktParts,
  pktToDate,
  previousTradingDay,
  sessionProgress,
  type CalendarData,
} from "./calendar";

// Week of Thu 5 Nov 2026. Mon 9 Nov is Iqbal Day (to confirm).
const cal: CalendarData = buildCalendar(
  [{ date: "2026-11-09", name: "Iqbal Day", status: "to_confirm" }],
  [{ date: "2026-11-11", name: "Short day", sessions: [{ open: "09:30", close: "13:30" }], status: "confirmed" }],
);
const at = (iso: string) => new Date(iso);

describe("time helpers", () => {
  it("converts UTC instants to PKT (UTC+5)", () => {
    expect(pktParts(at("2026-11-05T04:30:00Z"))).toEqual({ date: "2026-11-05", minutes: hm("09:30"), weekday: 4 });
    // 19:30 UTC is 00:30 the next day in Pakistan
    expect(pktParts(at("2026-11-05T19:30:00Z"))).toEqual({ date: "2026-11-06", minutes: 30, weekday: 5 });
  });
  it("builds instants from PKT date + time", () => {
    expect(pktToDate("2026-11-05", hm("15:30")).toISOString()).toBe("2026-11-05T10:30:00.000Z");
  });
  it("parses HH:MM strictly", () => {
    expect(hm("09:15")).toBe(555);
    expect(() => hm("24:00")).toThrow();
    expect(() => hm("9:15")).toThrow();
  });
  it("adds days across month ends", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("marketStatus", () => {
  it("is open during a Mon-Thu session and reports the close", () => {
    const s = marketStatus(at("2026-11-05T05:00:00Z"), cal); // Thu 10:00 PKT
    expect(s.state).toBe("open");
    expect(s.reason).toBe("session");
    expect(s.nextChangeAt.toISOString()).toBe("2026-11-05T10:30:00.000Z"); // 15:30 PKT
    expect(s.toConfirm).toBe(false);
  });

  it("is closed before the open", () => {
    const s = marketStatus(at("2026-11-05T04:00:00Z"), cal); // Thu 09:00 PKT
    expect(s.state).toBe("closed");
    expect(s.reason).toBe("before_open");
    expect(s.nextChangeAt.toISOString()).toBe("2026-11-05T04:30:00.000Z");
  });

  it("closes exactly at 15:30 and next opens Friday 09:15", () => {
    const s = marketStatus(at("2026-11-05T10:30:00Z"), cal);
    expect(s.state).toBe("closed");
    expect(s.reason).toBe("after_close");
    expect(s.nextChangeAt.toISOString()).toBe("2026-11-06T04:15:00.000Z");
  });

  it("handles the Friday midday break, flagged to confirm", () => {
    const s = marketStatus(at("2026-11-06T07:30:00Z"), cal); // Fri 12:30 PKT
    expect(s.state).toBe("closed");
    expect(s.reason).toBe("break");
    expect(s.nextChangeAt.toISOString()).toBe("2026-11-06T09:30:00.000Z"); // 14:30 PKT
    expect(s.toConfirm).toBe(true);
    expect(marketStatus(at("2026-11-06T10:00:00Z"), cal).state).toBe("open"); // Fri 15:00 PKT
  });

  it("skips the weekend and a holiday when finding the next open", () => {
    const s = marketStatus(at("2026-11-06T11:31:00Z"), cal); // Fri 16:31 PKT
    expect(s.reason).toBe("after_close");
    expect(s.nextChangeAt.toISOString()).toBe("2026-11-10T04:30:00.000Z"); // Tue 09:30 (Mon is a holiday)
  });

  it("reports weekends", () => {
    const s = marketStatus(at("2026-11-07T06:00:00Z"), cal); // Sat
    expect(s.state).toBe("closed");
    expect(s.reason).toBe("weekend");
  });

  it("reports holidays by name and confirmation status", () => {
    const s = marketStatus(at("2026-11-09T06:00:00Z"), cal);
    expect(s.state).toBe("closed");
    expect(s.reason).toBe("holiday");
    expect(s.dayName).toBe("Iqbal Day");
    expect(s.toConfirm).toBe(true);
  });

  it("applies special-hours overrides", () => {
    expect(marketStatus(at("2026-11-11T08:00:00Z"), cal).state).toBe("open"); // 13:00 PKT
    const s = marketStatus(at("2026-11-11T08:45:00Z"), cal); // 13:45 PKT
    expect(s.reason).toBe("after_close");
    expect(s.dayName).toBe("Short day");
  });
});

describe("trading days", () => {
  it("knows weekends and holidays", () => {
    expect(isTradingDay("2026-11-06", cal)).toBe(true);
    expect(isTradingDay("2026-11-07", cal)).toBe(false);
    expect(isTradingDay("2026-11-09", cal)).toBe(false);
  });
  it("finds the previous trading day across a weekend and holiday", () => {
    expect(previousTradingDay("2026-11-10", cal)).toBe("2026-11-06");
    expect(previousTradingDay("2026-11-06", cal)).toBe("2026-11-05");
  });
});

describe("sessionProgress", () => {
  it("counts only trading minutes", () => {
    expect(sessionProgress("2026-11-05", hm("09:00"), cal)).toBe(0);
    expect(sessionProgress("2026-11-05", hm("12:30"), cal)).toBeCloseTo(0.5);
    expect(sessionProgress("2026-11-05", hm("16:00"), cal)).toBe(1);
    // Friday: 165 of 285 trading minutes done during the break
    expect(sessionProgress("2026-11-06", hm("13:00"), cal)).toBeCloseTo(165 / 285);
  });
});
