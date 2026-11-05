import "server-only";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { jobRuns } from "@/db/schema";

export type JobOutcome = { status: "success" | "skipped"; rows?: number; message?: string };
export type JobResult =
  | ({ job: string; runId?: string } & JobOutcome)
  | { job: string; status: "locked"; message: string }
  | { job: string; status: "failed"; message: string };

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

/**
 * Run a job with a row in job_runs. The partial unique index on running rows
 * means a second concurrent run gets "locked" instead of overlapping. Rows
 * stuck in "running" longer than staleMinutes (a crashed run) are cleared.
 */
export async function runJob(
  job: string,
  source: string,
  fn: () => Promise<JobOutcome>,
  staleMinutes = 10,
): Promise<JobResult> {
  await db
    .update(jobRuns)
    .set({ status: "failed", finishedAt: new Date(), message: "Stale run cleared (did not finish)" })
    .where(
      and(
        eq(jobRuns.job, job),
        eq(jobRuns.status, "running"),
        lt(jobRuns.startedAt, new Date(Date.now() - staleMinutes * 60_000)),
      ),
    );

  let runId: string;
  try {
    [{ id: runId }] = await db.insert(jobRuns).values({ job, source }).returning({ id: jobRuns.id });
  } catch (e) {
    if (isUniqueViolation(e)) return { job, status: "locked", message: "Another run is still in progress" };
    throw e;
  }

  try {
    const out = await fn();
    await db
      .update(jobRuns)
      .set({ status: out.status, rows: out.rows ?? null, message: out.message ?? null, finishedAt: new Date() })
      .where(eq(jobRuns.id, runId));
    return { job, runId, ...out };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[job:${job}] failed:`, message);
    await db.update(jobRuns).set({ status: "failed", message, finishedAt: new Date() }).where(eq(jobRuns.id, runId));
    return { job, status: "failed", message };
  }
}
