"use client";

import Link from "next/link";
import { NativeSelect } from "@/components/ui/native-select";
import { useActionState, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormNotice } from "@/components/auth-shell";
import { NON_FILER_RATE_LABEL, TAX_RULES_LAST_CHECKED } from "@/lib/engine/tax-rules";
import type { CgtFormValues, FeeFormValues } from "@/lib/portfolio/defaults";
import type { BrokerOption } from "@/lib/portfolio/queries";
import type { FieldErrors, PortfolioField } from "@/lib/portfolio/validation";
import type { PortfolioFormState } from "./actions";

export type PortfolioFormValues = {
  name: string;
  brokerId: string;
  taxStatus: "filer" | "non_filer";
  statusEffectiveFrom: string;
  isDefault: boolean;
  nonFilerRate: string;
} & FeeFormValues;

type Props = {
  action: (prev: PortfolioFormState, fd: FormData) => Promise<PortfolioFormState>;
  submitLabel: string;
  brokers: BrokerOption[];
  defaults: { fees: FeeFormValues; cgt: CgtFormValues };
  initial: PortfolioFormValues;
  /** Editing: the status in force today, so a change asks for an effective date. */
  currentStatus?: "filer" | "non_filer";
  /** Rendered under the tax fields (status history on the edit page). */
  taxHistory?: React.ReactNode;
};

