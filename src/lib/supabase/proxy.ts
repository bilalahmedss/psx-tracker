import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";
import { HOME_PATH, isPublicPath } from "@/lib/safe-redirect";

// Refreshes the Supabase auth session on each request and writes updated
// cookies to both the request and the response. Also does an optimistic
// redirect for signed-out visitors; pages still verify with requireUser().
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
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  const redirectTo = (path: string) => {
    const target = request.nextUrl.clone();
    const [p, q] = path.split("?");
    target.pathname = p;
    target.search = q ? `?${q}` : "";
    const res = NextResponse.redirect(target);
    // Keep any refreshed auth cookies.
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  if (!signedIn && !isPublicPath(pathname)) {
    return redirectTo(`/login?next=${encodeURIComponent(pathname + search)}`);
  }
  if (signedIn && (pathname === "/login" || pathname === "/")) {
    return redirectTo(HOME_PATH);
  }

  return response;
}
