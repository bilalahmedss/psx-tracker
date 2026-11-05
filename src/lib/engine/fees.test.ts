import { describe, expect, it } from "vitest";
import { computeFees, type FeeProfile } from "./fees";

// PSX defaults, stored as fractions: 0.15% of value at or above Rs 20/share,
// Rs 0.03/share below, 15% sales tax (FED) on the commission, no minimum.
const PSX: FeeProfile = { threshold: "20", pctAbove: "0.0015", perShareBelow: "0.03", fedPct: "0.15", minFee: "0" };

const fees = (qty: string, price: string, profile: FeeProfile = PSX) => {
  const r = computeFees(profile, qty, price);
  return { commission: r.commission.toFixed(2), tax: r.tax.toFixed(2), total: r.total.toFixed(2) };
};

describe("computeFees", () => {
  it("charges a percentage of value at or above the threshold", () => {
    // 1,000 x Rs 50 = 50,000; 0.15% = 75.00; 15% tax on 75 = 11.25
    expect(fees("1000", "50")).toEqual({ commission: "75.00", tax: "11.25", total: "86.25" });
  });

  it("charges per share below the threshold", () => {
    // 1,000 x Rs 0.03 = 30.00; 15% tax = 4.50
    expect(fees("1000", "10")).toEqual({ commission: "30.00", tax: "4.50", total: "34.50" });
  });

  it("uses the percentage rule at exactly the threshold", () => {
    // 500 x Rs 20 = 10,000 x 0.15% = 15.00 (the two rules agree at Rs 20); tax 2.25
    expect(fees("500", "20")).toEqual({ commission: "15.00", tax: "2.25", total: "17.25" });
  });

  it("uses the per-share rule just below the threshold", () => {
    // 500 x Rs 0.03 = 15.00 (0.15% of 9,995 would be 14.99); tax 2.25
    expect(fees("500", "19.99")).toEqual({ commission: "15.00", tax: "2.25", total: "17.25" });
  });

  it("applies the minimum commission before tax", () => {
    // 100 x Rs 50 = 5,000 x 0.15% = 7.50, below the Rs 50 minimum -> 50.00; tax 7.50
    expect(fees("100", "50", { ...PSX, minFee: "50" })).toEqual({ commission: "50.00", tax: "7.50", total: "57.50" });
  });

  it("rounds commission, then tax on the rounded commission, half up to the paisa", () => {
    // 333 x 47.37 = 15,774.21 x 0.15% = 23.661315 -> 23.66
    // 23.66 x 15% = 3.549 -> 3.55
    expect(fees("333", "47.37")).toEqual({ commission: "23.66", tax: "3.55", total: "27.21" });
  });

  it("supports a zero-fee profile", () => {
    expect(fees("1000", "50", { threshold: "20", pctAbove: "0", perShareBelow: "0", fedPct: "0", minFee: "0" })).toEqual({
      commission: "0.00",
      tax: "0.00",
      total: "0.00",
    });
  });

  it("charges nothing for zero quantity", () => {
    expect(fees("0", "50", { ...PSX, minFee: "50" }).total).toBe("0.00");
  });
});
