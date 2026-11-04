import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side session check for protected pages and actions. The proxy also
 * redirects signed-out visitors, but that is only an optimistic check; this
 * one verifies the token. Returns a supabase-js client acting as the user,
 * so every query is subject to RLS.
 */
export async function requireUser() {
  // Token validation compares expiry with the current time, so this must run
  // at request time, never during prerender or prefetch.
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) redirect("/login");
  return {
    supabase,
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
  };
}

/** This request's origin, for building auth redirect URLs. */
export async function getOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
