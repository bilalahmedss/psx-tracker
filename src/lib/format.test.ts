import { describe, expect, it } from "vitest";
import {
  changeTone,
  formatDate,
  formatPct,
  formatPktAsOf,
  formatPktDayTime,
  formatPktTime,
  formatPrice,
  formatSigned,
  formatVolume,
} from "./format";

describe("formatPrice", () => {
  it("groups thousands with 2 dp", () => {
    expect(formatPrice("1234.5")).toBe("1,234.50");
    expect(formatPrice("1234567.891")).toBe("1,234,567.89");
    expect(formatPrice("5.4")).toBe("5.40");
  });
  it("shows a dash for missing values", () => {
    expect(formatPrice(null)).toBe("-");
  });
});

describe("formatSigned / formatPct", () => {
  it("signs changes with a real minus sign", () => {
    expect(formatSigned("2.75")).toBe("+2.75");
    expect(formatSigned("-0.5")).toBe("−0.50");
    expect(formatSigned("0")).toBe("0.00");
    expect(formatSigned("-0.001")).toBe("0.00"); // rounds to zero, no sign
    expect(formatPct("1.2")).toBe("+1.20%");
    expect(formatPct(null)).toBe("-");
  });
});

describe("changeTone", () => {
  it("classifies direction", () => {
    expect(changeTone("1")).toBe("up");
    expect(changeTone("-1")).toBe("down");
    expect(changeTone("0")).toBe("flat");
    expect(changeTone(null)).toBe("flat");
  });
});

describe("formatVolume", () => {
  it("groups whole numbers", () => {
    expect(formatVolume(1543210)).toBe("1,543,210");
    expect(formatVolume(null)).toBe("-");
  });
});

describe("Pakistan time formatting", () => {
  it("shows times in PKT regardless of server timezone", () => {
    expect(formatPktTime("2026-11-05T10:30:00Z")).toBe("15:30");
    expect(formatPktDayTime("2026-11-10T04:30:00Z")).toBe("Tue 10 Nov, 09:30");
  });
  it("shows just the time for today's quotes, the day otherwise", () => {
    const now = new Date("2026-11-05T06:00:00Z"); // Thu 11:00 PKT
    expect(formatPktAsOf("2026-11-05T05:59:00Z", now)).toBe("10:59");
    expect(formatPktAsOf("2026-11-04T10:30:00Z", now)).toBe("Wed 4 Nov, 15:30");
    // 20:00 UTC Wed is already Thursday 01:00 in Pakistan
    expect(formatPktAsOf("2026-11-04T20:00:00Z", now)).toBe("01:00");
  });
  it("formats calendar dates without shifting the day", () => {
    expect(formatDate("2026-11-09")).toBe("Mon 9 Nov 2026");
  });
});
