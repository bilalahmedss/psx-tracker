import { describe, expect, it } from "vitest";
import { computeFees, NO_EXTRA_CHARGES, type FeeProfile } from "./fees";

// PSX defaults, stored as fractions: 0.15% of value at or above Rs 20/share,
// Rs 0.03/share below, 15% sales tax (FED) on the commission, no minimum.
const PSX: FeeProfile = { threshold: "20", pctAbove: "0.0015", perShareBelow: "0.03", fedPct: "0.15", minFee: "0", ...NO_EXTRA_CHARGES };

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
    expect(fees("1000", "50", { threshold: "20", pctAbove: "0", perShareBelow: "0", fedPct: "0", minFee: "0", ...NO_EXTRA_CHARGES })).toEqual({
      commission: "0.00",
      tax: "0.00",
      total: "0.00",
    });
  });

  it("charges nothing for zero quantity", () => {
    expect(fees("0", "50", { ...PSX, minFee: "50" }).total).toBe("0.00");
  });
});

// Chase Securities (Nafa app), worked out from five real orders (Sep 2026):
// commission 0.15% (Rs 0.03/share below Rs 20), 15% Sindh sales tax on it,
// CDC Rs 5 per trade, and three levies on trade value, their 15% tax included:
// PSX 0.0036% x 1.15 = 0.00414%, SECP 0.0005% x 1.15 = 0.000575%, NCCPL 0.0028% x 1.15 = 0.00322%.
const CHASE: FeeProfile = {
  threshold: "20",
  pctAbove: "0.0015",
  perShareBelow: "0.03",
  fedPct: "0.15",
  minFee: "0",
  cdcPerTrade: "5",
  psxLevyPct: "0.0000414",
  secpLevyPct: "0.00000575",
  nccplLevyPct: "0.0000322",
};

const breakdown = (qty: string, price: string) => {
  const r = computeFees(CHASE, qty, price);
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.toFixed(2)]));
};

describe("computeFees with CDC and levies (Chase Securities / Nafa)", () => {
  it("matches the Nafa order: 4 MEBL @ 559.99 on 8 Sep 2026, total fees Rs 9.03", () => {
    // value 2,239.96: commission 3.36, tax 0.50, CDC 5, PSX 0.09, SECP 0.01, NCCPL 0.07
    expect(breakdown("4", "559.99")).toEqual({
      commission: "3.36", tax: "0.50", cdc: "5.00", psx: "0.09", secp: "0.01", nccpl: "0.07", other: "5.17", total: "9.03",
    });
  });

  it("matches the Nafa order: 500 MIIETF @ 16.26 on 9 Sep 2026, total fees Rs 22.90", () => {
    // under Rs 20, so Rs 0.03/share = 15.00 (0.15% would be 12.20); value 8,130
    expect(breakdown("500", "16.26")).toEqual({
      commission: "15.00", tax: "2.25", cdc: "5.00", psx: "0.34", secp: "0.05", nccpl: "0.26", other: "5.65", total: "22.90",
    });
  });

  it("matches the Nafa order: 5 SYS @ 125.60 on 9 Sep 2026, total fees Rs 6.13", () => {
    // value 628: SECP 0.0036 rounds to 0.00 (Nafa doesn't list it)
    expect(breakdown("5", "125.60")).toEqual({
      commission: "0.94", tax: "0.14", cdc: "5.00", psx: "0.03", secp: "0.00", nccpl: "0.02", other: "5.05", total: "6.13",
    });
  });

  it("rounds an exact half paisa up: 8 SYS @ 125 gives Rs 6.81, where Nafa shows 6.80", () => {
    // tax = 1.50 x 15% = 0.225 exactly. Half-up gives 0.23; Nafa shows 0.22, which is
    // what binary floating point gives (1.5 * 0.15 = 0.22499999...). We keep exact decimals.
    expect(breakdown("8", "125")).toEqual({
      commission: "1.50", tax: "0.23", cdc: "5.00", psx: "0.04", secp: "0.01", nccpl: "0.03", other: "5.08", total: "6.81",
    });
  });

  it("charges nothing extra on a profile without CDC or levies", () => {
    expect(computeFees(PSX, "1000", "50").other.toFixed(2)).toBe("0.00");
  });
});
