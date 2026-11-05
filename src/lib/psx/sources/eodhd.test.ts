import { describe, expect, it } from "vitest";
import type { PoliteClient } from "../http";
import { BudgetExceededError, createCallBudget, memoryBudgetStore } from "../budget";
import { QUOTE_BATCH_SIZE, createEodhdSource, eodhdCallCost, fromTicker, parseEod, parseRealtime, parseSymbols, readQuoteMode, toTicker } from "./eodhd";

// Sample payloads shaped like EODHD's documented responses; the free-plan "NA"
// quote below was captured from the live API.
const REALTIME_ONE = {
  code: "OGDC.KAR",
  timestamp: 1793860200,
  gmtoffset: 0,
  open: 230.1,
  high: 233.5,
  low: 229.2,
  close: 232.75,
  volume: 1543210,
  previousClose: 230,
  change: 2.75,
  change_p: 1.1957,
};
const REALTIME_NA = { ...REALTIME_ONE, code: "XYZ.KAR", close: "NA" as const, timestamp: "NA" as const };

describe("tickers", () => {
  it("maps between PSX symbols and EODHD .KAR codes", () => {
    expect(toTicker("ogdc")).toBe("OGDC.KAR");
    expect(fromTicker("OGDC.KAR")).toBe("OGDC");
  });
});

describe("parseRealtime", () => {
  it("parses a single quote and recomputes change exactly", () => {
    const [q] = parseRealtime(REALTIME_ONE);
    expect(q).toMatchObject({
      symbol: "OGDC",
      price: "232.75",
      prevClose: "230",
      change: "2.75",
      changePct: "1.2",
      open: "230.1",
      high: "233.5",
      low: "229.2",
      volume: 1543210,
    });
    expect(q.asOf.toISOString()).toBe(new Date(1793860200 * 1000).toISOString());
  });

  it("parses arrays and skips rows with no price", () => {
    const quotes = parseRealtime([REALTIME_ONE, REALTIME_NA]);
    expect(quotes.map((q) => q.symbol)).toEqual(["OGDC"]);
  });

  it("skips the free plan's quotes, which only carry a previous close", () => {
    // Shape returned by the live API on the free plan, 5 Nov 2026.
    const free = { code: "MEBL.KAR", timestamp: "NA" as const, gmtoffset: 0, open: "NA" as const, high: "NA" as const, low: "NA" as const, close: "NA" as const, volume: "NA" as const, previousClose: 538.48, change: "NA" as const, change_p: "NA" as const };
    expect(parseRealtime([free])).toEqual([]);
  });

  it("handles a missing previous close", () => {
    const [q] = parseRealtime({ ...REALTIME_ONE, previousClose: "NA" });
    expect(q.change).toBeNull();
    expect(q.changePct).toBeNull();
  });
});

describe("parseSymbols", () => {
  it("keeps stocks and ETFs, drops other instruments", () => {
    const list = parseSymbols([
      { Code: "OGDC", Name: "Oil & Gas Development", Type: "Common Stock" },
      { Code: "MZNPETF", Name: "Meezan Pakistan ETF", Type: "ETF" },
      { Code: "KSE100", Name: "KSE 100 Index", Type: "INDEX" },
    ]);
    expect(list).toEqual([
      { symbol: "OGDC", name: "Oil & Gas Development", sector: null, isEtf: false, isShariah: null },
      { symbol: "MZNPETF", name: "Meezan Pakistan ETF", sector: null, isEtf: true, isShariah: null },
    ]);
  });
});

describe("parseEod", () => {
  it("maps candles and drops malformed rows", () => {
    const candles = parseEod("HBL", [
      { date: "2026-11-04", open: 170, high: 172, low: 169.5, close: 171.25, volume: 900000 },
      { date: "bad", open: 1, high: 1, low: 1, close: 1, volume: 1 },
    ]);
    expect(candles).toEqual([{ symbol: "HBL", date: "2026-11-04", open: "170", high: "172", low: "169.5", close: "171.25", volume: 900000 }]);
  });
});

describe("eodhdCallCost", () => {
  it("charges per ticker, as measured on the live API", () => {
    expect(eodhdCallCost("quotes", 5)).toBe(5);
    expect(eodhdCallCost("history", 3)).toBe(3);
    expect(eodhdCallCost("history")).toBe(1);
    expect(eodhdCallCost("symbols")).toBe(1);
  });
});

