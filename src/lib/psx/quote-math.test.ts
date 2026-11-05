import { describe, expect, it } from "vitest";
import { computeChange, toPrice, toTick, toVolume } from "./quote-math";

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
