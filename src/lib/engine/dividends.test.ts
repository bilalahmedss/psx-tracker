import { describe, expect, it } from "vitest";
import { computeDividend, defaultWhtRate } from "./dividends";

const div = (input: Parameters<typeof computeDividend>[0]) => {
  const r = computeDividend(input);
  return { gross: r.gross.toFixed(2), wht: r.wht.toFixed(2), net: r.net.toFixed(2) };
};

describe("defaultWhtRate", () => {
  it("is 15% for filers and 30% for non-filers", () => {
    expect(defaultWhtRate("filer").toFixed()).toBe("0.15");
    expect(defaultWhtRate("non_filer").toFixed()).toBe("0.3");
  });
});

describe("computeDividend", () => {
  it("computes a filer's dividend from shares and DPS", () => {
    // 1,000 shares x Rs 5.50 = 5,500 gross; 15% WHT = 825.00; net 4,675.00
    expect(div({ shares: "1000", dps: "5.50", whtRate: "0.15", zakat: "0" })).toEqual({ gross: "5500.00", wht: "825.00", net: "4675.00" });
  });

  it("computes a non-filer's dividend", () => {
    // 5,500 x 30% = 1,650.00; net 3,850.00
    expect(div({ shares: "1000", dps: "5.50", whtRate: "0.30", zakat: "0" })).toEqual({ gross: "5500.00", wht: "1650.00", net: "3850.00" });
  });

  it("deducts zakat as well as WHT", () => {
    // 5,500 - 825 WHT - 137.50 zakat (2.5% of gross) = 4,537.50
    expect(div({ shares: "1000", dps: "5.50", whtRate: "0.15", zakat: "137.50" }).net).toBe("4537.50");
  });

  it("accepts a gross amount directly", () => {
    // 2,000 gross x 25% custom rate = 500; net 1,500
    expect(div({ gross: "2000", whtRate: "0.25", zakat: "0" })).toEqual({ gross: "2000.00", wht: "500.00", net: "1500.00" });
  });

  it("rounds to the paisa", () => {
    // 333 x 1.25 = 416.25; 15% = 62.4375 -> 62.44; net 353.81
    expect(div({ shares: "333", dps: "1.25", whtRate: "0.15", zakat: "0" })).toEqual({ gross: "416.25", wht: "62.44", net: "353.81" });
  });

  it("uses an explicit WHT amount when given", () => {
    expect(div({ gross: "1000", wht: "120", zakat: "0" })).toEqual({ gross: "1000.00", wht: "120.00", net: "880.00" });
  });

  it("rejects deductions larger than the dividend", () => {
    expect(() => computeDividend({ gross: "100", whtRate: "0.15", zakat: "90" })).toThrow(/more than/);
  });
});
