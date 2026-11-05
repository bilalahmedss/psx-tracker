import "server-only";
import type { CallBudget } from "./budget";
import type { CalendarData } from "./calendar";
import { createDemoSource } from "./sources/demo";
import { createEodhdSource, readQuoteMode } from "./sources/eodhd";
import type { MarketDataSource, SourceId } from "./types";

// The only entry point for market data. Server-side only: never import from
// client components, and never call a provider from the browser.
//
// Choose the provider with MARKET_DATA_SOURCE=demo|eodhd (default: demo).

export function configuredSourceId(): SourceId {
  const id = (process.env.MARKET_DATA_SOURCE ?? "demo").trim().toLowerCase();
  if (id === "demo" || id === "eodhd") return id;
  throw new Error(`Unknown MARKET_DATA_SOURCE "${id}". Use "demo" or "eodhd".`);
}

let eodhd: { budget: CallBudget; source: MarketDataSource } | null = null;

/**
 * The configured source. Metered providers (EODHD) need the daily call budget,
 * which jobs build over api_usage (src/jobs/market-db.ts); there is no way to get
 * an EODHD source without one.
 */
export function getMarketSource(cal: CalendarData, budget?: CallBudget): MarketDataSource {
  const id = configuredSourceId();
  if (id === "eodhd") {
    if (!budget) throw new Error("EODHD needs the daily call budget");
    // Reuse one instance so its rate limiter is shared across requests.
    if (eodhd?.budget !== budget) {
      eodhd = {
        budget,
        source: createEodhdSource(process.env.EODHD_API_KEY ?? "", { budget, mode: readQuoteMode(process.env.EODHD_QUOTE_MODE) }),
      };
    }
    return eodhd.source;
  }
  return createDemoSource(cal);
}

export * from "./types";
export * from "./calendar";
export * from "./budget";
export { DEFAULT_TRACKED_SYMBOLS } from "./sources/demo-symbols";
