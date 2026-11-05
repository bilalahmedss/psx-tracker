import { describe, expect, it } from "vitest";
import { PoliteClient, SourceError, redactUrl } from "./http";

function harness(responses: (Response | Error)[]) {
  let clock = 0;
  const sleeps: number[] = [];
  const starts: number[] = [];
  const urls: string[] = [];
  const fetchImpl = (async (url: string) => {
    starts.push(clock);
    urls.push(url);
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  const client = new PoliteClient({
    minIntervalMs: 500,
    baseBackoffMs: 1000,
    maxRetries: 2,
    secretParams: ["api_token"],
    fetchImpl,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
  });
  return { client, sleeps, starts, urls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("PoliteClient", () => {
  it("spaces requests by the minimum interval, one at a time", async () => {
    const h = harness([json({ a: 1 }), json({ b: 2 }), json({ c: 3 })]);
    const results = await Promise.all([h.client.getJson("https://x/1"), h.client.getJson("https://x/2"), h.client.getJson("https://x/3")]);
    expect(results).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
    expect(h.urls).toEqual(["https://x/1", "https://x/2", "https://x/3"]);
    expect(h.starts).toEqual([0, 500, 1000]);
  });

  it("retries 5xx with exponential backoff", async () => {
    const h = harness([json({}, 503), json({}, 502), json({ ok: true })]);
    await expect(h.client.getJson("https://x/a")).resolves.toEqual({ ok: true });
    expect(h.sleeps.filter((s) => s >= 1000)).toEqual([1000, 2000]);
  });

  it("honours Retry-After on 429", async () => {
    const h = harness([json({}, 429, { "retry-after": "3" }), json({ ok: 1 })]);
    await h.client.getJson("https://x/a");
    expect(h.sleeps).toContain(3000);
  });

  it("does not retry other 4xx errors", async () => {
    const h = harness([json({}, 403), json({ never: true })]);
    await expect(h.client.getJson("https://x/a")).rejects.toMatchObject({ status: 403 });
    expect(h.urls).toHaveLength(1);
  });

  it("gives up after max retries on network errors", async () => {
    const h = harness([new Error("ECONNRESET"), new Error("ECONNRESET"), new Error("ECONNRESET")]);
    await expect(h.client.getJson("https://x/a")).rejects.toBeInstanceOf(SourceError);
    expect(h.urls).toHaveLength(3);
  });

  it("never puts secrets in error messages", async () => {
    const h = harness([json({}, 401)]);
    const err = await h.client.getJson<unknown>("https://api.example/q?api_token=SUPERSECRET&fmt=json").then(
      () => new Error("expected a failure"),
      (e: Error) => e,
    );
    expect(String(err.message)).not.toContain("SUPERSECRET");
    expect(String(err.message)).toContain("REDACTED");
  });

  it("keeps working after a failed request", async () => {
    const h = harness([json({}, 404), json({ ok: 2 })]);
    await h.client.getJson("https://x/a").catch(() => undefined);
    await expect(h.client.getJson("https://x/b")).resolves.toEqual({ ok: 2 });
  });
});

describe("redactUrl", () => {
  it("replaces listed params only", () => {
    expect(redactUrl("https://a/b?api_token=abc&s=X", ["api_token"])).toBe("https://a/b?api_token=REDACTED&s=X");
  });
});
