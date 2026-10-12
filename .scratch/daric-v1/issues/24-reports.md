# 24: Reports

**What to build:** A user sees a monthly summary, Category and Label breakdowns, and an income vs expense trend in Base Currency.

**Blocked by:** 12, 19

**Status:** done

- [x] core report functions (summary, breakdowns, trend) per Period
- [x] Reports API and web pages with Recharts and accessible tables
- [x] Unit tests in core

## Comments

Notes for later tickets:

- No migration: reports are worked out at read time from Transactions, Categories, Labels and rates.
- Core `reports/`: `periodReport({ calendar, period, today, base, rates, transactions, categories })` → `{ period, from, to, rateDay, income, expense, net, categories, labels, unlabeled, ratesUsed, missing }`; `trendMonths(period, calendar, today)` (the twelve months up to the Period's last month, a year's own months, leaving out months not yet started); `trendReport({ calendar, today, base, rates, transactions, months })` → one `{ month, income, expense, net, missing }` per month. `ReportTransaction` carries `labelIds`; Transfers never count.
  - Currency: the Period converts at `rateDayOf(period)`; each trend month at its own. A currency with no rate is left out and listed in `missing` (per month in the trend).
  - Rounding: each Category is converted once and the type totals are the sums of those lines, as the Projection does, so the lines add up to the totals; a trend month equals its own month's report. With several Categories in a foreign currency this can differ by a few minor units from converting the type's sum once (ADR-0004 rounds once per total).
  - Categories: one line per top-level Category with `own` (on the parent itself) and `children` (largest first); a parent includes its children; a Category missing from the list stands alone. Income lines first, then Expense, each largest first. `share` is a whole percent of the type's total, rounded half up.
  - Labels: one line per Label carried, with `income`, `expense` and shares of the Period's totals; a Transaction with several Labels counts under each, so Label totals overlap. `unlabeled` holds what carried none. Most Expense first.
  - **For 25 (controllable spending):** filter `labels` by the Workspace's Controllable Labels for the Period total; for its monthly trend, run `trendReport` on the Transactions carrying a Controllable Label (a Transaction carrying two must count once).
- `RateConverter` (from the Projection's private `Converter`) now lives in core `rates/` and is exported: `convert(amounts, day)` keeps every rate used and every currency missing.
- API: `GET /v1/workspaces/:wsId/reports?period=1405-07|1405` (every Member, Viewers included; the current month in the Workspace timezone by default; 400 for anything else). `reportSchema` / `reportQuerySchema` in core `api/report.ts`; Category and Label lines carry ids only. api-client `getReport(ws, { period })`.
- Web: `/reports` (nav «گزارش‌ها», `?period=`): a monthly/yearly switch with previous/next links, a summary (Income, Expense, net) with `RateNotes`, the trend as a Recharts grouped bar chart (lazy `reports/TrendChart.tsx`, `role="img"` with a name; the same numbers in a "show as table" disclosure, newest first, naming months that lacked a rate), and Category and Label tables with captions, row headers and share bars. Hook `useReport` in `reports/reports.ts`; it refetches on mount, nothing invalidates it.
- Design tokens gained `chartIncome` / `chartExpense` (light `#067647` / `#1d4ed8`, dark `#16a34a` / `#3b82f6`), checked for color-vision separation and 3:1 against the surface; mobile (32) can use them from the RN theme.
- Open points from review: the trend's rates are not listed (only the Period's under the summary). The Category breakdown is a table with CSS share bars rather than a Recharts chart. Nothing was added to the demo seed (its Transactions already fill the reports). The page was checked through tests only, not in a running browser.
