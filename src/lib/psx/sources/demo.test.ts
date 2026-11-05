import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { buildCalendar } from "../calendar";
import { createDemoSource, demoClose, demoQuote } from "./demo";
import { DEMO_SYMBOLS } from "./demo-symbols";

const cal = buildCalendar([{ date: "2026-11-09", name: "Iqbal Day", status: "to_confirm" }]);
const at = (iso: string) => new Date(iso);

describe("demoQuote", () => {
  it("is deterministic for the same symbol and time", () => {
    const t = at("2026-11-05T06:12:00Z");
    expect(demoQuote("OGDC", t, cal)).toEqual(demoQuote("OGDC", t, cal));
  });

  it("produces tick-sized prices within the day range", () => {
    for (const s of DEMO_SYMBOLS) {
      const q = demoQuote(s.symbol, at("2026-11-05T07:00:00Z"), cal);
      expect(q.price).toMatch(/^\d+\.\d{2}$/);
      expect(new Decimal(q.low!).lte(q.price)).toBe(true);
      expect(new Decimal(q.high!).gte(q.price)).toBe(true);
      expect(new Decimal(q.price).gt(0)).toBe(true);
    }
  });

  it("moves during the session", () => {
    const a = demoQuote("HBL", at("2026-11-05T05:00:00Z"), cal);
    const b = demoQuote("HBL", at("2026-11-05T09:00:00Z"), cal);
    expect(a.price).not.toBe(b.price);
    expect(a.prevClose).toBe(b.prevClose);
  });

  it("shows Friday's close all weekend, vs Thursday's close", () => {
    const sat = demoQuote("LUCK", at("2026-11-07T06:00:00Z"), cal);
    const sun = demoQuote("LUCK", at("2026-11-08T15:00:00Z"), cal);
    expect(sat).toEqual(sun);
    expect(sat.price).toBe(new Decimal(demoClose("LUCK", "2026-11-06")).toDecimalPlaces(2).toFixed(2));
    expect(sat.prevClose).toBe(new Decimal(demoClose("LUCK", "2026-11-05")).toDecimalPlaces(2).toFixed(2));
    expect(sat.asOf.toISOString()).toBe("2026-11-06T11:30:00.000Z"); // Fri 16:30 PKT
  });

  it("before the open, shows the previous session", () => {
    const pre = demoQuote("KEL", at("2026-11-05T03:00:00Z"), cal); // Thu 08:00 PKT
    expect(pre.asOf.toISOString()).toBe("2026-11-04T10:30:00.000Z"); // Wed 15:30 PKT
  });

  it("computes change from the previous close", () => {
    const q = demoQuote("MCB", at("2026-11-05T06:00:00Z"), cal);
    expect(new Decimal(q.price).minus(q.prevClose!).toFixed()).toBe(new Decimal(q.change!).toFixed());
  });
});

describe("createDemoSource", () => {
  const source = createDemoSource(cal, () => at("2026-11-10T06:00:00Z")); // Tue 11:00 PKT

  it("lists all demo symbols", async () => {
    const list = await source.listSymbols();
    expect(list.map((s) => s.symbol)).toEqual(DEMO_SYMBOLS.map((s) => s.symbol));
    expect(list.find((s) => s.symbol === "MZNPETF")?.isEtf).toBe(true);
  });

  it("ignores unknown symbols", async () => {
    const quotes = await source.getQuotes(["OGDC", "NOPE"]);
    expect(quotes.map((q) => q.symbol)).toEqual(["OGDC"]);
  });

  it("returns daily candles only for finished trading days", async () => {
    const candles = await source.getDailyHistory("OGDC", "2026-11-05", "2026-11-10");
    expect(candles.map((c) => c.date)).toEqual(["2026-11-05", "2026-11-06"]); // no weekend, holiday, or unfinished Tue
  });

  it("candle close matches the end-of-day quote", async () => {
    const [c] = await source.getDailyHistory("OGDC", "2026-11-05", "2026-11-05");
    expect(c.close).toBe(demoQuote("OGDC", at("2026-11-05T12:00:00Z"), cal).price);
  });
});
