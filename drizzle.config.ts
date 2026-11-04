import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

// Migrations use DIRECT_URL (session pooler or direct, port 5432),
// not the transaction pooler.
const url = process.env.DIRECT_URL;
if (!url) throw new Error("Missing DIRECT_URL in .env.local");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  schemaFilter: ["public"],
  // Supabase manages its own roles (authenticated, anon, service_role).
  entities: { roles: { provider: "supabase" } },
  strict: true,
  verbose: true,
});
