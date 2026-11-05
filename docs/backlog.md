# Backlog

Known gaps and deliberate simplifications, to pick up later. Newest first within each section.

## Tax and CGT

- **Loss carry-forward.** CGT estimates offset losses against gains only within the same tax year (July–June). Capital losses on listed shares can be carried forward to later years; not modelled yet. (`cgtByTaxYear` in `src/lib/engine/cgt.ts`)
- **Non-filer CGT on shares bought before 1 Jul 2024 — to confirm.** The engine applies the filer schedule to non-filers for these acquisitions (12.5% for 2013–22, holding-period slabs for 2022–24, 0% before Jul 2013), based on NCCPL's July 2024 table showing the same rates for ATL and non-ATL on those slabs. The UI flags these rates "to confirm". Re-check against the current NCCPL/FBR schedule and remove the flag once confirmed. (`nonFiler: "filer_schedule_to_confirm"` in `src/lib/engine/tax-rules.ts`)
- **Rule-set review each budget.** `src/lib/engine/tax-rules.ts` was last checked November 2026 (Finance Act 2026). After each Finance Act, add new dated brackets rather than editing old ones.
- **Dividend WHT defaults.** 15% filer / 30% non-filer, editable per receipt. Sector-specific rates (e.g. IPPs) aren't modelled.

## Market data and calendar

- **Lunar holidays and Friday hours — to confirm** against the PSX notice (`market_holidays`, `STANDARD_HOURS` in `src/lib/psx/calendar.ts`).
- **EODHD free plan (checked 5 Nov 2026):** 20 requests/day; daily history (`/eod`) works, but real-time quotes return "NA" for `.KAR` and the bulk end-of-day endpoint returns HTTP 423. The price job and `jobs:dev` would exhaust the quota within minutes. Before using EODHD: either upgrade, or add a daily request budget to the adapter and make the end-of-day job fall back to per-symbol `/eod` when bulk is unavailable.
- **KSE-100 index** not fetched yet.
- **Production cron** needs a deployed app; steps in `docs/cron.md`.

## Dashboard

- Chart history shows holdings at cost on days with no stored close (flagged "estimated"); needs real daily closes backfilled for held symbols.
- Compare against KSE-100 (needs index data).
- Resizable cards and multiple saved layouts (Stage 2).

## Engine scope

- Bonus, split, rights and transfer transactions (Milestone 2, corporate actions).
- Persisting `lots`, `realized_gains` and `snapshots` from the end-of-day job for charts and tax reports (the engine currently rebuilds per request).
