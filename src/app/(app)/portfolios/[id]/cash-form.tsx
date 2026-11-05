"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormNotice } from "@/components/auth-shell";
import { FormField, fieldProps } from "@/components/form-field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { EntryFormState } from "./entry-actions";

export type CashFormValues = {
  type: "deposit" | "withdrawal" | "adjustment" | "deduction";
  direction: "in" | "out";
  amount: string;
  date: string;
  note: string;
};

const TYPES = [
  { value: "deposit", label: "Deposit", hint: "Money added to your broker account" },
  { value: "withdrawal", label: "Withdrawal", hint: "Money taken out to your bank" },
  { value: "deduction", label: "Deduction", hint: "Broker or CDC fees not tied to a trade" },
  { value: "adjustment", label: "Adjustment", hint: "Correction to match your broker statement" },
] as const;

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

export function CashForm({
  action,
  initial,
  cancelHref,
  submitLabel,
  returnTo,
}: {
  /** Where to go after saving. */
  returnTo?: string;
  action: (prev: EntryFormState, fd: FormData) => Promise<EntryFormState>;
  initial: CashFormValues;
  cancelHref: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [v, setV] = useState(initial);
  const errors = state?.fieldErrors ?? {};
  const set = <K extends keyof CashFormValues>(k: K, val: CashFormValues[K]) => setV((p) => ({ ...p, [k]: val }));

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <FormNotice error={state?.error} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <Card>
        <CardContent className="grid gap-4 pt-4">
          <FormField label="Type" name="type" error={errors.type} hint={TYPES.find((t) => t.value === v.type)?.hint}>
            <select {...fieldProps("type", errors)} className={selectClass} value={v.type} onChange={(e) => set("type", e.target.value as CashFormValues["type"])}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </FormField>
          {v.type === "adjustment" ? (
            <fieldset className="flex gap-4 text-sm">
              <legend className="sr-only">Direction</legend>
              {(["in", "out"] as const).map((d) => (
                <label key={d} className="flex items-center gap-2">
                  <input type="radio" name="direction" value={d} checked={v.direction === d} onChange={() => set("direction", d)} className="size-4 accent-primary" />
                  {d === "in" ? "Adds cash" : "Removes cash"}
                </label>
              ))}
            </fieldset>
          ) : (
            <input type="hidden" name="direction" value="" />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Amount" name="amount" prefix="Rs" error={errors.amount}>
              <Input {...fieldProps("amount", errors)} inputMode="decimal" value={v.amount} onChange={(e) => set("amount", e.target.value)} />
            </FormField>
            <FormField label="Date" name="date" error={errors.date}>
              <Input {...fieldProps("date", errors)} type="date" value={v.date} onChange={(e) => set("date", e.target.value)} />
            </FormField>
          </div>
          <FormField label="Note (optional)" name="note" error={errors.note}>
            <Input {...fieldProps("note", errors)} maxLength={200} value={v.note} onChange={(e) => set("note", e.target.value)} />
          </FormField>
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
