# 09: Accounts

**What to build:** A user creates, lists, edits and archives Accounts (cash, bank, card, wallet, loan, asset) with a currency, Asset/Liability class and opening balance, and sees each balance.

**Blocked by:** 02, 08

**Status:** done

- [x] Currencies table seeded with minor units
- [x] Accounts API with role checks (Owner/Admin manage, everyone views)
- [x] Balance = opening balance + effect of Transactions (zero for now), computed in core
- [x] Web accounts list and form; archived Accounts hidden by default
- [x] HTTP tests for CRUD, roles and workspace isolation

## Comments

Notes for later tickets:

- `currencies` (code, minor_units) is seeded in `0003_accounts.sql` with core's `currencies` list; an HTTP test keeps the two equal. Adding a currency means adding it to both. Core `currencyCodeSchema` validates codes for both Accounts and the Base Currency; `accounts.currency` also has an FK. `workspaces.base_currency` has no FK yet.
- API under `/v1/workspaces/:wsId/accounts`: `GET` (archived hidden unless `?includeArchived=true`), `GET /:accountId` (archived ones too), `POST` and `PATCH /:accountId` (Admin+). `PATCH` takes any non-empty subset of `name`, `type`, `class`, `openingBalance`, `archived`; the currency is fixed after creation (strict schema, 400). Archiving again keeps the first `archived_at`. No DELETE: Accounts are archived, never deleted (no DELETE grant either).
- Types: `CASH | BANK | CARD | WALLET | LOAN | OTHER_ASSET`; class `ASSET | LIABILITY`, chosen independently (`defaultAccountClass` only suggests: a loan is a Liability). A Liability's balance is what is owed, positive = owed (CONTEXT.md). Net Worth (20) = sum of Asset balances minus sum of Liability balances. 11 must decide how an Expense on a Liability moves it (it should increase what is owed).
- Balance is `accountBalance(account, effects)` in core; `AccountsService.toWire` calls it with no effects. 11 should pass each Transaction's signed effect in the Account's currency (`sum` refuses mixed currencies). The response carries `openingBalance` and `balance` as wire strings.
- Audit: `account.create` (`accountId`) and `account.update` (`accountId`, `fields`). The web edit form sends only changed fields.
- api-client serialises any bigint in a request body as a decimal string, so callers pass core input types (`CreateAccountInput` with bigint `openingBalance`) directly.
- Web: `/accounts` (grouped by class, `?archived=1` shows archived ones), `/accounts/new`, `/accounts/:accountId` (Admin+, otherwise redirected to `/accounts`). Hooks in `apps/web/src/accounts/accounts.ts`: `useAccounts`, `useCreateAccount`, `useUpdateAccount`, plus `currencyOf`/`balanceOf`. The opening balance is typed in the Workspace's Rial/Toman display (`parseAmount` with `display`), and an empty field means zero. The fast-entry form in 11 can reuse this. The edit page finds its Account in the `includeArchived` list; there is no `getAccount` in api-client yet.
