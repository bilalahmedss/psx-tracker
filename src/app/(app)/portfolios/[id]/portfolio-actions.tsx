"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { activeAction, type PortfolioAction } from "./active-action";

const ACTIONS: { id: PortfolioAction; label: string; href: (base: string) => string }[] = [
  { id: "trade", label: "Add trade", href: (b) => `${b}/trades/new?type=buy` },
  { id: "dividend", label: "Add dividend", href: (b) => `${b}/dividends/new` },
  { id: "cash", label: "Cash entry", href: (b) => `${b}/cash/new` },
  { id: "import", label: "Import CSV", href: (b) => `${b}/import` },
];

function Buttons({ portfolioId, active }: { portfolioId: string; active: PortfolioAction | null }) {
  const base = `/portfolios/${portfolioId}`;
  return (
    <>
      {ACTIONS.map((a) => (
        <Link
          key={a.id}
          href={a.href(base)}
          aria-current={active === a.id ? "page" : undefined}
          className={buttonVariants({ size: "sm", variant: active === a.id ? "default" : "outline" })}
        >
          {a.label}
        </Link>
      ))}
    </>
  );
}

function ActiveButtons({ portfolioId }: { portfolioId: string }) {
  return <Buttons portfolioId={portfolioId} active={activeAction(usePathname(), portfolioId)} />;
}

/** Header actions; the one for the current page is highlighted. */
export function PortfolioActions({ portfolioId }: { portfolioId: string }) {
  return (
    <Suspense fallback={<Buttons portfolioId={portfolioId} active={null} />}>
      <ActiveButtons portfolioId={portfolioId} />
    </Suspense>
  );
}

/** Settings link, highlighted on the settings page. */
export function SettingsLink({ portfolioId }: { portfolioId: string }) {
  return (
    <Suspense fallback={<SettingsButton portfolioId={portfolioId} active={false} />}>
      <ActiveSettings portfolioId={portfolioId} />
    </Suspense>
  );
}

function ActiveSettings({ portfolioId }: { portfolioId: string }) {
  return <SettingsButton portfolioId={portfolioId} active={activeAction(usePathname(), portfolioId) === "settings"} />;
}

function SettingsButton({ portfolioId, active }: { portfolioId: string; active: boolean }) {
  return (
    <Link
      href={`/portfolios/${portfolioId}/edit`}
      aria-current={active ? "page" : undefined}
      className={buttonVariants({ size: "sm", variant: active ? "default" : "ghost" })}
    >
      Settings
    </Link>
  );
}
