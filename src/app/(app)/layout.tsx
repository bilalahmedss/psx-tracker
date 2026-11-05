import Link from "next/link";
import { Suspense } from "react";
import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { signOut } from "../(auth)/actions";

// The header shell is static; only the user menu reads the session, so it
// streams in behind a Suspense boundary. Each page verifies the session itself.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-6 px-4">
          <Link href="/portfolios" className="flex items-center gap-2 font-semibold">
            <BrandMark />
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/portfolios" className="text-muted-foreground hover:text-foreground">
              Portfolios
            </Link>
            <Link href="/market" className="text-muted-foreground hover:text-foreground">
              Market
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Suspense fallback={<span className="h-4 w-32 animate-pulse rounded bg-muted" />}>
              <UserMenu />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}

async function UserMenu() {
  const { email } = await requireUser();
  return (
    <>
      {email ? <span className="hidden text-sm text-muted-foreground sm:inline">{email}</span> : null}
      <form action={signOut}>
        <Button type="submit" variant="ghost" size="sm">
          Sign out
        </Button>
      </form>
    </>
  );
}
