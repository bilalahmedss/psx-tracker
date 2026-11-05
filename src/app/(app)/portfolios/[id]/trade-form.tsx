"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { FormNotice } from "@/components/auth-shell";
import { FormField, fieldProps } from "@/components/form-field";
import { SymbolCombobox, type SecurityOption } from "@/components/symbol-combobox";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { negativeCashWarning } from "@/lib/engine/cash";
import { computeFees, type FeeProfile } from "@/lib/engine/fees";
import type { EngineCashEntry, EngineDividend, EngineTxn } from "@/lib/engine/types";

export type CashContext = { txns: EngineTxn[]; dividends: EngineDividend[]; entries: EngineCashEntry[] };
import { dec } from "@/lib/engine/money";
import { formatPrice } from "@/lib/format";
import { isDecimalString } from "@/lib/portfolio/rates";
import type { EntryFormState } from "./entry-actions";

export type TradeFormValues = {
  type: "buy" | "sell";
  symbol: string;
  qty: string;
  price: string;
  tradeDate: string;
  fee: string;
  tax: string;
  otherCharges: string;
  affectsCash: boolean;
  note: string;
};

export function TradeForm({
  action,
  securities,
  feeProfile,
  initial,
  held,
  cancelHref,
  submitLabel,
  feesStartEdited = false,
  returnTo,
  cash,
  editingTxnId = null,
}: {
  /** Where to go after saving. */
  returnTo?: string;
  /** The portfolio's current cash inputs, to warn (not block) if this trade takes cash negative. */
  cash: CashContext;
  /** The trade being edited, so it is replaced rather than counted twice. */
  editingTxnId?: string | null;
  action: (prev: EntryFormState, fd: FormData) => Promise<EntryFormState>;
  securities: SecurityOption[];
  feeProfile: FeeProfile;
  initial: TradeFormValues;
  /** Shares currently held per symbol, to show next to a sell. */
  held: Record<string, string>;
  cancelHref: string;
  submitLabel: string;
  /** Editing a saved trade: keep its stored fees unless the user asks to recalculate. */
  feesStartEdited?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [v, setV] = useState(initial);
  const [feesEdited, setFeesEdited] = useState(feesStartEdited);
  const errors = state?.fieldErrors ?? {};

  const auto = useMemo(() => {
    if (!isDecimalString(v.qty) || !isDecimalString(v.price)) return null;
    const f = computeFees(feeProfile, v.qty, v.price);
    return { fee: f.commission.toFixed(2), tax: f.tax.toFixed(2) };
  }, [feeProfile, v.qty, v.price]);

  const set = <K extends keyof TradeFormValues>(key: K, value: TradeFormValues[K]) =>
    setV((prev) => {
      const next = { ...prev, [key]: value };
      // Keep commission and tax in step with quantity and price until the user edits them.
      if (!feesEdited && (key === "qty" || key === "price") && isDecimalString(next.qty) && isDecimalString(next.price)) {
        const f = computeFees(feeProfile, next.qty, next.price);
        next.fee = f.commission.toFixed(2);
        next.tax = f.tax.toFixed(2);
      }
      return next;
    });

  const total = useMemo(() => {
    if (![v.qty, v.price].every(isDecimalString)) return null;
    const charges = [v.fee, v.tax, v.otherCharges].map((x) => (isDecimalString(x) ? dec(x) : dec(0))).reduce((a, b) => a.plus(b));
    const gross = dec(v.qty).mul(v.price);
    return { gross, charges, net: v.type === "buy" ? gross.plus(charges) : gross.minus(charges) };
  }, [v]);

  const heldNow = v.symbol ? held[v.symbol] : undefined;

  const cashWarning = useMemo(() => {
    if (!v.affectsCash || !isDecimalString(v.qty) || !isDecimalString(v.price) || !/^\d{4}-\d{2}-\d{2}$/.test(v.tradeDate)) return null;
    const money = (x: string) => (isDecimalString(x) ? x : "0");
    return negativeCashWarning(cash, {
      replacesTxnId: editingTxnId,
      txns: [
        {
          id: editingTxnId ?? "proposed",
          symbol: v.symbol || "?",
          type: v.type,
          qty: v.qty,
          price: v.price,
          fee: money(v.fee),
          tax: money(v.tax),
          otherCharges: money(v.otherCharges),
          tradeDate: v.tradeDate,
          createdAt: "9999-12-31T00:00:00Z",
          affectsCash: true,
        },
      ],
    });
  }, [cash, editingTxnId, v]);

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <FormNotice error={state?.error} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <Card>
        <CardContent className="grid gap-4 pt-4">
          <div role="radiogroup" aria-label="Trade type" className="grid grid-cols-2 rounded-lg bg-muted p-1 text-sm">
            {(["buy", "sell"] as const).map((t) => (
              <label
                key={t}
                className={`cursor-pointer rounded-md px-3 py-1.5 text-center font-medium ${
                  v.type === t ? (t === "buy" ? "bg-emerald-600 text-white" : "bg-red-600 text-white") : "text-muted-foreground"
                }`}
              >
                <input type="radio" name="type" value={t} checked={v.type === t} onChange={() => set("type", t)} className="sr-only" />
                {t === "buy" ? "Buy" : "Sell"}
              </label>
            ))}
          </div>

          <FormField
            label="Stock"
            name="symbol"
            error={errors.symbol}
            hint={heldNow ? `You hold ${formatPrice(heldNow, 0)} shares` : v.type === "sell" && v.symbol ? "You hold none of this stock" : undefined}
          >
            <SymbolCombobox
              id="symbol"
              name="symbol"
              options={securities}
              value={v.symbol}
              onChange={(s) => set("symbol", s)}
              invalid={Boolean(errors.symbol)}
              describedBy={errors.symbol ? "symbol-error" : undefined}
              autoFocus={!initial.symbol}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Quantity" name="qty" error={errors.qty}>
              <Input {...fieldProps("qty", errors)} inputMode="numeric" value={v.qty} onChange={(e) => set("qty", e.target.value)} />
            </FormField>
            <FormField label="Price per share" name="price" prefix="Rs" error={errors.price}>
              <Input {...fieldProps("price", errors)} inputMode="decimal" value={v.price} onChange={(e) => set("price", e.target.value)} />
            </FormField>
            <FormField label="Trade date" name="tradeDate" error={errors.tradeDate}>
              <Input {...fieldProps("tradeDate", errors)} type="date" value={v.tradeDate} onChange={(e) => set("tradeDate", e.target.value)} />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Commission" name="fee" prefix="Rs" error={errors.fee}>
              <Input
                {...fieldProps("fee", errors)}
                inputMode="decimal"
                value={v.fee}
                onChange={(e) => {
                  setFeesEdited(true);
                  set("fee", e.target.value);
                }}
              />
            </FormField>
            <FormField label="Sales tax (FED)" name="tax" prefix="Rs" error={errors.tax}>
              <Input
                {...fieldProps("tax", errors)}
                inputMode="decimal"
                value={v.tax}
                onChange={(e) => {
                  setFeesEdited(true);
                  set("tax", e.target.value);
                }}
              />
            </FormField>
            <FormField label="Other charges" name="otherCharges" prefix="Rs" error={errors.otherCharges} hint="CDC, NCCPL, SECP etc.">
              <Input
                {...fieldProps("otherCharges", errors)}
                inputMode="decimal"
                placeholder="0"
                value={v.otherCharges}
                onChange={(e) => set("otherCharges", e.target.value)}
              />
            </FormField>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {feesEdited ? (
              <>
                <span>Commission and tax entered manually.</span>
                {auto ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFeesEdited(false);
                      setV((p) => ({ ...p, fee: auto.fee, tax: auto.tax }));
                    }}
                  >
                    Recalculate from fee profile (Rs {auto.fee} + {auto.tax})
                  </Button>
                ) : null}
              </>
            ) : (
              <span>Commission and tax are calculated from this portfolio&apos;s fee profile. Edit them to match your contract note.</span>
            )}
          </div>

          {cashWarning ? (
            <p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              {cashWarning.message}.{" "}
              <span className="money">
                It first drops below zero on {cashWarning.date}, to Rs {formatPrice(cashWarning.balance.toFixed())}.
              </span>
            </p>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="affectsCash" checked={v.affectsCash} onChange={(e) => set("affectsCash", e.target.checked)} className="size-4 accent-primary" />
            {v.type === "buy" ? "Pay from portfolio cash" : "Add proceeds to portfolio cash"}
          </label>

          <FormField label="Note (optional)" name="note" error={errors.note}>
            <Input {...fieldProps("note", errors)} maxLength={200} value={v.note} onChange={(e) => set("note", e.target.value)} />
          </FormField>

          {total ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-muted/50 px-3 py-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Trade value</dt>
                <dd className="tabular-nums money">Rs {formatPrice(total.gross.toFixed())}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Charges</dt>
                <dd className="tabular-nums money">Rs {formatPrice(total.charges.toFixed())}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{v.type === "buy" ? "Total cost" : "Net proceeds"}</dt>
                <dd className="font-semibold tabular-nums money">Rs {formatPrice(total.net.toFixed())}</dd>
              </div>
            </dl>
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
