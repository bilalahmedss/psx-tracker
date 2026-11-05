import { describe, expect, it } from "vitest";
import { computeChange, toPrice, toTick, toVolume, quoteFromCandles } from "./quote-math";

describe("toPrice", () => {
  it("accepts numbers and numeric strings", () => {
    expect(toPrice(231.5)).toBe("231.5");
    expect(toPrice("0.03")).toBe("0.03");
    expect(toPrice(0)).toBe("0");
  });
  it("rejects missing, NA, negative and junk values", () => {
    for (const v of [null, undefined, "", "NA", -1, "abc", {}, NaN, Infinity]) expect(toPrice(v)).toBeNull();
  });
  it("keeps at most 4 dp", () => {
    expect(toPrice(1.234567)).toBe("1.2346");
  });
});

describe("toVolume", () => {
  it("rounds to whole shares", () => {
    expect(toVolume(1234.6)).toBe(1235);
    expect(toVolume("NA")).toBeNull();
  });
});

describe("computeChange", () => {
  it("computes change and percent exactly", () => {
    expect(computeChange("110", "100")).toEqual({ change: "10", changePct: "10" });
    expect(computeChange("99.5", "100")).toEqual({ change: "-0.5", changePct: "-0.5" });
  });
  it("rounds percent to 2 dp", () => {
    expect(computeChange("5.41", "5.4").changePct).toBe("0.19"); // 0.185185...
  });
  it("avoids float drift", () => {
    // 0.3 - 0.1 in floats is 0.19999999999999998
    expect(computeChange("0.3", "0.1").change).toBe("0.2");
  });
  it("returns nulls without a usable previous close", () => {
    expect(computeChange("10", null)).toEqual({ change: null, changePct: null });
    expect(computeChange("10", "0")).toEqual({ change: null, changePct: null });
  });
});

describe("toTick", () => {
  it("rounds half up to PSX's 0.01 tick", () => {
    expect(toTick("1.005")).toBe("1.01");
    expect(toTick("1.004")).toBe("1.00");
    expect(toTick(230)).toBe("230.00");
  });
});

describe("quoteFromCandles", () => {
  const at = (date: string) => new Date(`${date}T10:30:00Z`);
  it("uses the newest close and the one before it, whatever the order", () => {
    const q = quoteFromCandles(
      [
        { symbol: "MEBL", date: "2026-11-04", open: "526.6", high: "541", low: "526.58", close: "538.48", volume: 1526032 },
        { symbol: "MEBL", date: "2026-11-03", open: "520", high: "530", low: "519", close: "527.1", volume: 900000 },
      ],
      at,
    );
    expect(q).toEqual({
      symbol: "MEBL",
      price: "538.48",
      prevClose: "527.1",
      change: "11.38",
      changePct: "2.16",
      open: "526.6",
      high: "541",
      low: "526.58",
      volume: 1526032,
      asOf: new Date("2026-11-04T10:30:00Z"),
    });
  });
  it("has no change with a single candle, and nothing with none", () => {
    const q = quoteFromCandles([{ symbol: "X", date: "2026-11-04", open: null, high: null, low: null, close: "10", volume: null }], at);
    expect(q).toMatchObject({ price: "10", prevClose: null, change: null, changePct: null });
    expect(quoteFromCandles([], at)).toBeNull();
  });
});
