import Decimal from "decimal.js";
import { z } from "zod";
import { decimalPlaces, isDecimalString, percentToFraction } from "./rates";

type Bounds = { label: string; max: string; maxDp: number; exclusiveMax?: boolean };

/** A non-negative decimal string within bounds, kept as a string (never a float). */
function decimalField({ label, max, maxDp, exclusiveMax }: Bounds) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine(isDecimalString, `${label} must be a number like 0.15`)
    .refine((v) => !isDecimalString(v) || decimalPlaces(v) <= maxDp, `${label} allows at most ${maxDp} decimal places`)
    .refine(
      (v) => !isDecimalString(v) || (exclusiveMax ? new Decimal(v).lt(max) : new Decimal(v).lte(max)),
      `${label} must be ${exclusiveMax ? "less than" : "at most"} ${max}`,
    );
}

export const portfolioFormSchema = z.object({
  name: z.string().trim().min(1, "Give the portfolio a name").max(60, "Name must be 60 characters or fewer"),
  brokerId: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.uuid("Choose a broker from the list").nullable()),
  taxStatus: z.enum(["filer", "non_filer"], { error: "Choose filer or non-filer" }),
  filerRate: decimalField({ label: "Filer CGT rate", max: "100", maxDp: 4, exclusiveMax: true }),
  nonFilerRate: decimalField({ label: "Non-filer CGT rate", max: "100", maxDp: 4, exclusiveMax: true }),
  threshold: decimalField({ label: "Price threshold", max: "10000", maxDp: 4 }),
  pctAbove: decimalField({ label: "Commission %", max: "10", maxDp: 4, exclusiveMax: true }),
  perShareBelow: decimalField({ label: "Commission per share", max: "100", maxDp: 4 }),
  fedPct: decimalField({ label: "Sales tax on commission", max: "100", maxDp: 4, exclusiveMax: true }),
  minFee: decimalField({ label: "Minimum fee", max: "100000", maxDp: 2 }),
  isDefault: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
});

export type PortfolioFormInput = z.input<typeof portfolioFormSchema>;
export type PortfolioForm = z.output<typeof portfolioFormSchema>;
export type PortfolioField = keyof PortfolioFormInput;

/** Arguments for the create_portfolio / update_portfolio RPCs (rates as fractions). */
export type PortfolioRpcArgs = {
  p_name: string;
  p_broker_id: string | null;
  p_tax_status: "filer" | "non_filer";
  p_filer_rate: string;
  p_non_filer_rate: string;
  p_threshold: string;
  p_pct_above: string;
  p_per_share_below: string;
  p_fed_pct: string;
  p_min_fee: string;
  p_is_default: boolean;
};

export function toRpcArgs(form: PortfolioForm): PortfolioRpcArgs {
  return {
    p_name: form.name,
    p_broker_id: form.brokerId,
    p_tax_status: form.taxStatus,
    p_filer_rate: percentToFraction(form.filerRate),
    p_non_filer_rate: percentToFraction(form.nonFilerRate),
    p_threshold: form.threshold,
    p_pct_above: percentToFraction(form.pctAbove),
    p_per_share_below: form.perShareBelow,
    p_fed_pct: percentToFraction(form.fedPct),
    p_min_fee: form.minFee,
    p_is_default: form.isDefault,
  };
}

export type FieldErrors = Partial<Record<PortfolioField, string>>;

/** Parse FormData into validated values or per-field error messages. */
export function parsePortfolioForm(
  formData: FormData,
): { ok: true; data: PortfolioForm } | { ok: false; fieldErrors: FieldErrors } {
  const raw: Record<string, string> = {};
  for (const key of Object.keys(portfolioFormSchema.shape)) {
    const v = formData.get(key);
    raw[key] = typeof v === "string" ? v : "";
  }
  const result = portfolioFormSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  const fieldErrors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as PortfolioField | undefined;
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { ok: false, fieldErrors };
}