export function PortfolioForm({ action, submitLabel, brokers, defaults, initial, currentStatus, taxHistory }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  // Controlled inputs so values survive a failed submit (React resets uncontrolled forms).
  const [values, setValues] = useState<PortfolioFormValues>(initial);
  // A preselected broker shows as a name; the list only appears to pick a different one.
  const [choosingBroker, setChoosingBroker] = useState(initial.brokerId === "");
  const errors: FieldErrors = state?.fieldErrors ?? {};
  const statusChanged = currentStatus !== undefined && values.taxStatus !== currentStatus;

  const set = <K extends keyof PortfolioFormValues>(key: K, value: PortfolioFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const applyFees = (fees: FeeFormValues) => setValues((v) => ({ ...v, ...fees }));

  const onBrokerChange = (brokerId: string) => {
    set("brokerId", brokerId);
    const broker = brokers.find((b) => b.id === brokerId);
    applyFees(broker?.fees ?? defaults.fees);
  };

  const selectedBroker = brokers.find((b) => b.id === values.brokerId);

  const field = (name: PortfolioField) => ({
    id: name,
    name,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <FormNotice error={state?.error} />

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field label="Portfolio name" name="name" error={errors.name}>
            <Input
              {...field("name")}
              value={values.name}
              maxLength={60}
              placeholder="e.g. Main account"
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          {choosingBroker || !selectedBroker ? (
            <Field label="Broker" name="brokerId" error={errors.brokerId} hint="Choosing a broker fills in its default fees.">
              <NativeSelect {...field("brokerId")} value={values.brokerId} onChange={(e) => onBrokerChange(e.target.value)}>
                <option value="">No broker</option>
                {brokers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          ) : (
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">Broker</span>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm">{selectedBroker.name}</span>
                <input type="hidden" name="brokerId" value={values.brokerId} />
                <Button type="button" variant="outline" size="sm" onClick={() => setChoosingBroker(true)}>
                  Change broker
                </Button>
              </div>
              {errors.brokerId ? <p className="text-xs text-destructive">{errors.brokerId}</p> : null}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isDefault"
              checked={values.isDefault}
              onChange={(e) => set("isDefault", e.target.checked)}
              className="size-4 accent-primary"
            />
            Make this my default portfolio
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tax</CardTitle>
          <CardDescription>
            Capital gains tax estimates, not tax advice. Rules last checked {TAX_RULES_LAST_CHECKED}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{statusChanged ? "New tax status" : "Tax status"}</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              {(["filer", "non_filer"] as const).map((s) => (
                <label key={s} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="taxStatus"
                    value={s}
                    checked={values.taxStatus === s}
                    onChange={() => set("taxStatus", s)}
                    className="size-4 accent-primary"
                  />
                  {s === "filer" ? "Filer (on the Active Taxpayer List)" : "Non-filer"}
                </label>
              ))}
            </div>
            {errors.taxStatus ? <p className="text-xs text-destructive">{errors.taxStatus}</p> : null}
          </fieldset>
          {statusChanged ? (
            <Field
              label="Status change takes effect from"
              name="statusEffectiveFrom"
              error={errors.statusEffectiveFrom}
              hint="Trades before this date keep the earlier status."
            >
              <Input
                {...field("statusEffectiveFrom")}
                type="date"
                value={values.statusEffectiveFrom}
                onChange={(e) => set("statusEffectiveFrom", e.target.value)}
              />
            </Field>
          ) : (
            <input type="hidden" name="statusEffectiveFrom" value="" />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-1.5 text-sm">
              <span className="font-medium">Filer CGT rate</span>
              <p className="text-muted-foreground">
                15% for shares bought from 1 Jul 2024. Older shares follow the dated schedule. Needs ATL status on both the
                buy and sell dates.
              </p>
            </div>
            <Field label="Non-filer CGT rate" name="nonFilerRate" suffix="%" error={errors.nonFilerRate} hint={NON_FILER_RATE_LABEL}>
              <Input
                {...field("nonFilerRate")}
                inputMode="decimal"
                value={values.nonFilerRate}
                onChange={(e) => set("nonFilerRate", e.target.value)}
              />
            </Field>
          </div>
          {taxHistory}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Broker fees</CardTitle>
          <CardDescription>
            Commission is a percentage of trade value for shares priced at or above the threshold, and a fixed amount per
            share below it. Sales tax is charged on the commission. CDC is charged per trade, and the PSX, SECP and NCCPL
            levies are percentages of trade value, their sales tax included.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Price threshold" name="threshold" prefix="Rs" error={errors.threshold} hint="Per share">
            <Input {...field("threshold")} inputMode="decimal" value={values.threshold} onChange={(e) => set("threshold", e.target.value)} />
          </Field>
          <Field label="Commission at or above threshold" name="pctAbove" suffix="%" error={errors.pctAbove} hint="Of trade value">
            <Input {...field("pctAbove")} inputMode="decimal" value={values.pctAbove} onChange={(e) => set("pctAbove", e.target.value)} />
          </Field>
          <Field label="Commission below threshold" name="perShareBelow" prefix="Rs" error={errors.perShareBelow} hint="Per share">
            <Input
              {...field("perShareBelow")}
              inputMode="decimal"
              value={values.perShareBelow}
              onChange={(e) => set("perShareBelow", e.target.value)}
            />
          </Field>
          <Field label="Sales tax on commission" name="fedPct" suffix="%" error={errors.fedPct} hint="Sindh sales tax / FED">
            <Input {...field("fedPct")} inputMode="decimal" value={values.fedPct} onChange={(e) => set("fedPct", e.target.value)} />
          </Field>
          <Field label="Minimum commission" name="minFee" prefix="Rs" error={errors.minFee} hint="Per trade; 0 for none">
            <Input {...field("minFee")} inputMode="decimal" value={values.minFee} onChange={(e) => set("minFee", e.target.value)} />
          </Field>
          <Field label="CDC charge" name="cdcPerTrade" prefix="Rs" error={errors.cdcPerTrade} hint="Per trade">
            <Input {...field("cdcPerTrade")} inputMode="decimal" value={values.cdcPerTrade} onChange={(e) => set("cdcPerTrade", e.target.value)} />
          </Field>
          <Field label="PSX levy" name="psxLevyPct" suffix="%" error={errors.psxLevyPct} hint="Of trade value">
            <Input {...field("psxLevyPct")} inputMode="decimal" value={values.psxLevyPct} onChange={(e) => set("psxLevyPct", e.target.value)} />
          </Field>
          <Field label="SECP levy" name="secpLevyPct" suffix="%" error={errors.secpLevyPct} hint="Of trade value">
            <Input {...field("secpLevyPct")} inputMode="decimal" value={values.secpLevyPct} onChange={(e) => set("secpLevyPct", e.target.value)} />
          </Field>
          <Field label="NCCPL levy" name="nccplLevyPct" suffix="%" error={errors.nccplLevyPct} hint="Of trade value">
            <Input
              {...field("nccplLevyPct")}
              inputMode="decimal"
              value={values.nccplLevyPct}
              onChange={(e) => set("nccplLevyPct", e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
            {selectedBroker ? (
              <Button type="button" variant="outline" size="sm" onClick={() => applyFees(selectedBroker.fees)}>
                Reset to {selectedBroker.name} fees
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={() => applyFees(defaults.fees)}>
              Reset to PSX defaults
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Link href="/portfolios" className={buttonVariants({ variant: "ghost" })}>
          Cancel
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  error,
  hint,
  prefix,
  suffix,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  prefix?: string;
  suffix?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <div className="flex items-center gap-2">
        {prefix ? <span className="text-sm text-muted-foreground">{prefix}</span> : null}
        <div className="flex-1">{children}</div>
        {suffix ? <span className="text-sm text-muted-foreground">{suffix}</span> : null}
      </div>
      {error ? (
        <p id={`${name}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
