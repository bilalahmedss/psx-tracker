import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

// Refreshes the Supabase auth session on each request and writes
// updated cookies to both the request and the response.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Before .env.local is filled in, let pages load instead of crashing.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    return response;
  }
  const { url, publishableKey } = getSupabaseEnv();

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Do not put code between createServerClient and getClaims():
  // it revalidates the token and refreshes it when needed.
  await supabase.auth.getClaims();

  return response;
}
