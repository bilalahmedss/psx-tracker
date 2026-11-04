import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

// Server client for pages, server actions and route handlers.
// Uses the user's session cookie, so RLS always applies.
// Create a new one per request; never share it between requests.
export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabaseEnv();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
