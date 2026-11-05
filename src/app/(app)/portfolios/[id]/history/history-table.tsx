"use client";

import Link from "next/link";
import { useState } from "react";
import { ConfirmDelete } from "@/components/confirm-delete";
import { buttonVariants } from "@/components/ui/button";
import type { EntryFormState } from "../entry-actions";

export type HistoryRow = {
  id: string;
  date: string;
  type: "buy" | "sell";
  symbol: string;
  qty: string;
  price: string;
  charges: string;
  amount: string;
  affectsCash: boolean;
  note: string | null;
  editHref: string;
  deleteAction: (prev: EntryFormState, fd: FormData) => Promise<EntryFormState>;
};

const FILTERS = [
  { value: "all", label: "All" },
  { value: "buy", label: "Buys" },
  { value: "sell", label: "Sells" },
] as const;

export function HistoryTable({ rows, returnTo }: { rows: HistoryRow[]; returnTo: string }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const shown = filter === "all" ? rows : rows.filter((r) => r.type === filter);

  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No trades yet.</p>;

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Filter trades" className="inline-flex w-fit rounded-lg bg-muted p-1 text-sm">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={filter === f.value}
            onClick={() => setFilter(f.value)}
            className="rounded-md px-3 py-1 font-medium text-muted-foreground aria-checked:bg-background aria-checked:text-foreground aria-checked:shadow-sm"
          >
            {f.label} ({f.value === "all" ? rows.length : rows.filter((r) => r.type === f.value).length})
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Symbol</th>
              <th className="px-3 py-2 text-right font-medium">Shares</th>
              <th className="px-3 py-2 text-right font-medium">Price</th>
              <th className="px-3 py-2 text-right font-medium">Charges</th>
              <th className="px-3 py-2 text-right font-medium">Amount (Rs)</th>
              <th className="px-3 py-2 font-medium">Cash</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                <td className={`px-3 py-2 font-medium ${r.type === "buy" ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                  {r.type === "buy" ? "Buy" : "Sell"}
                </td>
                <td className="px-3 py-2">
                  <span className="font-medium">{r.symbol}</span>
                  {r.note ? <div className="max-w-48 truncate text-xs text-muted-foreground">{r.note}</div> : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.qty}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.price}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.charges}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{r.amount}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.affectsCash ? "Yes" : "No"}</td>
                <td className="px-3 py-1 text-right whitespace-nowrap">
                  <Link href={r.editHref} className={buttonVariants({ size: "sm", variant: "ghost" })}>
                    Edit
                  </Link>
                  <ConfirmDelete action={r.deleteAction} confirmText={`Delete this ${r.type} of ${r.qty} ${r.symbol}?`} returnTo={returnTo} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
