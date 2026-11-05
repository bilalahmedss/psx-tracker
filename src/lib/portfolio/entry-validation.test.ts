import { describe, expect, it } from "vitest";
import { CASH_FIELDS, DIVIDEND_FIELDS, TRADE_FIELDS, cashEntrySchema, dividendSchema, parseForm, tradeSchema } from "./entry-validation";

const TODAY = "2026-11-05";
const fd = (values: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
};

describe("trade form", () => {
  const ok = { type: "buy", symbol: "ogdc", qty: "1000", price: "50.25", tradeDate: "2026-11-04", fee: "75.38", tax: "11.31", otherCharges: "", affectsCash: "on", note: "" };
  const parse = (o: Record<string, string> = {}) => parseForm(tradeSchema(TODAY), fd({ ...ok, ...o }), TRADE_FIELDS);

  it("accepts a valid trade and normalises it", () => {
    const r = parse();
    expect(r.ok && r.data).toMatchObject({ symbol: "OGDC", qty: "1000", otherCharges: "0", affectsCash: true, note: null });
  });

  it.each([
    ["qty", "10.5", "whole"],
    ["qty", "0", "more than 0"],
    ["price", "0", "more than 0"],
    ["price", "1.23456", "decimal"],
    ["tradeDate", "2026-11-06", "future"],
    ["tradeDate", "1999-12-31", "2000"],
    ["fee", "-1", "number"],
    ["symbol", "", "list"],
    ["type", "short", "buy or sell"],
  ])("rejects %s = %j", (field, value, msg) => {
    const r = parse({ [field]: value });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors[field].toLowerCase()).toContain(msg === "whole" ? "0 decimal" : msg);
  });

  it("treats an unticked cash box as not affecting cash", () => {
    const f = fd(ok);
    f.delete("affectsCash");
    const r = parseForm(tradeSchema(TODAY), f, TRADE_FIELDS);
    expect(r.ok && r.data.affectsCash).toBe(false);
  });
});

describe("dividend form", () => {
  const ok = { symbol: "OGDC", paidOn: "2026-10-01", shares: "1000", dps: "5.5", gross: "5500", wht: "825", zakat: "", affectsCash: "", note: "" };
  const parse = (o: Record<string, string> = {}) => parseForm(dividendSchema(TODAY), fd({ ...ok, ...o }), DIVIDEND_FIELDS);

  it("accepts a valid dividend", () => {
    expect(parse().ok && parse()).toMatchObject({ data: { dps: "5.5", zakat: "0", affectsCash: false } });
  });

  it("allows a missing DPS (gross entered directly)", () => {
    const r = parse({ dps: "" });
    expect(r.ok && r.data.dps).toBeNull();
  });

  it("rejects deductions above the gross amount", () => {
    const r = parse({ wht: "5000", zakat: "600" });
    expect(!r.ok && r.fieldErrors.wht).toMatch(/more than the gross/);
  });
});

describe("cash entry form", () => {
  const parse = (o: Record<string, string>) =>
    parseForm(cashEntrySchema(TODAY), fd({ type: "deposit", direction: "", amount: "1000", date: "2026-11-01", note: "", ...o }), CASH_FIELDS);

  it("stores deposits as positive and withdrawals/deductions as negative", () => {
    expect(parse({}).ok && (parse({}) as { data: { signedAmount: string } }).data.signedAmount).toBe("1000");
    const w = parse({ type: "withdrawal" });
    expect(w.ok && w.data.signedAmount).toBe("-1000");
    const d = parse({ type: "deduction", amount: "12.5" });
    expect(d.ok && d.data.signedAmount).toBe("-12.5");
  });

  it("signs adjustments by direction", () => {
    const i = parse({ type: "adjustment", direction: "in" });
    const o = parse({ type: "adjustment", direction: "out" });
    expect(i.ok && i.data.signedAmount).toBe("1000");
    expect(o.ok && o.data.signedAmount).toBe("-1000");
  });

  it("rejects zero amounts", () => {
    expect(parse({ amount: "0" }).ok).toBe(false);
  });
});
