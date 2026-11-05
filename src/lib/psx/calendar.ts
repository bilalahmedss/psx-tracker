// PSX market calendar. Pure functions: holiday and special-hours data is passed in
// (loaded from market_holidays / market_sessions), so everything is unit-testable.
//
// All PSX times are Pakistan Standard Time (UTC+5, no daylight saving).

export const PKT_OFFSET_MINUTES = 5 * 60;

export type CalendarStatus = "confirmed" | "to_confirm";

/** A trading session in minutes since PKT midnight, [open, close). */
export type Session = { open: number; close: number };

export type HolidayRow = { date: string; name: string; status: CalendarStatus };
export type SessionOverrideRow = {
  date: string;
  name: string;
  sessions: { open: string; close: string }[];
  status: CalendarStatus;
};

export type CalendarData = {
  holidays: Map<string, HolidayRow>;
  overrides: Map<string, SessionOverrideRow>;
};

export function buildCalendar(holidays: HolidayRow[] = [], overrides: SessionOverrideRow[] = []): CalendarData {
  return {
    holidays: new Map(holidays.map((h) => [h.date, h])),
    overrides: new Map(overrides.map((o) => [o.date, o])),
  };
}

/**
 * Standard weekly hours (index = weekday, 0 = Sunday).
 * Mon-Thu 09:30-15:30. Friday has a midday break: 09:15-12:00 and 14:30-16:30.
 * Friday hours are marked "to confirm" until checked against the PSX notice.
 */
const STANDARD_HOURS: Record<number, { sessions: Session[]; status: CalendarStatus }> = {
  1: { sessions: [{ open: hm("09:30"), close: hm("15:30") }], status: "confirmed" },
  2: { sessions: [{ open: hm("09:30"), close: hm("15:30") }], status: "confirmed" },
  3: { sessions: [{ open: hm("09:30"), close: hm("15:30") }], status: "confirmed" },
  4: { sessions: [{ open: hm("09:30"), close: hm("15:30") }], status: "confirmed" },
  5: {
    sessions: [
      { open: hm("09:15"), close: hm("12:00") },
      { open: hm("14:30"), close: hm("16:30") },
    ],
    status: "to_confirm",
  },
};

/** "09:30" -> 570 */
export function hm(value: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) throw new Error(`Bad time "${value}", expected HH:MM`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Bad time "${value}"`);
  return h * 60 + min;
}

/** 570 -> "09:30" */
export function formatMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** PKT calendar date, minutes since PKT midnight and weekday for an instant. */
export function pktParts(instant: Date): { date: string; minutes: number; weekday: number } {
  const shifted = new Date(instant.getTime() + PKT_OFFSET_MINUTES * 60_000);
  return {
    date: shifted.toISOString().slice(0, 10),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

/** The instant for a PKT date + minutes since midnight. */
export function pktToDate(date: string, minutes: number): Date {
  return new Date(Date.parse(`${date}T00:00:00Z`) + (minutes - PKT_OFFSET_MINUTES) * 60_000);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export type DaySchedule = {
  date: string;
  sessions: Session[];
  /** Holiday or special-hours name, if any. */
  name: string | null;
  kind: "standard" | "weekend" | "holiday" | "special";
  status: CalendarStatus;
};

export function getSchedule(date: string, cal: CalendarData): DaySchedule {
  const holiday = cal.holidays.get(date);
  if (holiday) return { date, sessions: [], name: holiday.name, kind: "holiday", status: holiday.status };

  const override = cal.overrides.get(date);
  if (override) {
    return {
      date,
      sessions: override.sessions.map((s) => ({ open: hm(s.open), close: hm(s.close) })),
      name: override.name,
      kind: override.sessions.length ? "special" : "holiday",
      status: override.status,
    };
  }

  const standard = STANDARD_HOURS[weekdayOf(date)];
  if (!standard) return { date, sessions: [], name: null, kind: "weekend", status: "confirmed" };
  return { date, sessions: standard.sessions, name: null, kind: "standard", status: standard.status };
}

export function isTradingDay(date: string, cal: CalendarData): boolean {
  return getSchedule(date, cal).sessions.length > 0;
}

/** The trading day strictly before `date`. */
export function previousTradingDay(date: string, cal: CalendarData): string {
  let d = addDays(date, -1);
  for (let i = 0; i < 60; i++, d = addDays(d, -1)) if (isTradingDay(d, cal)) return d;
  throw new Error(`No trading day in the 60 days before ${date}`);
}

/** `date` if it's a trading day, else the one before it. */
export function tradingDayOnOrBefore(date: string, cal: CalendarData): string {
  return isTradingDay(date, cal) ? date : previousTradingDay(date, cal);
}

export type MarketState = "open" | "closed";
export type MarketReason = "session" | "break" | "before_open" | "after_close" | "weekend" | "holiday";

export type MarketStatus = {
  state: MarketState;
  reason: MarketReason;
  /** Holiday / special-hours name for today, if any. */
  dayName: string | null;
  /** When the state next flips (close if open, next open if closed). */
  nextChangeAt: Date;
  /** Today's schedule (or the holiday) is not yet confirmed against PSX's notice. */
  toConfirm: boolean;
  today: DaySchedule;
};

/** Next session open at or after (date, minutes), searching up to 60 days ahead. */
function nextOpenFrom(date: string, minutes: number, cal: CalendarData): Date {
  let d = date;
  let from = minutes;
  for (let i = 0; i < 60; i++) {
    const next = getSchedule(d, cal).sessions.find((s) => s.open >= from);
    if (next) return pktToDate(d, next.open);
    d = addDays(d, 1);
    from = 0;
  }
  throw new Error(`No market open in the 60 days after ${date}`);
}

export function marketStatus(now: Date, cal: CalendarData): MarketStatus {
  const { date, minutes } = pktParts(now);
  const today = getSchedule(date, cal);
  const toConfirm = today.status === "to_confirm";
  const base = { dayName: today.name, toConfirm, today };

  if (today.sessions.length === 0) {
    return {
      ...base,
      state: "closed",
      reason: today.kind === "weekend" ? "weekend" : "holiday",
      nextChangeAt: nextOpenFrom(addDays(date, 1), 0, cal),
    };
  }

  const current = today.sessions.find((s) => minutes >= s.open && minutes < s.close);
  if (current) {
    return { ...base, state: "open", reason: "session", nextChangeAt: pktToDate(date, current.close) };
  }

  const first = today.sessions[0];
  const last = today.sessions[today.sessions.length - 1];
  const reason: MarketReason = minutes < first.open ? "before_open" : minutes >= last.close ? "after_close" : "break";
  return { ...base, state: "closed", reason, nextChangeAt: nextOpenFrom(date, minutes, cal) };
}

/** Close of the last session on a trading day (minutes since PKT midnight). */
export function lastCloseMinutes(date: string, cal: CalendarData): number | null {
  const s = getSchedule(date, cal).sessions;
  return s.length ? s[s.length - 1].close : null;
}

/** Fraction (0..1) of the day's trading minutes elapsed at `minutes`. */
export function sessionProgress(date: string, minutes: number, cal: CalendarData): number {
  const sessions = getSchedule(date, cal).sessions;
  const total = sessions.reduce((sum, s) => sum + (s.close - s.open), 0);
  if (total === 0) return 0;
  const done = sessions.reduce((sum, s) => sum + Math.max(0, Math.min(minutes, s.close) - s.open), 0);
  return Math.min(1, done / total);
}
