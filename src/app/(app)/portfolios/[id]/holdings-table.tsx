"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Tone } from "@/lib/format";

export type HoldingRow = {
  symbol: string;
  name: string;
  shares: string;
  avgCost: string;
  price: string | null;
  delayed: boolean;
  marketValue: string | null;
  unrealized: string;
  unrealizedPct: string;
  unrealizedTone: Tone;
  dayChange: string;
  dayTone: Tone;
  weight: string;
  sort: Record<SortKey, number | string>;
};

type SortKey = "symbol" | "shares" | "avgCost" | "price" | "marketValue" | "unrealized" | "unrealizedPct" | "dayChange";

const toneClass: Record<Tone, string> = {
  up: "text-emerald-600 dark:text-emerald-400",
  down: "text-red-600 dark:text-red-400",
  flat: "text-muted-foreground",
};

const COLUMNS: { key: SortKey; label: string; right?: boolean }[] = [
  { key: "symbol", label: "Symbol" },
  { key: "shares", label: "Shares", right: true },
  { key: "avgCost", label: "Avg cost", right: true },
  { key: "price", label: "Price", right: true },
  { key: "marketValue", label: "Value", right: true },
  { key: "unrealized", label: "Unrealized P&L", right: true },
  { key: "dayChange", label: "Today", right: true },
];

export function HoldingsTable({ portfolioId, rows }: { portfolioId: string; rows: HoldingRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "marketValue", dir: -1 });
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const x = a.sort[sort.key];
        const y = b.sort[sort.key];
        const c = typeof x === "string" ? x.localeCompare(String(y)) : (x as number) - (y as number);
        return c * sort.dir || a.symbol.localeCompare(b.symbol);
      }),
    [rows, sort],
  );

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            {COLUMNS.map((c) => (
              <th key={c.key} className={`px-3 py-2 font-medium ${c.right ? "text-right" : "text-left"}`} aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                  onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : c.key === "symbol" ? 1 : -1 }))}
                >
                  {c.label}
                  <span aria-hidden className="text-[10px]">
                    {sort.key === c.key ? (sort.dir === 1 ? "▲" : "▼") : ""}
                  </span>
                </button>
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium">Weight</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.symbol} className="border-t hover:bg-muted/30">
              <td className="px-3 py-2">
                <Link href={`/portfolios/${portfolioId}/holdings/${encodeURIComponent(r.symbol)}`} className="font-medium hover:underline">
                  {r.symbol}
                </Link>
                <div className="max-w-48 truncate text-xs text-muted-foreground">{r.name}</div>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{r.shares}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.avgCost}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.price ?? <span className="text-muted-foreground">No price</span>}
                {r.price && r.delayed ? <span className="ml-1 text-[10px] text-muted-foreground">delayed</span> : null}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{r.marketValue ?? "-"}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${toneClass[r.unrealizedTone]}`}>
                {r.unrealized} <span className="text-xs">({r.unrealizedPct})</span>
              </td>
              <td className={`px-3 py-2 text-right tabular-nums ${toneClass[r.dayTone]}`}>{r.dayChange}</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.weight}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
