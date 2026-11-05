import "server-only";
import type { CalendarData } from "./calendar";
import { createDemoSource } from "./sources/demo";
import { createEodhdSource } from "./sources/eodhd";
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

let eodhd: MarketDataSource | null = null;

export function getMarketSource(cal: CalendarData): MarketDataSource {
  const id = configuredSourceId();
  if (id === "eodhd") {
    // Reuse one instance so its rate limiter is shared across requests.
    eodhd ??= createEodhdSource(process.env.EODHD_API_KEY ?? "");
    return eodhd;
  }
  return createDemoSource(cal);
}

export * from "./types";
export * from "./calendar";
export { DEFAULT_TRACKED_SYMBOLS } from "./sources/demo-symbols";
