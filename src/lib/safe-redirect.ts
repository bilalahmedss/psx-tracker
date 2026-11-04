/** Default page after sign-in. */
export const HOME_PATH = "/portfolios";

/**
 * Only allow same-site relative paths as post-login redirects, so a crafted
 * ?next= link can't bounce users to another site.
 */
export function safeNext(next: string | null | undefined, fallback = HOME_PATH): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\r\n\t]/.test(next)) return fallback;
  return next;
}

/** Paths a signed-out visitor may open. Everything else requires a session. */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/forgot-password" ||
    pathname.startsWith("/auth/")
  );
}
