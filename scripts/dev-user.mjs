// Creates or deletes a confirmed local test user, without sending any email.
// The login is stored in .env.local (git-ignored) as DEV_USER_EMAIL / DEV_USER_PASSWORD.
// Run: npm run dev-user -- create   |   npm run dev-user -- delete
import { randomBytes } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const cmd = process.argv[2];

async function findUser(email) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

if (cmd === "create") {
  if (process.env.DEV_USER_EMAIL) {
    const existing = await findUser(process.env.DEV_USER_EMAIL);
    if (existing) {
      console.log("Dev user already exists. Login is in .env.local (DEV_USER_EMAIL / DEV_USER_PASSWORD).");
      process.exit(0);
    }
  }
  const email = process.env.DEV_USER_EMAIL ?? `dev-user-${randomBytes(3).toString("hex")}@example.test`;
  const password = process.env.DEV_USER_PASSWORD ?? randomBytes(15).toString("base64url");
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  if (!process.env.DEV_USER_EMAIL) {
    const env = readFileSync(".env.local", "utf8");
    appendFileSync(
      ".env.local",
      `${env.endsWith("\n") ? "" : "\n"}\n# Local test login created by scripts/dev-user.mjs\nDEV_USER_EMAIL=${email}\nDEV_USER_PASSWORD=${password}\n`,
    );
  }
  console.log("Dev user created. Login is in .env.local (DEV_USER_EMAIL / DEV_USER_PASSWORD).");
} else if (cmd === "delete") {
  const email = process.env.DEV_USER_EMAIL;
  if (!email) {
    console.log("No DEV_USER_EMAIL in .env.local.");
    process.exit(0);
  }
  const user = await findUser(email);
  if (!user) {
    console.log("Dev user not found (already deleted).");
    process.exit(0);
  }
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw error;
  console.log("Dev user and all their portfolios deleted. You can remove the DEV_USER_* lines from .env.local.");
} else {
  console.log("Usage: npm run dev-user -- create | delete");
  process.exit(1);
}
