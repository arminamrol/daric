# 31: Mobile: Accounts, Categories, Labels, Budgets, Recurring

**What to build:** Mobile users manage Accounts, Categories, Labels, Budgets and Recurring Rules / Due Occurrences with parity to web.

**Blocked by:** 30, 17, 18

**Status:** done

- [x] Screens for each area using shared core logic only
- [x] Offline queue covers these writes

## Comments

Notes for later tickets:

- API: creating an Account, Category, Label, Budget or Recurring Rule takes an optional client `id` (a UUIDv7). Sending it again answers 200 with what the id holds now, changes since included (`createOnce` in `apps/api/src/common/create-once.ts`); an id another Workspace holds answers 409 without showing its copy. Unlike Transactions, a replay is not compared field by field. Any new entity the offline queue writes should go through `createOnce` too.
- `@daric/offline-queue` takes `merge(earlier, later)` for edits naming only the fields they change. An edit folds into an earlier waiting change only when nothing of another entity waits behind it, since the edit may refer to something made after (a Label it now carries); otherwise it waits as its own entry. An edit held on a conflict is still settled in place.
- `@daric/api-client`: `WorkspaceWrite` is either a whole `CreateTransactionInput` (as the Transaction-only queue keeps it, so old stored entries still replay) or `{ entity, fields }` for `account`, `category`, `categoryOrder`, `label`, `budget`, `recurringRule` and `occurrence` (confirm or skip). Queue keys are a Transaction's bare id or `entity:id` (`entityKey`/`parseEntityKey`), so deletes say what they delete. `workspaceTransport` sends them (a create archived before it was sent is a create then an archive) and `mergeWrites` folds them; `withWaitingAccounts`/`Categories`/`Labels`/`Budgets`/`Rules`/`Due` show waiting changes on top of each list. The web app still uses the Transaction-only queue; moving it to `workspaceTransport` would queue its other writes too.
- Mobile: every write goes through `useWrite()` with `created`/`edited`/`deleted` (`src/data/writes.ts`); a change the API refuses at once is dropped and the form says why (`refusedWith(error, 409)`), one refused later waits on the sync screen (`/sync`), which also offers keep theirs / keep mine for Transaction conflicts. Query keys and what each write refetches live in `src/data/keys.ts`. The More screen (header button on Transactions) leads to every area. Form readers (`*/form.ts`, `forms/amount.ts`) are tested in Node; screens have no component tests yet. `swapWithNeighbour` moved to core.
- `react-native-svg` and `lucide-react-native` were added for Category icons: native projects must be rebuilt (`pnpm --filter @daric/mobile ios`). The JS bundle was checked with `expo export`; the screens were not run on a device in this ticket.
- Open points from review:
  - Edits of things other than Transactions are last-write-wins (the API never checked `version` for Budgets or Recurring Rules); ADR-0005 asks for stale edits to be refused.
  - A refused create does not hold back later writes that need it (a Transaction on a refused Account is refused too, and both wait on the sync screen).
  - An Account, Category or Label brought back from the archive offline shows in lists without archived ones only once the API has it.
  - A Budget whose Category, Label or Period changed offline keeps showing what was spent before until the API answers.
  - `useBudgetNames` is the same in both apps; it needs i18n, so it cannot move to core as it is.
  - Still left from 30: Transfers, Labels on Transactions, and editing and deleting Transactions on mobile.
