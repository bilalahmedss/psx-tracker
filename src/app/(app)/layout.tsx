import Link from "next/link";
import { Suspense } from "react";
import { BrandMark } from "@/components/brand";
import { HideAmountsToggle, ThemeToggle } from "@/components/display-toggles";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { signOut } from "../(auth)/actions";
import { BottomNav, SideNav } from "./nav";

const MORE_ID = "more-menu";

// Desktop (lg+): fixed left sidebar, content uses the full width up to 1280px.
// Mobile: slim top bar with display toggles, bottom nav, and a "More" sheet.
// Only the account bits read the session, so they stream in behind Suspense.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 border-r bg-sidebar px-3 py-5 lg:flex">
        <Link href="/home" className="flex items-center gap-2 px-3 font-semibold">
          <BrandMark />
        </Link>
        <SideNav />
        <div className="mt-auto flex flex-col gap-3 px-1">
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <HideAmountsToggle />
          </div>
          <Suspense fallback={<span className="h-8 animate-pulse rounded bg-muted" />}>
            <Account />
          </Suspense>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur lg:hidden">
          <Link href="/home" className="flex items-center gap-2 font-semibold">
            <BrandMark />
          </Link>
          <div className="ml-auto flex items-center">
            <ThemeToggle />
            <HideAmountsToggle />
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-6 lg:px-8 lg:pb-10 lg:pt-8">{children}</main>
      </div>

      {/* Mobile "More" sheet: a CSS-only toggle so it works before JS loads. */}
      <input id={MORE_ID} type="checkbox" className="peer sr-only" aria-hidden tabIndex={-1} />
      <label htmlFor={MORE_ID} aria-hidden className="fixed inset-0 z-40 hidden bg-black/40 peer-checked:block lg:!hidden" />
      <div className="fixed inset-x-0 bottom-0 z-50 hidden flex-col gap-3 rounded-t-2xl border-t bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg peer-checked:flex lg:!hidden">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">More</span>
          <label htmlFor={MORE_ID} className="cursor-pointer text-sm text-muted-foreground">
            Close
          </label>
        </div>
        <Suspense fallback={<span className="h-8 animate-pulse rounded bg-muted" />}>
          <Account />
        </Suspense>
      </div>

      <BottomNav moreId={MORE_ID} />
    </div>
  );
}

async function Account() {
  const { email } = await requireUser();
  return (
    <div className="flex flex-col gap-2">
      {email ? (
        <span className="truncate px-2 text-xs text-muted-foreground" title={email}>
          {email}
        </span>
      ) : null}
      <form action={signOut}>
        <Button type="submit" variant="outline" size="sm" className="w-full">
          Sign out
        </Button>
      </form>
    </div>
  );
}
