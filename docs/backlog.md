# Backlog

Known gaps and deliberate simplifications, to pick up later. Newest first within each section.

## Tax and CGT

- **Loss carry-forward.** CGT estimates offset losses against gains only within the same tax year (July–June). Capital losses on listed shares can be carried forward to later years; not modelled yet. (`cgtByTaxYear` in `src/lib/engine/cgt.ts`)
- **Non-filer CGT on shares bought before 1 Jul 2024 — to confirm.** The engine applies the filer schedule to non-filers for these acquisitions (12.5% for 2013–22, holding-period slabs for 2022–24, 0% before Jul 2013), based on NCCPL's July 2024 table showing the same rates for ATL and non-ATL on those slabs. The UI flags these rates "to confirm". Re-check against the current NCCPL/FBR schedule and remove the flag once confirmed. (`nonFiler: "filer_schedule_to_confirm"` in `src/lib/engine/tax-rules.ts`)
- **Rule-set review each budget.** `src/lib/engine/tax-rules.ts` was last checked November 2026 (Finance Act 2026). After each Finance Act, add new dated brackets rather than editing old ones.
- **Dividend WHT defaults.** 15% filer / 30% non-filer, editable per receipt. Sector-specific rates (e.g. IPPs) aren't modelled.

## Market data and calendar

- **Lunar holidays and Friday hours — to confirm** against the PSX notice (`market_holidays`, `STANDARD_HOURS` in `src/lib/psx/calendar.ts`).
- **EODHD free plan (checked 5 Nov 2026 with `npm run eodhd:probe`):** 20 calls/day, counted per ticker; `/user` is free. Real-time `.KAR` quotes return "NA" (only the previous close), so the app runs in end-of-day mode; history goes back one year; bulk end-of-day is refused. Handled by the daily budget and end-of-day mode (`docs/cron.md`). Still to confirm: what time EODHD publishes PSX closes. On 5 Nov 2026 the closes were out by 22:40 PKT; the 120-minute delay (17:30 PKT) is a guess. If early tries keep finding nothing, raise EOD_PUBLISH_DELAY_MINUTES to save the 1-call checks.
- **KSE-100 index:** `KSE100.INDX` works on the free plan (previous close only, 1 call). Not fetched yet; add it to the end-of-day refresh when the dashboard comparison is built.
- **Switching back to demo** writes simulated closes into `prices`. The demo history was cleared on 5 Nov 2026 when EODHD went live; clear it again (`delete from prices` for the affected symbols) before switching back to a real source.
- **/market** shows only refreshed symbols once EODHD is on (scope = holdings). A wider market view needs a paid plan or a slower rotation through other symbols.
- **Production cron** needs a deployed app; steps in `docs/cron.md`.

## Dashboard

- Chart history shows holdings at cost on days with no stored close (flagged "estimated"). Held stocks now get one year of real closes from EODHD on their first refresh; older trades still fall back to cost.
- Compare against KSE-100 (needs index data).
- Resizable cards and multiple saved layouts (Stage 2).

## Engine scope

- Bonus, split, rights and transfer transactions (Milestone 2, corporate actions).
- Persisting `lots`, `realized_gains` and `snapshots` from the end-of-day job for charts and tax reports (the engine currently rebuilds per request).
