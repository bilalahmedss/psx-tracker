import { describe, expect, it } from "vitest";
import type { PoliteClient } from "../http";
import { QUOTE_BATCH_SIZE, createEodhdSource, fromTicker, parseEod, parseRealtime, parseSymbols, toTicker } from "./eodhd";

// Sample payloads shaped like EODHD's documented responses. They have not yet
// been checked against the live API; re-capture them once an API key is set up.
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

  it("requires an API key", () => {
    expect(() => createEodhdSource("")).toThrow(/EODHD_API_KEY/);
  });

  it("is marked delayed", () => {
    const s = createEodhdSource("k", fakeClient(() => []).client);
    expect(s.delayed).toBe(true);
  });

  it("batches real-time quotes", async () => {
    const symbols = Array.from({ length: QUOTE_BATCH_SIZE + 5 }, (_, i) => `S${i}`);
    const { client, urls } = fakeClient((url) => {
      const codes = [url.pathname.split("/").pop()!, ...(url.searchParams.get("s")?.split(",") ?? [])];
      return codes.map((code) => ({ ...REALTIME_ONE, code }));
    });
    const quotes = await createEodhdSource("k", client).getQuotes(symbols);
    expect(urls).toHaveLength(2);
    expect(urls[0].pathname).toBe("/api/real-time/S0.KAR");
    expect(urls[0].searchParams.get("s")!.split(",")).toHaveLength(QUOTE_BATCH_SIZE - 1);
    expect(urls[0].searchParams.get("api_token")).toBe("k");
    expect(urls[0].searchParams.get("fmt")).toBe("json");
    expect(quotes.map((q) => q.symbol)).toEqual(symbols);
  });

  it("requests daily history with a date range", async () => {
    const { client, urls } = fakeClient(() => []);
    await createEodhdSource("k", client).getDailyHistory("ogdc", "2025-01-01", "2026-11-05");
    expect(urls[0].pathname).toBe("/api/eod/OGDC.KAR");
    expect(urls[0].searchParams.get("from")).toBe("2025-01-01");
    expect(urls[0].searchParams.get("to")).toBe("2026-11-05");
  });

  it("uses the bulk endpoint for end-of-day", async () => {
    const { client, urls } = fakeClient(() => [
      { code: "OGDC", exchange_short_name: "KAR", date: "2026-11-05", open: 230, high: 233, low: 229, close: 232, volume: 10 },
    ]);
    const candles = await createEodhdSource("k", client).getEodBulk!("2026-11-05");
    expect(urls[0].pathname).toBe("/api/eod-bulk-last-day/KAR");
    expect(candles[0]).toMatchObject({ symbol: "OGDC", close: "232" });
  });
});
