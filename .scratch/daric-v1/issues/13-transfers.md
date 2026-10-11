# 13: Transfers

**What to build:** A user moves money between two Accounts; across currencies they enter both Amounts and nothing is converted automatically. Transfers never count as Income or Expense.

**Blocked by:** 11

**Status:** done

- [x] Transfer type with destination Account and destination Amount
- [x] Same-currency Transfers require equal Amounts; cross-currency require both
- [x] Both Account balances update; Transfers excluded from Income/Expense totals
- [x] Transfer form on web
- [x] Tests for balances and exclusion

## Comments

Notes for later tickets:

- A Transfer is one `transactions` row of type `TRANSFER` (`0007_transfers.sql`): `account_id` / `amount` is what leaves, the new `to_account_id` / `to_amount` what arrives (in the destination Account's currency). Composite FK `(to_account_id, workspace_id) → accounts`; CHECKs: a Transfer has both destination columns and no Category, Income and Expense have neither destination column, `to_amount > 0`, `to_account_id <> account_id`. Equal Amounts within one currency is the service's rule (it needs both Accounts' currencies).
- Core: `transactionSchema` and `createTransactionInputSchema` are discriminated unions on `type` (`IncomeExpense` | `Transfer`); narrow on `type` before reading `categoryId` or `toAccountId`. `AnyTransactionType` = `TransactionType | 'TRANSFER'`; `TransactionType` stays Income/Expense (the kinds a Category can have). Create takes `toAccountId` and an optional `toAmount`: within one currency it may be left out (stored as `amount`) and must otherwise equal `amount`; between currencies it is required. 400 for a missing, archived or other-Workspace destination, the same Account twice, or Amounts that do not fit. A replay compares `toAmount` with the Amount the server would store, so leaving it out or sending it equal both replay.
- Balances: core `balanceEffect(transaction, account)` now takes the Account (`{ id, class }`) and gives 0 for an Account the Transaction does not touch; `flowEffect('IN' | 'OUT', amount, class)` is the primitive. `AccountsService` sums Income as inflow, Expense and outgoing Transfers as outflow by `account_id`, and incoming Transfers by `to_account_id`.
- Exclusion: core `groupByMonth` lists Transfers but leaves them out of the per-currency Income/Expense totals (no zero entry for a currency that only had Transfers). Reports (24), Budgets (17) and the Projection must filter `type <> 'TRANSFER'` (or by Category, which a Transfer never has) the same way.
- API list: `?accountId=` matches either side of a Transfer; `?categoryId=` never matches one; Transfers carry Labels like any Transaction.
- OpenAPI: a class cannot extend a union DTO, so `namedZodDto(name, schema)` in `common/zod.ts` names it (otherwise every union shows up as `AugmentedZodDto`).
- Web: fast entry has a third type, Transfer (offered only with two or more active Accounts): "از حساب" / "به حساب" (the destination list leaves out the source), and "مبلغ دریافتی" only when the currencies differ. The destination is remembered in `daric.lastPicks.<workspaceId>` as `toAccountId`. The list shows a Transfer with an arrow badge, `from ← to`, no sign, and both Amounts when the currencies differ.
- For 14 (editing): an edit may change a Transfer's Accounts, so it must re-run the currency rule; switching a Transaction between Transfer and Income/Expense means setting or clearing the destination and Category together (the CHECK enforces it).
