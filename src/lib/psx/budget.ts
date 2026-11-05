// Daily call budget for metered market-data providers (EODHD's free plan allows
// 20 calls a day). Every metered request reserves its cost first; if the
// reservation would pass the limit, the request is never sent.

export const DEFAULT_DAILY_LIMIT = 15;

export class BudgetExceededError extends Error {
  constructor(
    readonly provider: string,
    readonly needed: number,
    readonly used: number,
    readonly limit: number,
  ) {
    super(`Daily ${provider} limit reached: ${used} of ${limit} calls used, ${needed} more needed`);
    this.name = "BudgetExceededError";
  }
}

/** Where call counts live. `reserve` must be atomic: add `calls` only if the total stays within `limit`. */
export interface BudgetStore {
  /** Returns the new total, or null if the reservation would pass the limit. */
  reserve(provider: string, day: string, calls: number, limit: number): Promise<number | null>;
  used(provider: string, day: string): Promise<number>;
}

export interface CallBudget {
  readonly provider: string;
  readonly limit: number;
  /** Reserve `calls` before making a request. Throws BudgetExceededError instead of overspending. */
  spend(calls: number): Promise<void>;
  used(): Promise<number>;
  remaining(): Promise<number>;
}

/** Providers reset daily limits at midnight UTC, so count per UTC day. */
export function usageDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** EODHD_DAILY_LIMIT: a whole number of calls; blank or invalid means the default. */
export function readDailyLimit(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_DAILY_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`EODHD_DAILY_LIMIT must be a whole number of calls, got "${raw}"`);
  return n;
}

export function createCallBudget(store: BudgetStore, provider: string, limit: number, now: () => Date = () => new Date()): CallBudget {
  const used = () => store.used(provider, usageDay(now()));
  return {
    provider,
    limit,
    async spend(calls) {
      if (!Number.isInteger(calls) || calls < 0) throw new Error(`Invalid call count ${calls}`);
      if (calls === 0) return;
      const day = usageDay(now());
      const total = calls > limit ? null : await store.reserve(provider, day, calls, limit);
      if (total === null) throw new BudgetExceededError(provider, calls, await store.used(provider, day), limit);
    },
    used,
    async remaining() {
      return Math.max(0, limit - (await used()));
    },
  };
}

/** In-memory store for tests and scripts. */
export function memoryBudgetStore(initial: Record<string, number> = {}): BudgetStore & { counts: Record<string, number> } {
  const counts = { ...initial };
  const key = (p: string, d: string) => `${p}:${d}`;
  return {
    counts,
    async reserve(provider, day, calls, limit) {
      const k = key(provider, day);
      const next = (counts[k] ?? 0) + calls;
      if (next > limit) return null;
      counts[k] = next;
      return next;
    },
    async used(provider, day) {
      return counts[key(provider, day)] ?? 0;
    },
  };
}
