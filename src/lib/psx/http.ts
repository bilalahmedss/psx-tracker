// Polite HTTP client for market-data providers: one request at a time, a minimum
// gap between requests, timeouts, and exponential backoff on 429 / 5xx / network
// errors (honouring Retry-After). Secrets in query strings are redacted from errors.

export type PoliteClientOptions = {
  /** Minimum gap between the start of consecutive requests. */
  minIntervalMs: number;
  maxRetries?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  timeoutMs?: number;
  userAgent?: string;
  /** Query parameters to hide in error messages (e.g. api_token). */
  secretParams?: string[];
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export class SourceError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "SourceError";
  }
}

export const DEFAULT_USER_AGENT = "psx-tracker/0.1 (personal portfolio tracker; low-volume; server-side)";

export function redactUrl(url: string, secretParams: string[]): string {
  try {
    const u = new URL(url);
    for (const p of secretParams) if (u.searchParams.has(p)) u.searchParams.set(p, "REDACTED");
    return u.toString();
  } catch {
    return "[invalid url]";
  }
}

function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

export class PoliteClient {
  private queue: Promise<unknown> = Promise.resolve();
  private lastStart = -Infinity;
  private readonly o: Required<Omit<PoliteClientOptions, "fetchImpl" | "sleep" | "now">> & {
    fetchImpl: typeof fetch;
    sleep: (ms: number) => Promise<void>;
    now: () => number;
  };

  constructor(options: PoliteClientOptions) {
    this.o = {
      maxRetries: 3,
      baseBackoffMs: 1000,
      maxBackoffMs: 60_000,
      timeoutMs: 15_000,
      userAgent: DEFAULT_USER_AGENT,
      secretParams: [],
      fetchImpl: (...args) => fetch(...args),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      now: () => Date.now(),
      ...options,
    };
  }

  /** GET a URL and parse JSON. Requests are serialised through one queue. */
  getJson<T>(url: string): Promise<T> {
    const run = this.queue.then(() => this.request<T>(url));
    // Keep the queue alive even if this request fails.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async waitTurn() {
    const wait = this.lastStart + this.o.minIntervalMs - this.o.now();
    if (wait > 0) await this.o.sleep(wait);
    this.lastStart = this.o.now();
  }

  private async request<T>(url: string): Promise<T> {
    const safeUrl = redactUrl(url, this.o.secretParams);
    let lastError: SourceError | null = null;

    for (let attempt = 0; attempt <= this.o.maxRetries; attempt++) {
      await this.waitTurn();
      let res: Response;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.o.timeoutMs);
      try {
        res = await this.o.fetchImpl(url, {
          headers: { "User-Agent": this.o.userAgent, Accept: "application/json" },
          signal: controller.signal,
          cache: "no-store",
        });
      } catch (e) {
        lastError = new SourceError(
          `Request failed for ${safeUrl}: ${e instanceof Error && e.name === "AbortError" ? "timed out" : "network error"}`,
          null,
        );
        await this.backoff(attempt, null);
        continue;
      } finally {
        clearTimeout(timer);
      }

      if (res.ok) {
        try {
          return (await res.json()) as T;
        } catch {
          throw new SourceError(`Invalid JSON from ${safeUrl}`, res.status);
        }
      }

      lastError = new SourceError(`HTTP ${res.status} from ${safeUrl}`, res.status);
      if (res.status === 429 || res.status >= 500) {
        await this.backoff(attempt, retryAfterMs(res.headers.get("retry-after")));
        continue;
      }
      throw lastError; // 4xx other than 429: don't retry
    }
    throw lastError ?? new SourceError(`Request failed for ${safeUrl}`, null);
  }

  private async backoff(attempt: number, retryAfter: number | null) {
    if (attempt >= this.o.maxRetries) return;
    const ms = retryAfter ?? this.o.baseBackoffMs * 2 ** attempt;
    await this.o.sleep(Math.min(ms, this.o.maxBackoffMs));
  }
}
