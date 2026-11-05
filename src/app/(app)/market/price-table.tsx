"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { changeTone, formatPct, formatPktAsOf, formatPrice, formatSigned, formatVolume } from "@/lib/format";
import type { QuoteRow } from "@/lib/market/queries";

const toneClass = {
  up: "text-emerald-600 dark:text-emerald-400",
  down: "text-red-600 dark:text-red-400",
  flat: "text-muted-foreground",
} as const;

export function PriceTable({ rows }: { rows: QuoteRow[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.sector?.toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <div className="flex flex-col gap-3">
      <Input
        type="search"
        placeholder="Search symbol, company or sector"
        aria-label="Search prices"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-sm"
      />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Symbol</th>
              <th className="px-3 py-2 text-right font-medium">Price (Rs)</th>
              <th className="px-3 py-2 text-right font-medium">Change</th>
              <th className="px-3 py-2 text-right font-medium">Day range</th>
              <th className="px-3 py-2 text-right font-medium">Volume</th>
              <th className="px-3 py-2 text-right font-medium">As of (PKT)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const tone = toneClass[changeTone(r.change)];
              return (
                <tr key={r.symbol} className="border-t">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5 font-medium">
                      {r.symbol}
                      {r.isShariah ? (
                        <span title="Shariah-compliant" className="rounded bg-emerald-600/10 px-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                          S
                        </span>
                      ) : null}
                    </div>
                    <div className="max-w-56 truncate text-xs text-muted-foreground">{r.name}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    {formatPrice(r.price)}
                    {r.delayed || r.endOfDay ? (
                      <span className="ml-1 text-[10px] font-normal text-muted-foreground">{r.endOfDay ? "close" : "delayed"}</span>
                    ) : null}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${tone}`}>
                    {formatSigned(r.change)} <span className="text-xs">({formatPct(r.changePct)})</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatPrice(r.low)} – {formatPrice(r.high)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatVolume(r.volume)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatPktAsOf(r.asOf)}</td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  No symbols match &ldquo;{query}&rdquo;.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {filtered.length} of {rows.length} symbols. This page shows the latest stored prices and checks for new ones every minute.
      </p>
    </div>
  );
}
