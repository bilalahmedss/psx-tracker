// Pakistan tax rules used by the engine: CGT on listed shares and dividend WHT.
// ONE dated rule set. Estimates for tracking only; not tax advice.
//
// Last checked: November 2026, against Finance Act 2026.
// Filer (ATL) CGT rates below are confirmed. When rules change in a budget,
// add a new bracket with its effective date rather than editing old ones.

export const TAX_RULES_LAST_CHECKED = "November 2026 (Finance Act 2026)";

/** Tax year runs 1 July to 30 June and is named by the year it ends (TY2026 = Jul 2025 - Jun 2026). */
export const TAX_YEAR_START_MONTH = 7;

/**
 * Non-ATL CGT on shares acquired from 1 Jul 2024 is taxed at the person's
 * income-tax slab rate with a 15% floor, so each portfolio stores its own
 * rate (user-entered, at least this floor).
 */
export const NON_FILER_MIN_RATE = "0.15";
export const NON_FILER_RATE_LABEL = "Depends on your income tax slab (minimum 15%)";

/** Holding-period slab: rate applies when the holding period does not exceed `maxYears`. */
export type HoldingSlab = { maxYears: number; rate: string };

export type CgtBracket = {
  id: "2024-onwards" | "2022-2024" | "2013-2022" | "pre-2013";
  label: string;
  /** Acquisition date range, [from, before). null = unbounded. */
  acquiredFrom: string | null;
  acquiredBefore: string | null;
  filer: { kind: "flat"; rate: string } | { kind: "holding"; slabs: HoldingSlab[]; beyond: string };
  /**
   * How a non-ATL holder is taxed.
   * "portfolio_rate": the portfolio's user-entered rate (>= NON_FILER_MIN_RATE).
   * "filer_schedule_to_confirm": the filer schedule applies to non-ATL holders too (NCCPL's July 2024
   *   table shows the same rates for both); flagged "to confirm" until re-checked. See docs/backlog.md.
   */
  nonFiler: "portfolio_rate" | "filer_schedule_to_confirm";
};

/** The filer rate applies only if on the ATL on BOTH the buy and the sell date. */
export const CGT_BRACKETS: CgtBracket[] = [
  {
    id: "2024-onwards",
    label: "Acquired on or after 1 Jul 2024",
    acquiredFrom: "2024-07-01",
    acquiredBefore: null,
    filer: { kind: "flat", rate: "0.15" },
    nonFiler: "portfolio_rate",
  },
  {
    id: "2022-2024",
    label: "Acquired 1 Jul 2022 to 30 Jun 2024",
    acquiredFrom: "2022-07-01",
    acquiredBefore: "2024-07-01",
    filer: {
      kind: "holding",
      slabs: [
        { maxYears: 1, rate: "0.15" },
        { maxYears: 2, rate: "0.125" },
        { maxYears: 3, rate: "0.10" },
        { maxYears: 4, rate: "0.075" },
        { maxYears: 5, rate: "0.05" },
        { maxYears: 6, rate: "0.025" },
      ],
      beyond: "0",
    },
    nonFiler: "filer_schedule_to_confirm",
  },
  {
    id: "2013-2022",
    label: "Acquired 1 Jul 2013 to 30 Jun 2022",
    acquiredFrom: "2013-07-01",
    acquiredBefore: "2022-07-01",
    filer: { kind: "flat", rate: "0.125" },
    nonFiler: "filer_schedule_to_confirm",
  },
  {
    id: "pre-2013",
    label: "Acquired before 1 Jul 2013",
    acquiredFrom: null,
    acquiredBefore: "2013-07-01",
    filer: { kind: "flat", rate: "0" },
    nonFiler: "filer_schedule_to_confirm",
  },
];

/** Default dividend withholding tax (editable per receipt). */
export const DIVIDEND_WHT = { filer: "0.15", non_filer: "0.30" } as const;
