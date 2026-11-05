// Home dashboard cards and the per-user layout (stored in dashboard_layouts.widgets).

export const CARD_DEFS = [
  { id: "value", label: "Market value", hint: "Holdings at the latest prices" },
  { id: "today", label: "Today", hint: "Change since the previous close" },
  { id: "allTime", label: "All-time return", hint: "Unrealized + realized P&L + net dividends, after all charges" },
  { id: "cost", label: "Cost of holdings", hint: "What you paid for the shares you still hold, including charges" },
  { id: "unrealized", label: "Unrealized P&L", hint: "Market value minus cost of holdings" },
  { id: "realized", label: "Realized P&L", hint: "Gains and losses on shares you've sold (FIFO)" },
  { id: "dividends", label: "Dividends (net)", hint: "After withholding tax and zakat" },
  { id: "charges", label: "Charges paid", hint: "Commission, sales tax and other charges" },
  { id: "cash", label: "Cash balance", hint: "Deposits, withdrawals and trades marked as affecting cash" },
  { id: "cgt", label: "Est. CGT if sold today", hint: "Estimate using each lot's CGT rate" },
] as const;

export type CardId = (typeof CARD_DEFS)[number]["id"];
export type LayoutItem = { id: CardId; visible: boolean };

const IDS = new Set<string>(CARD_DEFS.map((c) => c.id));

export const DEFAULT_LAYOUT: LayoutItem[] = CARD_DEFS.map((c) => ({ id: c.id, visible: true }));

/**
 * Apply a saved layout to the current card set: keep the saved order and
 * visibility, drop unknown or duplicate ids, and append cards added since the
 * layout was saved (visible, at the end).
 */
export function mergeLayout(saved: unknown): LayoutItem[] {
  const out: LayoutItem[] = [];
  const seen = new Set<string>();
  if (Array.isArray(saved)) {
    for (const item of saved) {
      if (!item || typeof item !== "object") continue;
      const { id, visible } = item as { id?: unknown; visible?: unknown };
      if (typeof id !== "string" || !IDS.has(id) || seen.has(id)) continue;
      seen.add(id);
      out.push({ id: id as CardId, visible: visible !== false });
    }
  }
  for (const c of CARD_DEFS) if (!seen.has(c.id)) out.push({ id: c.id, visible: true });
  return out;
}

/** Validate a layout coming from the browser before saving. */
export function sanitizeLayout(input: unknown): LayoutItem[] | null {
  if (!Array.isArray(input) || input.length > 50) return null;
  return mergeLayout(input);
}
