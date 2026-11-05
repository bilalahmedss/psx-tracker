"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function PortfolioTabs({ id }: { id: string }) {
  const pathname = usePathname();
  const base = `/portfolios/${id}`;
  const tabs = [
    { href: base, label: "Holdings", active: pathname === base || pathname.startsWith(`${base}/holdings`) },
    { href: `${base}/history`, label: "History", active: pathname.startsWith(`${base}/history`) || pathname.startsWith(`${base}/trades`) },
    { href: `${base}/dividends`, label: "Dividends", active: pathname.startsWith(`${base}/dividends`) },
    { href: `${base}/cash`, label: "Cash", active: pathname.startsWith(`${base}/cash`) },
  ];
  return (
    <nav aria-label="Portfolio sections" className="flex gap-1 overflow-x-auto border-b">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            t.active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
