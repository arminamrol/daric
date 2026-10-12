# 20: Net Worth and Valuations

**What to build:** A user sees Net Worth (Assets minus Liabilities) in Base Currency and per currency, and records Valuations for things like gold or a car.

**Blocked by:** 19

**Status:** done

- [x] Valuations API; Account value = latest Valuation if any, else balance
- [x] core Net Worth calculation with breakdown by Account and currency
- [x] Net Worth screen on web
- [x] Unit tests with mixed currencies and liabilities

## Comments

Notes for later tickets:

- Table `account_valuations` in `0011_account_valuations.sql`: `account_id` (composite FK with `workspace_id` to `accounts`), `amount` bigint in the Account's currency (check `>= 0`), `valued_on`, `version`. Unique `account_valuations_account_day_key` on `(account_id, valued_on)`. Deleted outright (DELETE grant), like rates.
- Core `net-worth/`: `accountValue(balance, valuations, day)` → `{ value, valuedOn }` (latest Valuation on or before the day, else the balance; `valuedOn` null for the balance). `netWorth(accounts, base, rates, day)` → `{ total, assets, liabilities, byCurrency, accounts, ratesUsed, missing }`; each of `total`, `assets` and `liabilities` goes through `toBaseCurrency` and is rounded once, so `total` may differ from `assets − liabilities` by a minor unit. A Liability counts its value as owed (a negative one, overpaid, lowers Liabilities). `accounts[i].inBase` is null when the currency has no rate. A currency whose Assets and Liabilities cancel still lands in `missing` if it cannot be converted.
- API: `GET/POST /v1/workspaces/:wsId/accounts/:accountId/valuations` (newest first), `PATCH/DELETE …/valuations/:valuationId`. Admin+ to change; 409 for a second Valuation on one day; 400 for a new one on an archived Account (existing ones stay editable). `allValuations()` in `valuations.service.ts` reads them for other services.
- `GET /v1/workspaces/:wsId/net-worth` (every Member): today in the Workspace's timezone, every Account including archived ones, rates into the current Base Currency (`netWorthSchema`). `NetWorthService.get` builds it from `AccountsService.list` (now exported), `allValuations` and `ratesInto`. **For 21:** a snapshot can store this wire shape; the computation takes `day`, but the service reads balances as of now (Transactions after a past day are not left out), so a back-dated snapshot would need balances as of that day.
- Audit: `valuation.create` / `.update` (`fields`) / `.delete`, with `valuationId` and `accountId`. Never Amounts.
- Web: `/net-worth` (nav link) shows the total, Assets and Liabilities in the Base Currency with `RateNotes`, a per-currency list when more than one currency appears, and Accounts grouped by class with value, "valued on" or "balance", and the Base Currency value or "no rate". Archived Accounts with a zero value are hidden. Each Account links to `/accounts/:accountId/valuations` (list newest first; Admins add and delete; editing is delete-and-add, though the API has PATCH). Hooks in `apps/web/src/net-worth/net-worth.ts`; the Net Worth query has no explicit invalidation from Transactions or rates and relies on refetching on mount.
- Demo seed: a gold-coins Account (`OTHER_ASSET`, IRR, opening 0) valued on the first of each demo month, ending at 1,800,000,000 rials.
- Open points from review: balances count every Transaction, so one dated after today already moves "today's" Net Worth (existing balance behaviour). PATCH does not check `version` (as rates; ADR-0005). The web has no Valuation edit, only delete-and-add. A Valuation cannot be negative, so an overpaid Liability can only show through its balance. `AMOUNT_ERRORS`, the money-unit lookup and the form-field helper are now copied in `ValuationForm` too; worth extracting into shared helpers.
