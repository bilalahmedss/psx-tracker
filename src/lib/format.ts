import Decimal from "decimal.js";

// Display formatting. Inputs are decimal strings from the database; no float maths.

const MINUS = "−";

function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** "1234.5" -> "1,234.50" */
export function formatPrice(value: string | null | undefined, dp = 2): string {
  if (value === null || value === undefined || value === "") return "-";
  const d = new Decimal(value);
  const [i, f] = d.abs().toFixed(dp).split(".");
  return `${d.isNegative() && !d.isZero() ? MINUS : ""}${group(i)}${f ? `.${f}` : ""}`;
}

/** "1.5" -> "+1.50", "-0.5" -> "−0.50", "0" -> "0.00" */
export function formatSigned(value: string | null | undefined, dp = 2): string {
  if (value === null || value === undefined || value === "") return "-";
  const d = new Decimal(value).toDecimalPlaces(dp);
  if (d.isZero()) return new Decimal(0).toFixed(dp);
  return `${d.isPositive() ? "+" : MINUS}${formatPrice(d.abs().toFixed(), dp)}`;
}

export function formatPct(value: string | null | undefined): string {
  const s = formatSigned(value, 2);
  return s === "-" ? s : `${s}%`;
}

export function formatVolume(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return group(String(Math.round(value)));
}

export type Tone = "up" | "down" | "flat";

export function changeTone(value: string | null | undefined): Tone {
  if (!value) return "flat";
  const d = new Decimal(value);
  return d.isZero() ? "flat" : d.isPositive() ? "up" : "down";
}

const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", hour12: false });
const dayTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Karachi",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });

/** "14:05" in Pakistan time. */
export function formatPktTime(at: Date | string): string {
  return timeFmt.format(new Date(at));
}

/** "Mon 9 Nov, 09:30" in Pakistan time. */
export function formatPktDayTime(at: Date | string): string {
  return dayTimeFmt.format(new Date(at)).replace(/^(\w+),? /, "$1 ");
}

/** "15:30" if `at` is today in Pakistan, else "Wed 4 Nov, 15:30". */
export function formatPktAsOf(at: Date | string, now: Date = new Date()): string {
  const day = (d: Date) => new Date(d.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
  return day(new Date(at)) === day(now) ? formatPktTime(at) : formatPktDayTime(at);
}

/** "2026-11-09" -> "Mon 9 Nov 2026" (calendar date, no timezone shift). */
export function formatDate(date: string): string {
  return dateFmt.format(new Date(`${date}T00:00:00Z`)).replace(/^(\w+),? /, "$1 ");
}
