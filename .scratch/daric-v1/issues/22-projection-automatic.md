# 22: Projection: Automatic mode

**What to build:** A user sees their projected year-end Income and Expense, computed from actuals, the Trailing Average and Recurring Rules, with every assumption shown.

**Blocked by:** 18, 19

**Status:** done

- [x] core projection function per the documented algorithm in the plan, per type and per Category
- [x] Worked example from the plan (Jalali 1405, 17 Mehr) is a passing test, plus Gregorian, short-history and no-history cases
- [x] Projection settings (trailing months, default 3) and result API
- [x] Web page with totals, per-Category breakdown and an assumptions panel (window months, averages, recurring list, warnings)

## Comments

Notes for later tickets:

- Table `projection_settings` in `0013_projection_settings.sql`: one row per Workspace (`workspace_id` is the primary key), `trailing_months` (1–12, default 3), `version`. SELECT, INSERT, UPDATE only. A Workspace without a row uses the defaults; the API answers them with `version: 0`.
- Core `projection/`: `projectYear({ calendar, today, trailingMonths, base, rates, transactions, rules, historyFrom })` → `{ year, today, yearEnd, remaining: { daysLeftInMonth, daysInMonth, fullMonths }, window, monthsUsed, income, expense, categories, recurring, ratesUsed, missing, warnings }`. Each figure set is `{ actual, average, variable, recurring, projected }` in the Base Currency; type totals are sums of the per-Category lines (keyed by the Category the Transaction or rule names; a parent does not fold in its children). `DEFAULT_TRAILING_MONTHS`, `MAX_TRAILING_MONTHS`.
  - Actuals: Income and Expense from the year's first day up to and including today; Transfers never count.
  - Window: the N months before the current one, possibly in last year. Only months ending after `historyFrom` (the Workspace's first Transaction, any type) are averaged; fewer → `short_history`, none → `no_history` and V = 0. A partly covered first month counts in full.
  - Variable: Transactions with no `recurring_occurrences` row. `variable = divRound(windowSum × (M × d + l), monthsUsed × d)`, rounded once; `average` is `windowSum / monthsUsed` rounded, for showing only.
  - Recurring: active (unarchived) rules' occurrences in `(today, yearEnd]` × amount. Unconfirmed Due Occurrences up to today are in neither A nor R.
  - Currency: actuals and rules convert at today's rate, each window month at its last day's (`rateDayOf`); one conversion per Category and bucket (per rule for R, so the listed rule totals add up). No rate → `missing` + a `missing_rates` warning.
  - **For 23:** Manual/Combined can reuse the window, `remaining` and the per-Category lines; Precedence replaces a Category's `recurring`/`variable` with Planned Items there.
- API under `/v1/workspaces/:wsId/projection`: `GET` (every Member; `projectionSchema`, `window` as `1405-04` params, `recurring` with rule `name`, oldest rule first), `GET /settings`, `PATCH /settings` (`{ trailingMonths }`, Admin+, upsert, bumps `version`). Audit `projection_settings.update` with `fields`.
- api-client: `getProjection`, `getProjectionSettings`, `updateProjectionSettings`.
- Web: `/projection` (nav «پیش‌بینی»): Income and Expense totals (projected, to date, average × months left, recurring), per-type Category breakdowns (largest first), and an assumptions panel (months left, window months used, warnings, `RateNotes`, the trailing-months select for Admins or a read-only line, averages per Category, Recurring Rules with occurrence count and total). Hooks in `apps/web/src/projection/projection.ts`; the query refetches on mount (as Net Worth), nothing invalidates it from Transactions.
- Open points: HTTP tests run on the real today, so they compare against `projectYear` on the same inputs; the worked example is pinned in core and web tests (web fakes 17 Mehr 1405). The demo seed adds nothing (defaults suffice). The settings PATCH does not check `version` (as elsewhere; ADR-0005).
