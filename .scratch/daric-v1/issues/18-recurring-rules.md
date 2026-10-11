# 18: Recurring Rules and Due Occurrences

**What to build:** A user defines recurring rent, salary or subscriptions; when one comes due it waits for one-tap confirmation (with an editable amount) unless the rule auto-posts, and missed occurrences are listed oldest first.

**Blocked by:** 11

**Status:** done

- [x] core occurrence generator for weekly/monthly/yearly rules in the Workspace Calendar (incl. day 31 and Esfand edge cases)
- [x] Recurring Rules API; Due Occurrences listed and confirmed/skipped
- [x] Auto-post rules create Transactions linked to the rule; confirm-by-default otherwise
- [x] Web screens for rules and Due Occurrences
- [x] Tests for generation, catch-up and idempotent confirmation

## Comments

Notes for later tickets:

- Tables in `0009_recurring_rules.sql`. `recurring_rules`: `name` (≤ 100, also the note on the Transactions it makes), `type` (a `category_kind`: Income or Expense only, no Transfers), `account_id`, `category_id`, `amount`, `frequency` (`WEEKLY | MONTHLY | YEARLY`), `interval` (1–52), `start_on`, `end_on` (inclusive, ≥ start), `due_from`, `auto_post`, `created_by`, `archived_at`, `version`. Composite FKs `(account_id, workspace_id)` and `(category_id, workspace_id, type) → categories(id, workspace_id, kind)`. No DELETE grant: rules are archived. `recurring_occurrences` (PK `(rule_id, due_on)`): `status` `CONFIRMED | SKIPPED`, `transaction_id` (unique, set iff confirmed). SELECT and INSERT only: a handled occurrence never changes. This is the only link from a rule to its Transactions; `transactions` has no rule column.
- Core `recurring/`: `occurrencesBetween(schedule, calendar, from, until)`, `isOccurrence`, `nextOccurrence(schedule, calendar, onOrAfter)`, `dueOccurrences(schedule, calendar, today, handled, from?)`. Monthly and yearly rules keep `startOn`'s day (and month) in the Workspace Calendar. In shorter months the day falls on the month's last day (31 → 30, Esfand 30 → 29 outside leap years), counted from the start each time so it returns to 31 after. Weekly rules ignore the calendar. Also new: `addDays` in calendar and `count` in `displayFormatters`. **For 22 (Projection):** R = `occurrencesBetween(rule, calendar, tomorrow, yearEnd+1)` × amount per active rule. "Variable (non-recurring)" Transactions are those with no `recurring_occurrences` row.
- API under `/v1/workspaces/:wsId/recurring`:
  - `GET` (oldest first; `?includeArchived=true`) and `GET /:id`, each with `nextDueOn` (after today, null once ended or archived).
  - `POST` and `PATCH /:id` (any subset plus `archived`). Admin+. 400 for an Account or Category that is missing, archived or of the other type; one the rule already has may stay.
  - `GET /due` returns `{ occurrences, autoPosted }`, oldest first, every missed one included.
  - `POST /:id/occurrences/:dueOn/confirm` (`{ amount? }`) records a Transaction on `dueOn`: 201, or 200 with the same Transaction on a replay. 409 if the occurrence was skipped, or confirmed and its Transaction was deleted since.
  - `POST …/skip`: 204 again and again; 409 if confirmed. Both are Member+, and answer 400 for a day that is not due (future, off the schedule, before `due_from`, or an archived rule).
- Auto-post is lazy: `GET /due` records auto-posting rules' occurrences when a Member or above asks. The web header asks on every page. The Transaction's author is the rule's creator, or the caller once the creator's account is gone. A Viewer's list leaves those occurrences out. Occurrences whose rule has an archived Account or Category wait like manual ones (confirming them answers 400 until the rule changes). There is no background job, so a Workspace nobody opens posts nothing; a scheduler could call the same catch-up later. A backlog (an old `startOn`) is posted all at once.
- Rescheduling: a PATCH that changes `startOn`, `frequency` or `interval` sets `due_from` to tomorrow. No earlier day of the new schedule comes due, and unhandled ones of the old schedule are dropped. Changing the Workspace Calendar re-derives monthly days and can bring up days not yet handled (not guarded).
- Audit: `recurring.create` / `.update` (`ruleId`, `fields`), `.confirm` / `.auto_post` (`ruleId`, `dueOn`, `transactionId`), `.skip` (`ruleId`, `dueOn`). Never Amounts or names.
- Web: `/recurring` (`?archived=1`) shows Due Occurrences (Amount editable, Confirm / Skip; read-only for Viewers), then the rules. `/recurring/new` and `/recurring/:ruleId` are Admin+, with an archive checkbox. The header link carries the due count. Hooks are in `apps/web/src/recurring/recurring.ts`; a confirm refreshes Transactions, balances and Budgets. Confirms are not queued offline.
- Open points from review: PATCH bumps `version` but does not check it, and create takes no client id (as Budgets do; ADR-0005 asks for both). Labels on rules are not supported. The amount-unit code is repeated a fourth time (`RecurringForm`, `DueOccurrences`).

