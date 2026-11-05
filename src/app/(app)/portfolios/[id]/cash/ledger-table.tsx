"use client";

import Link from "next/link";
import { useState } from "react";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Explain } from "@/components/explain";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Tone } from "@/lib/format";
import type { EntryFormState } from "../entry-actions";

export type LedgerRow = {
  key: string;
  isoDate: string;
  date: string;
  kind: string;
  description: string;
  amount: string;
  amountTone: Tone;
  balance: string;
  negativeBalance: boolean;
  editHref: string;
  deleteAction: ((prev: EntryFormState, fd: FormData) => Promise<EntryFormState>) | null;
  manual: boolean;
};

const toneClass: Record<Tone, string> = {
  up: "text-emerald-600 dark:text-emerald-400",
  down: "text-red-600 dark:text-red-400",
  flat: "text-muted-foreground",
};

export function LedgerTable({
  portfolioId,
  rows,
  returnTo,
  summary,
}: {
  portfolioId: string;
  rows: LedgerRow[];
  returnTo: string;
  summary: { balance: string; negative: boolean; totalIn: string; totalOut: string };
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const shown = rows.filter((r) => (!from || r.isoDate >= from) && (!to || r.isoDate <= to));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <dl className="flex flex-wrap gap-6 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Balance</dt>
            <dd className={`text-lg font-semibold tabular-nums money ${summary.negative ? "text-red-600 dark:text-red-400" : ""}`}>Rs {summary.balance}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Money in</dt>
            <dd className="font-medium tabular-nums money">Rs {summary.totalIn}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Money out</dt>
            <dd className="font-medium tabular-nums money">Rs {summary.totalOut}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <Label htmlFor="from" className="text-xs">
              From
            </Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="to" className="text-xs">
              To
            </Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          <Link href={`/portfolios/${portfolioId}/cash/new`} className={buttonVariants({ size: "sm" })}>
            Add entry
          </Link>
        </div>
      </div>

      {summary.negative ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          The balance is negative: trades paid from cash cost more than the deposits recorded. Add your deposits, or untick &ldquo;Pay from
          portfolio cash&rdquo; on trades funded elsewhere.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No cash movements yet. Add a deposit to start tracking your broker cash.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Details</th>
                <th className="px-3 py-2 text-right font-medium">Amount (Rs)</th>
                <th className="px-3 py-2 text-right font-medium">Balance (Rs)</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.key} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                  <td className="px-3 py-2">
                    {r.kind}
                    {r.manual ? null : <span className="ml-1 text-[10px] text-muted-foreground">auto</span>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.description}</td>
                  <td className={`px-3 py-2 text-right tabular-nums money ${toneClass[r.amountTone]}`}>{r.amount}</td>
                  <td className={`px-3 py-2 text-right font-medium tabular-nums money ${r.negativeBalance ? "text-red-600 dark:text-red-400" : ""}`}>{r.balance}</td>
                  <td className="px-3 py-1 text-right whitespace-nowrap">
                    <Link href={r.editHref} className={buttonVariants({ size: "sm", variant: "ghost" })}>
                      {r.manual ? "Edit" : "View"}
                    </Link>
                    {r.deleteAction ? <ConfirmDelete action={r.deleteAction} confirmText="Delete this cash entry?" returnTo={returnTo} /> : null}
                  </td>
                </tr>
              ))}
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    No entries in this date range.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      <Explain>
        <p>
          Deposits, withdrawals, deductions and adjustments are entered here. Buys, sells and dividends marked as affecting cash are added
          automatically (&ldquo;auto&rdquo;), so editing a trade updates the ledger. The balance runs in date order; the filter only hides rows.
        </p>
        <p>Buys subtract trade value plus all charges; sells add trade value minus charges; dividends add the net amount.</p>
      </Explain>
    </div>
  );
}
