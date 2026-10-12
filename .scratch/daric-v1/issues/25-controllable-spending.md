# 25: Controllable spending and savings slider

**What to build:** A user sees total and monthly trend of spending under Controllable Labels and how much they could save by reducing it by X% (default 20%).

**Blocked by:** 24

**Status:** done

- [x] core functions for controllable totals, trend and savings estimate (monthly and yearly)
- [x] Web view with slider; numbers computed in core only
- [x] Unit tests

## Comments

Notes for later tickets:

- No migration: worked out at read time, alongside the report.
- Core `reports/controllable.ts`: `controllableSpending({ ...ReportInput, months, controllableLabelIds })` → `{ expense, share, labels, trend, monthlyAverage, monthsAveraged, averageRunning }`.
  - Only Expenses count; a Transaction carrying several Controllable Labels counts once in `expense` and the trend, and under each Label in `labels` (whose `share` is of the controllable total, so lines overlap). `share` is of the Period's whole Expense. Converted exactly as `periodReport` / `trendReport` do; each trend point carries its own `missing`.
  - Average month: the trend's closed months from the first with controllable spending (later empty months count as zero), or the running month so far while no closed month has any (`averageRunning`). `monthsAveraged` 0 means nothing to average.
  - `controllableSavings(monthlyAverage, percent)` → `{ monthly, yearly }`; `percent` is a whole number 0–100 (RangeError otherwise); each figure is rounded once from `monthlyAverage × percent` (so `yearly` is not always 12 × `monthly`). `DEFAULT_SAVINGS_PERCENT` = 20. **For 36 (Fact Sheet):** call it at 10/20/30 on `monthlyAverage`. Note the average itself is already rounded to a minor unit.
  - `shareOf` is now exported from `reports.ts`.
- API: `GET /reports` gains `controllable` (`controllableReportSchema` in core `api/report.ts`; Label lines carry ids only). Archived Controllable Labels still count.
- Web: a «هزینه‌های قابل کنترل» section at the end of `/reports` (`reports/ControllableSpending.tsx`): total and share, a savings card with a range slider (0–100, step 5, default 20, `aria-valuetext`, results in `role="status"`) whose figures come from core `controllableSavings`, a per-Label table, and the months as a table with CSS bars (newest first, naming months that lacked a rate). With no Controllable Label it links to `/labels`. `useShownInBase` / `useShare` moved to `reports/reports.ts`.
- **For 32 (mobile):** read `report.controllable` from the API and call `controllableSavings` in core for the slider.
- Open points from review: the months are a table with bars, not a Recharts chart. The slider's `role="status"` announces every step. The core function runs `periodReport` on all Transactions again for the share, though the caller already has it. Checked through tests only, not in a running browser.