describe("readQuoteMode", () => {
  it("defaults to end of day (the free plan has no PSX intraday quotes)", () => {
    expect(readQuoteMode(undefined)).toBe("eod");
    expect(readQuoteMode(" ")).toBe("eod");
    expect(readQuoteMode("REALTIME")).toBe("realtime");
    expect(() => readQuoteMode("live")).toThrow(/EODHD_QUOTE_MODE/);
  });
});

describe("createEodhdSource", () => {
  function fakeClient(reply: (url: URL) => unknown) {
    const urls: URL[] = [];
    const client = {
      getJson: async (u: string) => {
        const url = new URL(u);
        urls.push(url);
        return reply(url);
      },
    } as unknown as PoliteClient;
    return { client, urls };
  }
  const NOW = () => new Date("2026-11-05T09:00:00Z");
  const budgetOf = (limit = 15, used = 0) => {
    const store = memoryBudgetStore(used ? { "eodhd:2026-11-05": used } : {});
    return { store, budget: createCallBudget(store, "eodhd", limit, NOW) };
  };

  it("requires an API key and a budget", () => {
    const { budget } = budgetOf();
    expect(() => createEodhdSource("", { budget })).toThrow(/EODHD_API_KEY/);
    expect(() => createEodhdSource("k", {} as never)).toThrow(/budget/);
  });

  it("is metered, and end of day by default", () => {
    const { budget } = budgetOf();
    const s = createEodhdSource("k", { budget, client: fakeClient(() => []).client });
    expect(s.metered).toBe(true);
    expect(s.quoteMode).toBe("eod");
    expect(createEodhdSource("k", { budget, mode: "realtime", client: fakeClient(() => []).client }).quoteMode).toBe("delayed");
    expect(s.getEodBulk).toBeUndefined();
  });

  it("batches real-time quotes and reserves one call per ticker", async () => {
    const symbols = Array.from({ length: QUOTE_BATCH_SIZE + 5 }, (_, i) => `S${i}`);
    const { client, urls } = fakeClient((url) => {
      const codes = [url.pathname.split("/").pop()!, ...(url.searchParams.get("s")?.split(",") ?? [])];
      return codes.map((code) => ({ ...REALTIME_ONE, code }));
    });
    const { store, budget } = budgetOf(100);
    const quotes = await createEodhdSource("k", { budget, client, mode: "realtime" }).getQuotes(symbols);
    expect(urls).toHaveLength(2);
    expect(urls[0].pathname).toBe("/api/real-time/S0.KAR");
    expect(urls[0].searchParams.get("s")!.split(",")).toHaveLength(QUOTE_BATCH_SIZE - 1);
    expect(urls[0].searchParams.get("api_token")).toBe("k");
    expect(urls[0].searchParams.get("fmt")).toBe("json");
    expect(quotes.map((q) => q.symbol)).toEqual(symbols);
    expect(store.counts["eodhd:2026-11-05"]).toBe(QUOTE_BATCH_SIZE + 5);
  });

  it("never sends a request the budget cannot cover", async () => {
    const { client, urls } = fakeClient(() => [REALTIME_ONE]);
    const { store, budget } = budgetOf(15, 13);
    const s = createEodhdSource("k", { budget, client, mode: "realtime" });
    await expect(s.getQuotes(["A", "B", "C"])).rejects.toBeInstanceOf(BudgetExceededError);
    expect(urls).toHaveLength(0);
    expect(store.counts["eodhd:2026-11-05"]).toBe(13);
    await s.getDailyHistory("OGDC", "2026-11-01", "2026-11-05");
    await s.getDailyHistory("MEBL", "2026-11-01", "2026-11-05");
    await expect(s.listSymbols()).rejects.toBeInstanceOf(BudgetExceededError);
    expect(urls).toHaveLength(2);
    expect(store.counts["eodhd:2026-11-05"]).toBe(15);
  });

  it("requests daily history with a date range for one call", async () => {
    const { client, urls } = fakeClient(() => []);
    const { store, budget } = budgetOf();
    await createEodhdSource("k", { budget, client }).getDailyHistory("ogdc", "2025-01-01", "2026-11-05");
    expect(urls[0].pathname).toBe("/api/eod/OGDC.KAR");
    expect(urls[0].searchParams.get("from")).toBe("2025-01-01");
    expect(urls[0].searchParams.get("to")).toBe("2026-11-05");
    expect(store.counts["eodhd:2026-11-05"]).toBe(1);
  });
});
