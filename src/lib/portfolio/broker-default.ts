import type { BrokerOption } from "./queries";

/** Preselected for a new portfolio when the user has none with a broker yet. */
export const DEFAULT_BROKER_NAME = "Chase Securities (Nafa)";

/**
 * The broker a new portfolio starts with: the first broker found on the user's
 * portfolios (default portfolio first, then newest first), else DEFAULT_BROKER_NAME.
 * Null if neither exists.
 */
export function preferredBroker(brokers: BrokerOption[], recentBrokerNames: (string | null)[]): BrokerOption | null {
  for (const name of recentBrokerNames) {
    const b = name ? brokers.find((x) => x.name === name) : undefined;
    if (b) return b;
  }
  return brokers.find((b) => b.name === DEFAULT_BROKER_NAME) ?? null;
}
