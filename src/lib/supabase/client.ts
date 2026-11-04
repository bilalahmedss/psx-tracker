"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

// Browser client: acts as the signed-in user, so RLS always applies.
export function createClient() {
  const { url, publishableKey } = getSupabaseEnv();
  return createBrowserClient(url, publishableKey);
}
