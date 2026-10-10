# 12: Labels and Controllable Labels

**What to build:** A user tags Transactions with Labels, filters by them, and flags some Labels as controllable spending.

**Blocked by:** 11

**Status:** done

- [x] Labels API with controllable flag; many-to-many with Transactions
- [x] Label picker in fast entry; filter list by Label
- [x] Label manager screen
- [x] HTTP tests for attach/detach and isolation (cannot attach another Workspace's Label)

## Comments

Notes for later tickets:

- Branched from `11-record-income-expense` (11 was not merged yet); merge 11 first.
- `labels` (`name`, `controllable`, `archived_at`, `version`) and `transaction_labels` (`transaction_id`, `label_id`, `workspace_id`, PK on the pair) in `0006_labels.sql`, both with RLS. Labels have no DELETE grant (archived, never deleted); `transaction_labels` has SELECT, INSERT, DELETE (detaching deletes the row). Composite FKs `(transaction_id, workspace_id) → transactions` (new unique `transactions_id_workspace_id_key`) and `(label_id, workspace_id) → labels` keep both in one Workspace. Names are unique per Workspace ignoring case (`labels_workspace_id_name_key` on `lower(name)`), archived ones included; a clash answers 409.
- API under `/v1/workspaces/:wsId/labels`: `GET` (by name; archived hidden unless `?includeArchived=true`), `GET /:labelId`, `POST`, `PATCH /:labelId` (`name`, `controllable`, `archived`; Admin+).
- Transactions: `labelIds` on every Transaction (sorted by id, archived Labels included) and on create (optional, default `[]`, at most `MAX_LABELS_PER_TRANSACTION` = 20, distinct, active, same Workspace, else 400). A replayed create must name the same Labels (any order) while the Transaction is unchanged (`version` 1), else 409; once its Labels changed, a replay that matches the other fields answers 200 with the current copy, so an offline queue (15) does not fail after an attach. 14 must decide the same for edited fields. Label ids are lowercased on input. `GET ?labelId=` filters. `PUT` / `DELETE /transactions/:id/labels/:labelId` (Member+) attach and detach; both are idempotent, return the Transaction, and bump its `version` only when something changed. A Label that is missing (or another Workspace's) answers 404 there, an archived one 400 on attach (detaching it is fine), a 21st Label 400. The Transaction row is locked (`FOR UPDATE`) so the limit holds under concurrent attaches.
- For 14: attach/detach is Member+ for any Transaction today; apply 14's "Members change only their own" rule to these routes too. An edit should be able to replace `labelIds` as a whole.
- For 17 (Budget narrowed to a Label) and 25 (controllable spending): join `transaction_labels` on `label_id`; `labels.controllable` marks Controllable Labels. A Transaction can carry several Labels, so totals per Label overlap.
- Audit: `label.create` (`labelId`), `label.update` (`labelId`, `fields`), `transaction.label_attach` / `transaction.label_detach` (`transactionId`, `labelId`), only for real changes.
- Web: `/labels` (`?archived=1`), `/labels/new`, `/labels/:labelId` (Admin+), hooks `useLabels` (archived included), `useCreateLabel`, `useUpdateLabel` in `apps/web/src/labels/labels.ts`. Fast entry has a checkbox group of active Labels (hidden when there are none), cleared after each save. The list shows each Transaction's Labels and filters by `?label=`. Attaching or detaching on an existing Transaction has no UI yet; it belongs with editing (14).
- A `PATCH /labels/:id` that changes nothing still bumps the version and writes `label.update`, as Categories do; the web form only sends real changes.
