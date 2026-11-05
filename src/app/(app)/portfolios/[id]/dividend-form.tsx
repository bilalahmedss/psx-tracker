"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { FormNotice } from "@/components/auth-shell";
import { FormField, fieldProps } from "@/components/form-field";
import { SymbolCombobox, type SecurityOption } from "@/components/symbol-combobox";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { defaultWhtRate } from "@/lib/engine/dividends";
import { dec, paisa } from "@/lib/engine/money";
import { statusOn } from "@/lib/engine/tax-status";
import type { TaxStatusPeriod } from "@/lib/engine/types";
import { formatPrice } from "@/lib/format";
import { isDecimalString } from "@/lib/portfolio/rates";
import type { EntryFormState } from "./entry-actions";

export type DividendFormValues = {
  symbol: string;
  paidOn: string;
  shares: string;
  dps: string;
  gross: string;
  whtPct: string; // percent, for the auto WHT
  wht: string;
  zakat: string;
  affectsCash: boolean;
  note: string;
};

const ok = isDecimalString;

export function DividendForm({
  action,
  securities,
  held,
  taxHistory,
  initial,
  cancelHref,
  submitLabel,
  editing = false,
  returnTo,
}: {
  /** Where to go after saving. */
  returnTo?: string;
  action: (prev: EntryFormState, fd: FormData) => Promise<EntryFormState>;
  securities: SecurityOption[];
  held: Record<string, string>;
  taxHistory: TaxStatusPeriod[];
  initial: DividendFormValues;
  cancelHref: string;
  submitLabel: string;
  editing?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [v, setV] = useState(initial);
  // Gross and WHT follow shares x DPS and the rate until typed over.
  const [grossEdited, setGrossEdited] = useState(editing && !initial.dps);
  const [whtEdited, setWhtEdited] = useState(editing);
  const errors = state?.fieldErrors ?? {};

  const status = /^\d{4}-\d{2}-\d{2}$/.test(v.paidOn) ? statusOn(taxHistory, v.paidOn) : "filer";

  const recompute = (next: DividendFormValues, gEdited: boolean, wEdited: boolean): DividendFormValues => {
    const out = { ...next };
    if (!gEdited && ok(out.shares) && ok(out.dps)) out.gross = paisa(dec(out.shares).mul(out.dps)).toFixed(2);
    if (!wEdited && ok(out.gross) && ok(out.whtPct)) out.wht = paisa(dec(out.gross).mul(dec(out.whtPct).div(100))).toFixed(2);
    return out;
  };

  const set = <K extends keyof DividendFormValues>(key: K, value: DividendFormValues[K]) =>
    setV((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "symbol" && !editing && typeof value === "string" && held[value]) next.shares = held[value];
      if (key === "paidOn" && !whtEdited && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        next.whtPct = defaultWhtRate(statusOn(taxHistory, value)).mul(100).toFixed();
      }
      return recompute(next, grossEdited || key === "gross", whtEdited || key === "wht");
    });

  const net = useMemo(() => {
    if (![v.gross, v.wht || "0", v.zakat || "0"].every(ok)) return null;
    return dec(v.gross).minus(v.wht || "0").minus(v.zakat || "0");
  }, [v]);

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <FormNotice error={state?.error} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <Card>
        <CardContent className="grid gap-4 pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Stock" name="symbol" error={errors.symbol} hint={v.symbol && held[v.symbol] ? `You hold ${formatPrice(held[v.symbol], 0)} shares` : undefined}>
              <SymbolCombobox
                id="symbol"
                name="symbol"
                options={securities}
                value={v.symbol}
                onChange={(s) => set("symbol", s)}
                invalid={Boolean(errors.symbol)}
                autoFocus={!initial.symbol}
              />
            </FormField>
            <FormField label="Payment date" name="paidOn" error={errors.paidOn}>
              <Input {...fieldProps("paidOn", errors)} type="date" value={v.paidOn} onChange={(e) => set("paidOn", e.target.value)} />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Shares entitled" name="shares" error={errors.shares}>
              <Input {...fieldProps("shares", errors)} inputMode="numeric" value={v.shares} onChange={(e) => set("shares", e.target.value)} />
            </FormField>
            <FormField label="Dividend per share" name="dps" prefix="Rs" error={errors.dps} hint="Optional if you enter gross">
              <Input {...fieldProps("dps", errors)} inputMode="decimal" value={v.dps} onChange={(e) => set("dps", e.target.value)} />
            </FormField>
            <FormField label="Gross dividend" name="gross" prefix="Rs" error={errors.gross} hint={grossEdited ? "Entered manually" : "Shares × dividend per share"}>
              <Input
                {...fieldProps("gross", errors)}
                inputMode="decimal"
                value={v.gross}
                onChange={(e) => {
                  setGrossEdited(true);
                  set("gross", e.target.value);
                }}
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Withholding tax rate" name="whtPct" suffix="%" hint={`Default for a ${status === "filer" ? "filer" : "non-filer"} on this date`}>
              <Input
                id="whtPct"
                inputMode="decimal"
                value={v.whtPct}
                onChange={(e) => {
                  setWhtEdited(false);
                  setV((p) => recompute({ ...p, whtPct: e.target.value }, grossEdited, false));
                }}
              />
            </FormField>
            <FormField label="Withholding tax" name="wht" prefix="Rs" error={errors.wht} hint={whtEdited ? "Entered manually" : undefined}>
              <Input
                {...fieldProps("wht", errors)}
                inputMode="decimal"
                value={v.wht}
                onChange={(e) => {
                  setWhtEdited(true);
                  set("wht", e.target.value);
                }}
              />
            </FormField>
            <FormField label="Zakat deducted" name="zakat" prefix="Rs" error={errors.zakat} hint="If deducted at source">
              <Input {...fieldProps("zakat", errors)} inputMode="decimal" placeholder="0" value={v.zakat} onChange={(e) => set("zakat", e.target.value)} />
            </FormField>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="affectsCash" checked={v.affectsCash} onChange={(e) => set("affectsCash", e.target.checked)} className="size-4 accent-primary" />
            Add to portfolio cash
            <span className="text-xs text-muted-foreground">(PSX dividends are usually paid to your bank, not your broker)</span>
          </label>

          <FormField label="Note (optional)" name="note" error={errors.note}>
            <Input {...fieldProps("note", errors)} maxLength={200} value={v.note} onChange={(e) => set("note", e.target.value)} />
          </FormField>

          {net ? (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
              Net received: <span className="font-semibold tabular-nums">Rs {formatPrice(net.toFixed())}</span>
            </p>
          ) : null}
        </CardContent>
      </Card>
      <div className="flex justify-end gap-3">
        <Link href={cancelHref} className={buttonVariants({ variant: "ghost" })}>
          Cancel
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
