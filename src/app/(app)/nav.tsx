"use client";

import { BarChart3, Briefcase, Home, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/portfolios", label: "Portfolios", icon: Briefcase },
  { href: "/market", label: "Market", icon: BarChart3 },
] as const;

type IsActive = (href: string) => boolean;
const none: IsActive = () => false;

function SideLinks({ isActive }: { isActive: IsActive }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            isActive(href) ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}

function BottomLinks({ isActive, moreId }: { isActive: IsActive; moreId: string }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", isActive(href) ? "text-foreground" : "text-muted-foreground")}
        >
          <Icon className="size-5" aria-hidden />
          {label}
        </Link>
      ))}
      <label htmlFor={moreId} className="flex cursor-pointer flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground">
        <MoreHorizontal className="size-5" aria-hidden />
        More
      </label>
    </nav>
  );
}

function useIsActive(): IsActive {
  const pathname = usePathname();
  return (href) => pathname === href || pathname.startsWith(`${href}/`);
}

function ActiveSideLinks() {
  return <SideLinks isActive={useIsActive()} />;
}

function ActiveBottomLinks({ moreId }: { moreId: string }) {
  return <BottomLinks isActive={useIsActive()} moreId={moreId} />;
}

// usePathname() is request data: inside Suspense the links prerender in the
// static shell and the active highlight streams in.
export function SideNav() {
  return (
    <Suspense fallback={<SideLinks isActive={none} />}>
      <ActiveSideLinks />
    </Suspense>
  );
}

export function BottomNav({ moreId }: { moreId: string }) {
  return (
    <Suspense fallback={<BottomLinks isActive={none} moreId={moreId} />}>
      <ActiveBottomLinks moreId={moreId} />
    </Suspense>
  );
}
