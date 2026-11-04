import { describe, expect, it } from "vitest";
import { decimalPlaces, fractionToPercent, isDecimalString, percentToFraction, trimDecimal } from "./rates";

describe("percentToFraction", () => {
  it("converts PSX commission 0.15% exactly", () => {
    expect(percentToFraction("0.15")).toBe("0.0015");
  });
  it("converts whole percents", () => {
    expect(percentToFraction("15")).toBe("0.15");
    expect(percentToFraction("30")).toBe("0.3");
    expect(percentToFraction("0")).toBe("0");
  });
  it("has no float drift where JS numbers would", () => {
    expect(0.07 / 100).not.toBe(0.0007); // the float bug we avoid
    expect(percentToFraction("0.07")).toBe("0.0007");
    expect(percentToFraction("16.1")).toBe("0.161");
  });
  it("trims whitespace", () => {
    expect(percentToFraction(" 0.15 ")).toBe("0.0015");
  });
});

describe("fractionToPercent", () => {
  it("reads DB numeric strings back as percents", () => {
    expect(fractionToPercent("0.001500")).toBe("0.15");
    expect(fractionToPercent("0.150000")).toBe("15");
    expect(fractionToPercent("0.300000")).toBe("30");
  });
  it("round-trips with percentToFraction", () => {
    for (const p of ["0.15", "0.1", "15", "12.5", "0.0001", "99.9999"]) {
      expect(fractionToPercent(percentToFraction(p))).toBe(p);
    }
  });
});

describe("trimDecimal", () => {
  it("strips trailing zeros from DB values", () => {
    expect(trimDecimal("20.0000")).toBe("20");
    expect(trimDecimal("0.0300")).toBe("0.03");
    expect(trimDecimal("0.0000")).toBe("0");
  });
});

describe("isDecimalString / decimalPlaces", () => {
  it("accepts plain non-negative decimals", () => {
    expect(isDecimalString("0.15")).toBe(true);
    expect(isDecimalString("20")).toBe(true);
  });
  it("rejects negatives, exponents, commas and junk", () => {
    for (const v of ["-1", "1e3", "1,000", "", ".5", "5.", "abc", "0x10"]) {
      expect(isDecimalString(v)).toBe(false);
    }
  });
  it("counts decimal places", () => {
    expect(decimalPlaces("0.0015")).toBe(4);
    expect(decimalPlaces("20")).toBe(0);
  });
});
