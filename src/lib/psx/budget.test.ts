import { describe, expect, it } from "vitest";
import { BudgetExceededError, DEFAULT_DAILY_LIMIT, createCallBudget, memoryBudgetStore, readDailyLimit, usageDay } from "./budget";

describe("readDailyLimit", () => {
  it("defaults to 15, leaving 5 of the free plan's 20 calls spare", () => {
    expect(DEFAULT_DAILY_LIMIT).toBe(15);
    expect(readDailyLimit(undefined)).toBe(15);
    expect(readDailyLimit("")).toBe(15);
    expect(readDailyLimit("18")).toBe(18);
    expect(readDailyLimit("0")).toBe(0);
  });
  it("rejects fractions and negatives", () => {
    expect(() => readDailyLimit("2.5")).toThrow(/whole number/);
    expect(() => readDailyLimit("-1")).toThrow(/whole number/);
    expect(() => readDailyLimit("lots")).toThrow(/whole number/);
  });
});

describe("usageDay", () => {
  it("counts per UTC day, which is when the provider resets", () => {
    // 04:30 PKT on 6 Nov is still 5 Nov in UTC.
    expect(usageDay(new Date("2026-11-05T23:30:00Z"))).toBe("2026-11-05");
    expect(usageDay(new Date("2026-11-06T00:00:00Z"))).toBe("2026-11-06");
  });
});

describe("createCallBudget", () => {
  const at = (iso: string) => () => new Date(iso);

  it("reserves calls up to the limit, then refuses without counting", async () => {
    const store = memoryBudgetStore();
    const b = createCallBudget(store, "eodhd", 15, at("2026-11-05T10:00:00Z"));
    await b.spend(5);
    await b.spend(5);
    await b.spend(5);
    expect(await b.used()).toBe(15);
    expect(await b.remaining()).toBe(0);
    await expect(b.spend(1)).rejects.toMatchObject({ name: "BudgetExceededError", used: 15, limit: 15, needed: 1 });
    expect(await b.used()).toBe(15);
  });

  it("refuses a request bigger than the remaining budget, even if a smaller one would fit", async () => {
    const store = memoryBudgetStore({ "eodhd:2026-11-05": 12 });
    const b = createCallBudget(store, "eodhd", 15, at("2026-11-05T10:00:00Z"));
    await expect(b.spend(5)).rejects.toBeInstanceOf(BudgetExceededError);
    await b.spend(3);
    expect(await b.remaining()).toBe(0);
  });

  it("refuses anything over the limit outright", async () => {
    const b = createCallBudget(memoryBudgetStore(), "eodhd", 15, at("2026-11-05T10:00:00Z"));
    await expect(b.spend(100)).rejects.toBeInstanceOf(BudgetExceededError);
    expect(await b.used()).toBe(0);
  });

  it("starts fresh on the next UTC day", async () => {
    const store = memoryBudgetStore({ "eodhd:2026-11-05": 15 });
    let now = new Date("2026-11-05T23:59:00Z");
    const b = createCallBudget(store, "eodhd", 15, () => now);
    await expect(b.spend(1)).rejects.toBeInstanceOf(BudgetExceededError);
    now = new Date("2026-11-06T00:01:00Z");
    await b.spend(1);
    expect(await b.used()).toBe(1);
  });

  it("keeps providers apart, and ignores zero-cost calls", async () => {
    const store = memoryBudgetStore();
    const a = createCallBudget(store, "eodhd", 2, at("2026-11-05T10:00:00Z"));
    const other = createCallBudget(store, "other", 2, at("2026-11-05T10:00:00Z"));
    await a.spend(2);
    await other.spend(2);
    await a.spend(0);
    expect(store.counts).toEqual({ "eodhd:2026-11-05": 2, "other:2026-11-05": 2 });
    await expect(a.spend(-1)).rejects.toThrow(/Invalid/);
  });
});
