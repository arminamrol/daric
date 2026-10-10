# 11: Record Income and Expense (fast entry)

**What to build:** A user records an Income or Expense in a few keystrokes and sees it in a list grouped by Period, with the Account balance updated.

**Blocked by:** 09, 10, 03

**Status:** done

- [x] Transactions table with soft delete, version, UUIDv7 id accepted from client (idempotent create)
- [x] Create and list API, filters by Period, Account, Category
- [x] Fast entry form: amount-first, keyboard-friendly, remembers last Account/Category, date defaults to today in display calendar
- [x] List grouped by Period with totals; Account balances reflect Transactions
- [x] Notes never appear in logs
- [x] HTTP tests: idempotent create with same id, validation, isolation

## Comments

Notes for later tickets:

- `transactions` in `0005_transactions.sql`: `type` (`transaction_type` enum, which already holds `TRANSFER` so 13 needs no enum change), `account_id`, `category_id`, `amount` (positive bigint; the type gives the direction), `occurred_on` (a Postgres `date`: the Gregorian day, no time), `note` (≤ 1000), `created_by` (→ users, set null on user deletion; 14 uses it for "Members change only their own"), `deleted_at`, `version`. RLS, no DELETE grant. Composite FKs: `(account_id, workspace_id) → accounts(id, workspace_id)` (new unique on accounts) and `(category_id, workspace_id, category_kind) → categories(id, workspace_id, kind)`, where `category_kind` is a generated column (INCOME/EXPENSE from `type`, null for TRANSFER). A CHECK requires a Category unless the type is TRANSFER; 13 adds its own columns and checks.
- Days: core `IsoDay` (`YYYY-MM-DD`, Gregorian) with `isIsoDay`, `todayIn(instant, tz)`, `dayOf`, `calendarDateOf`, `monthPeriodOfDay`, `periodDays(period, calendar)` → `{ from, until }` (until exclusive), `parseDisplayDay(text, calendar)`, `formatDay`. `displayFormatters` gained `day(isoDay)` and `today(instant)`. The Workspace timezone only decides "today"; the Workspace Calendar decides the Period of a stored day, so changing the calendar re-buckets old Transactions.
- API under `/v1/workspaces/:wsId/transactions`: `GET` (`?period=1405-07` or `?period=1405` in the Workspace Calendar, `?accountId=`, `?categoryId=` where a parent includes its children; newest first by day, then created time; deleted ones left out; no pagination yet), `GET /:transactionId`, `POST` (Member+). Create takes an optional client UUIDv7 `id`: a replay with the same id and the same fields answers 200 with the stored Transaction (also when it was deleted since, so a replay never revives it); the same id with different fields, or one used in another Workspace, answers 409. 400 for an Account or Category that is missing, archived, or (Category) of the other kind.
- Balances: `AccountsService` sums each Account's non-deleted Income and Expense in SQL and applies core `balanceEffect(transaction, accountClass)` (a Liability owes more after an Expense, less after Income). Transfers (13) must extend both the SQL totals and `balanceEffect`.
- Core `groupByMonth(transactions, calendar, currencyOf)` groups newest month first with per-currency Income/Expense totals; reports (24) and Projection can reuse it, and Transfers must be kept out of it.
- Audit: `transaction.create` (`transactionId`). Notes and Amounts are censored by the logger's key redaction; `request-logs.http.test.ts` checks a note never reaches the logs.
- Web: `/transactions` (`?year=`, `?account=`, `?category=`) with `TransactionForm` (fast entry; the amount is focused, Enter records, one UUIDv7 per draft so a retry is idempotent, last Account and per-type Category kept in `localStorage` under `daric.lastPicks.<workspaceId>`, day typed in the display calendar) and `TransactionList`. Hooks `useTransactions`, `useRecordTransaction` (refetches Transactions and Accounts) in `apps/web/src/transactions/transactions.ts`; `categoryChoices` labels children `parent › child`. 15 can move the record call onto the offline queue unchanged, since ids are already client-made.
- For 15: the web has no logout yet. When it gets one, wipe `daric.lastPicks.*` with the rest of the device data (ADR-0005), though it holds only ids. The fast-entry form computes its default day once on mount, so a form left open past midnight still defaults to yesterday. Errors from the server (400 archived Account, 409) show one generic message.
