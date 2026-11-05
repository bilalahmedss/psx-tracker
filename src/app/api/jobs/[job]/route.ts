import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { endOfDay } from "@/jobs/end-of-day";
import { refreshPrices } from "@/jobs/refresh-prices";
import { rebuildSnapshots } from "@/jobs/snapshots";

// Job endpoints, called by the scheduler (Supabase pg_cron + pg_net in production,
// `npm run jobs:dev` locally). Protected by CRON_SECRET as a Bearer token.
//   GET|POST /api/jobs/prices      refresh prices when due (see src/lib/psx/refresh-policy.ts)
//   ?trigger=manual                (prices) the "Refresh prices" button: 5-minute cooldown, any time
//   GET|POST /api/jobs/eod         end-of-day candles + symbol sync
//   GET|POST /api/jobs/snapshots   rebuild daily value snapshots for changed portfolios
//   ?force=1                       ignore timing rules, never the daily call limit (snapshots: rebuild all)
//   ?date=YYYY-MM-DD               (eod only) store candles for a specific day

export const maxDuration = 60;

function authorised(request: NextRequest): "ok" | "unconfigured" | "denied" {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return "unconfigured";
  const header = request.headers.get("authorization") ?? "";
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected) ? "ok" : "denied";
}

async function handle(request: NextRequest, ctx: RouteContext<"/api/jobs/[job]">) {
  const auth = authorised(request);
  if (auth === "unconfigured") return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (auth === "denied") return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { job } = await ctx.params;
  const params = request.nextUrl.searchParams;
  const force = params.get("force") === "1";

  let result;
  if (job === "prices") {
    result = await refreshPrices({ force, trigger: params.get("trigger") === "manual" ? "manual" : "schedule" });
  } else if (job === "eod") {
    const date = params.get("date") ?? undefined;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
    result = await endOfDay({ force, date });
  } else if (job === "snapshots") {
    result = await rebuildSnapshots({ all: force });
  } else {
    return Response.json({ error: `Unknown job "${job}"` }, { status: 404 });
  }

  const status = result.status === "failed" ? 500 : result.status === "locked" ? 409 : 200;
  return Response.json(result, { status, headers: { "Cache-Control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
