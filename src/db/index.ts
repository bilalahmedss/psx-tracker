import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// PRIVILEGED connection: bypasses row-level security.
// Use ONLY in trusted server-side jobs (price poller, EOD job, imports).
// User-facing reads and writes must use src/lib/supabase/server.ts instead.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Missing DATABASE_URL");

// DATABASE_URL is the transaction pooler (port 6543), which does not
// support prepared statements, so prepare must be false.
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
