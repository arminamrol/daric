# 17: Budgets

**What to build:** A user sets a monthly or yearly Budget for a Category (optionally narrowed to a Label) and sees progress, remaining Amount, a warning at 80% and an overspent state above 100%.

**Blocked by:** 12, 03

**Status:** done

- [x] core budget functions: spent, remaining, ratio, state (ok/warning/over) per Period; parent Category includes children; Transfers excluded
- [x] Budgets API with role checks; amounts in Base Currency
- [x] Budgets screen with progress bars and accessible state indicators
- [x] Unit tests in core; HTTP tests for CRUD and isolation

## Comments

Notes for later tickets:

- `budgets` in `0008_budgets.sql`: `category_id`, `label_id` (nullable), `period` (`budget_period` enum `MONTHLY | YEARLY`), `amount` (positive bigint), `currency` (→ `currencies`), `version`. RLS; DELETE granted (nothing refers to a Budget, so it is deleted outright). A generated `category_kind` (always `EXPENSE`) feeds the composite FK `(category_id, workspace_id, category_kind) → categories`, so only Expense Categories of the same Workspace can have Budgets; `(label_id, workspace_id) → labels`. One Budget per Category, Label and Period: unique `NULLS NOT DISTINCT` on `(workspace_id, category_id, label_id, period)`, 409 on a clash.
- Currency: a Budget stores the Base Currency it was made in (`currency`), and only Expenses on Accounts of that currency count. Matching Expenses in other currencies are counted in `progress.otherCurrencyExpenses` and left out of `spent`. **For 19 (Exchange Rates):** convert them instead, and decide what a Base Currency change does to existing Budgets (today they keep their old currency).
- Core `budgets/`: `budgetProgress(limit, spent)` → `{ spent, remaining, percent, state }` (`percent` floored, bigint math; `warning` from `BUDGET_WARNING_PERCENT` = 80 up to 100 inclusive, `over` above; `remaining` negative once over), `budgetPeriodOf(period, day, calendar)`, `budgetExpenses(scope, transactions)` (Expenses of the Category or its children, in the Period, carrying the Label if any; Income and Transfers never) and `budgetSpent`. No rollover. Controllable spending (25) and the Projection can reuse `budgetExpenses` for "a parent includes its children".
- API under `/v1/workspaces/:wsId/budgets`: `GET` (oldest first), `GET /:id`, `POST`, `PATCH /:id` (any of `categoryId`, `labelId` (null widens to the whole Category), `period`, `amount`), `DELETE /:id` (204; 404 the second time). Changes are Admin+. Every read and write answers with `progress` for `?month=1405-07` (default: the current month in the Workspace timezone); a yearly Budget shows the year holding that month. 400 for an Income, archived or missing Category or an archived or missing Label (another Workspace's counts as missing); an archived Category or Label the Budget already has may stay on update. Core `monthParamSchema`, `periodParamSchema` and `positiveAmountSchema` are now exported.
- Audit: `budget.create` / `budget.delete` (`budgetId`), `budget.update` (`budgetId`, `fields`). Amounts never logged.
- api-client: `listBudgets(ws, { month? })`, `createBudget`, `updateBudget`, `deleteBudget`.
- Web: `/budgets` (`?month=`, previous/next month links), `/budgets/new`, `/budgets/:budgetId` (Admin+). `BudgetCard` draws a `role="progressbar"` named after the Budget (`aria-valuenow` capped at 100, `aria-valuetext` with spent, limit and state) and states the state in words with an icon (ok / near the limit / over), plus what is left or by how much it is over. Hooks in `apps/web/src/budgets/budgets.ts`; Transaction changes refetch Budgets too (`refreshAfterChange`). `MONEY_DISPLAY_UNITS` moved to `settings/labels.ts`. There is no warning token in design-tokens; warning uses `primary` (bar) and `accent` (text).
- Seed: five demo Budgets (one yearly, one narrowed to «بیرون‌غذا»); on 1405/07/19 they show ok, warning and over.
