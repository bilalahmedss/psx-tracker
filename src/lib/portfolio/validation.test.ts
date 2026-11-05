import { describe, expect, it } from "vitest";
import { PSX_DEFAULT_CGT, PSX_DEFAULT_FEES, cgtRowToForm, feeRowToForm } from "./defaults";
import { parsePortfolioForm, toRpcArgs, type PortfolioField } from "./validation";

function form(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  const values: Record<string, string> = {
    name: "Main account",
    brokerId: "",
    taxStatus: "filer",
    ...PSX_DEFAULT_CGT,
    ...PSX_DEFAULT_FEES,
    ...overrides,
  };
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

describe("parsePortfolioForm", () => {
  it("accepts the PSX defaults", () => {
    expect(parsePortfolioForm(form()).ok).toBe(true);
  });

  it("converts percents to fractions for the database", () => {
    const r = parsePortfolioForm(form({ isDefault: "on" }));
    if (!r.ok) throw new Error(JSON.stringify(r.fieldErrors));
    expect(toRpcArgs(r.data)).toEqual({
      p_name: "Main account",
      p_broker_id: null,
      p_tax_status: "filer",
      p_filer_rate: "0.15",
      p_non_filer_rate: "0.3",
      p_threshold: "20",
      p_pct_above: "0.0015",
      p_per_share_below: "0.03",
      p_fed_pct: "0.15",
      p_min_fee: "0",
      p_is_default: true,
    });
  });

  it("treats a missing checkbox as not default", () => {
    const r = parsePortfolioForm(form());
    expect(r.ok && r.data.isDefault).toBe(false);
  });

  it("trims the name and rejects blank names", () => {
    const ok = parsePortfolioForm(form({ name: "  Family  " }));
    expect(ok.ok && ok.data.name).toBe("Family");
    const bad = parsePortfolioForm(form({ name: "   " }));
    expect(!bad.ok && bad.fieldErrors.name).toBeTruthy();
  });

  it("rejects names over 60 characters", () => {
    const r = parsePortfolioForm(form({ name: "x".repeat(61) }));
    expect(!r.ok && r.fieldErrors.name).toBeTruthy();
  });

  it("accepts a broker uuid and rejects junk", () => {
    const id = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
    const ok = parsePortfolioForm(form({ brokerId: id }));
    expect(ok.ok && ok.data.brokerId).toBe(id);
    const bad = parsePortfolioForm(form({ brokerId: "not-a-uuid" }));
    expect(!bad.ok && bad.fieldErrors.brokerId).toBeTruthy();
  });

  it("rejects an unknown tax status", () => {
    const r = parsePortfolioForm(form({ taxStatus: "exempt" }));
    expect(!r.ok && r.fieldErrors.taxStatus).toBeTruthy();
  });

  it.each<[PortfolioField, string]>([
    ["pctAbove", "-0.15"],
    ["pctAbove", "10"], // must be below 10%
    ["pctAbove", "0.12345"], // more than 4 dp
    ["fedPct", "100"],
    ["nonFilerRate", "14.99"], // below the 15% floor
    ["statusEffectiveFrom", "2026-02-30"],
    ["nonFilerRate", "abc"],
    ["threshold", ""],
    ["perShareBelow", "1e2"],
    ["minFee", "1.234"], // more than 2 dp
    ["minFee", "100001"],
  ])("rejects %s = %j", (field, value) => {
    const r = parsePortfolioForm(form({ [field]: value }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.fieldErrors[field]).toBeTruthy();
  });

  it("accepts a 15% non-filer rate and a status change date", () => {
    const r = parsePortfolioForm(form({ nonFilerRate: "15", statusEffectiveFrom: "2025-07-01" }));
    expect(r.ok && r.data.statusEffectiveFrom).toBe("2025-07-01");
    expect(r.ok && toRpcArgs(r.data).p_non_filer_rate).toBe("0.15");
  });

  it("treats a blank status date as not given", () => {
    const r = parsePortfolioForm(form({ statusEffectiveFrom: "" }));
    expect(r.ok && r.data.statusEffectiveFrom).toBeNull();
  });

  it("accepts zero fees (e.g. a zero-commission promo)", () => {
    expect(parsePortfolioForm(form({ pctAbove: "0", perShareBelow: "0", fedPct: "0" })).ok).toBe(true);
  });
});

describe("DB row -> form values", () => {
  it("matches the seeded PSX default rows", () => {
    expect(
      feeRowToForm({
        threshold: "20.0000",
        pct_above: "0.001500",
        per_share_below: "0.0300",
        fed_pct: "0.150000",
        min_fee: "0.0000",
      }),
    ).toEqual(PSX_DEFAULT_FEES);
    expect(cgtRowToForm({ filer_rate: "0.150000", non_filer_rate: "0.300000" })).toEqual(PSX_DEFAULT_CGT);
  });
});
