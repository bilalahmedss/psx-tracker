import { describe, expect, it } from "vitest";
import { cgtByTaxYear, cgtRate, taxYearOf } from "./cgt";
import { statusOn } from "./tax-status";

const rate = (acquiredOn: string, soldOn: string, opts: { filerOnBuy?: boolean; filerOnSell?: boolean; nonFilerRate?: string } = {}) =>
  cgtRate({ acquiredOn, soldOn, filerOnBuy: opts.filerOnBuy ?? true, filerOnSell: opts.filerOnSell ?? true, nonFilerRate: opts.nonFilerRate ?? "0.20" });

describe("cgtRate: acquired on or after 1 Jul 2024", () => {
  it("is 15% for a filer on both buy and sell dates, whatever the holding period", () => {
    expect(rate("2024-07-01", "2024-07-02").rate.toFixed()).toBe("0.15");
    expect(rate("2024-07-01", "2032-01-01").rate.toFixed()).toBe("0.15");
  });

  it("uses the portfolio's non-filer rate if not on the ATL on the sell date", () => {
    const r = rate("2025-01-10", "2025-06-01", { filerOnSell: false, nonFilerRate: "0.25" });
    expect(r.rate.toFixed()).toBe("0.25");
    expect(r.basis).toBe("non_filer");
  });

  it("uses the non-filer rate if not on the ATL on the buy date", () => {
    expect(rate("2025-01-10", "2025-06-01", { filerOnBuy: false, nonFilerRate: "0.25" }).rate.toFixed()).toBe("0.25");
  });

  it("never applies a non-filer rate below the 15% floor", () => {
    expect(rate("2025-01-10", "2025-06-01", { filerOnSell: false, nonFilerRate: "0.10" }).rate.toFixed()).toBe("0.15");
  });
});

describe("cgtRate: acquired 1 Jul 2022 to 30 Jun 2024 (holding-period slabs)", () => {
  // Acquired 15 Jan 2023
  it.each([
    ["2023-06-01", "0.15"], // under 1 year
    ["2024-01-15", "0.15"], // exactly 1 year: "does not exceed one year"
    ["2024-01-16", "0.125"], // just over 1 year
    ["2025-01-15", "0.125"], // exactly 2 years
    ["2025-01-16", "0.1"],
    ["2026-01-16", "0.075"],
    ["2027-01-16", "0.05"],
    ["2028-01-16", "0.025"],
    ["2029-01-15", "0.025"], // exactly 6 years
    ["2029-01-16", "0"], // over 6 years
  ])("sold %s -> %s", (soldOn, expected) => {
    expect(rate("2023-01-15", soldOn).rate.toFixed()).toBe(expected);
  });

  it("puts 30 Jun 2024 in this bracket and 1 Jul 2024 in the next", () => {
    expect(rate("2024-06-30", "2026-01-01").rule).toBe("2022-2024");
    expect(rate("2024-07-01", "2026-01-01").rule).toBe("2024-onwards");
  });

  it("handles a 29 Feb acquisition (one year later is 28 Feb)", () => {
    expect(rate("2024-02-29", "2025-02-28").rate.toFixed()).toBe("0.15");
    expect(rate("2024-02-29", "2025-03-01").rate.toFixed()).toBe("0.125");
  });

  it("uses the filer schedule for non-filers, flagged to confirm", () => {
    const r = rate("2023-01-15", "2023-06-01", { filerOnSell: false });
    expect(r.rate.toFixed()).toBe("0.15");
    expect(r.toConfirm).toBe(true);
  });
});

describe("cgtRate: older acquisitions", () => {
  it("is 12.5% for 1 Jul 2013 to 30 Jun 2022", () => {
    expect(rate("2013-07-01", "2026-01-01").rate.toFixed()).toBe("0.125");
    expect(rate("2022-06-30", "2026-01-01").rate.toFixed()).toBe("0.125");
  });
  it("is 0% before 1 Jul 2013", () => {
    expect(rate("2013-06-30", "2026-01-01").rate.toFixed()).toBe("0");
  });
});

describe("taxYearOf", () => {
  it("runs July to June, named by the year it ends", () => {
    expect(taxYearOf("2025-06-30")).toBe(2025);
    expect(taxYearOf("2025-07-01")).toBe(2026);
    expect(taxYearOf("2026-01-15")).toBe(2026);
  });
});

describe("cgtByTaxYear", () => {
  it("offsets losses within a tax year and never goes below zero", () => {
    const years = cgtByTaxYear([
      { soldOn: "2025-08-01", gain: "1000", rate: "0.15" }, // TY2026
      { soldOn: "2026-02-01", gain: "-400", rate: "0.15" }, // TY2026
      { soldOn: "2025-03-01", gain: "-500", rate: "0.15" }, // TY2025, loss only
    ]);
    // TY2026: net gain 600; CGT 1000 x 15% - 400 x 15% = 150 - 60 = 90
    // TY2025: loss only -> 0 (losses are not carried forward yet)
    expect(years.map((y) => ({ ty: y.taxYear, net: y.netGain.toFixed(2), cgt: y.cgt.toFixed(2) }))).toEqual([
      { ty: 2026, net: "600.00", cgt: "90.00" },
      { ty: 2025, net: "-500.00", cgt: "0.00" },
    ]);
  });

  it("weights each gain by its own rate", () => {
    // 1,000 x 12.5% - 1,000 x 15% = 125 - 150 = -25 -> 0
    const [y] = cgtByTaxYear([
      { soldOn: "2026-01-01", gain: "1000", rate: "0.125" },
      { soldOn: "2026-01-02", gain: "-1000", rate: "0.15" },
    ]);
    expect(y.cgt.toFixed(2)).toBe("0.00");
    expect(y.gains.toFixed(2)).toBe("1000.00");
    expect(y.losses.toFixed(2)).toBe("-1000.00");
  });
});

describe("statusOn", () => {
  const history = [
    { status: "filer" as const, effectiveFrom: "1900-01-01" },
    { status: "non_filer" as const, effectiveFrom: "2025-03-01" },
    { status: "filer" as const, effectiveFrom: "2025-09-01" },
  ];
  it("returns the latest status in force on a date", () => {
    expect(statusOn(history, "2025-02-28")).toBe("filer");
    expect(statusOn(history, "2025-03-01")).toBe("non_filer");
    expect(statusOn(history, "2025-08-31")).toBe("non_filer");
    expect(statusOn(history, "2026-01-01")).toBe("filer");
  });
  it("works with unsorted input", () => {
    expect(statusOn([...history].reverse(), "2025-04-01")).toBe("non_filer");
  });
  it("assumes non-filer (the higher rate) without any history", () => {
    expect(statusOn([], "2025-04-01")).toBe("non_filer");
  });
});
