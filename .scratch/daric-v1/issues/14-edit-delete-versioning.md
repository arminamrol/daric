# 14: Edit and delete Transactions with versioning

**What to build:** A user edits or deletes a Transaction; stale edits are rejected with a conflict, and Members can only change their own Transactions.

**Blocked by:** 11

**Status:** done

- [x] Update requires the current version; mismatch returns a conflict with the server copy
- [x] Delete is a soft delete and always wins
- [x] Member role can only edit/delete Transactions they created; Admin/Owner any; Viewer none
- [x] Edit and delete on web with undo for delete
- [x] HTTP tests for version conflict and role rules

## Comments

Notes for later tickets:

- API (Member+, under `/v1/workspaces/:wsId/transactions`): `PUT /:id` replaces the whole Transaction (`updateTransactionInputSchema`: the create fields without `id`, plus a required `version`). It may switch between Income, Expense and Transfer; the Category or destination is set or cleared to match. `labelIds` left out keeps the Labels, given replaces them. Validation is the create's, except that an archived Account, destination, Category or Label the stored Transaction already names may stay. A stale `version` answers 409 `{ statusCode, error, message, transaction }` with the current copy; a deleted one answers 404. `DELETE /:id` soft-deletes with no version (204, again 204: delete wins, idempotent for the offline queue). `POST /:id/restore` clears `deleted_at` (the web's undo; restoring one not deleted changes nothing). Every change locks the row (`FOR UPDATE`) and bumps `version`, delete and restore included. Audit: `transaction.update` / `.delete` / `.restore` with `transactionId` only.
- Roles: core `mayChangeTransaction(role, userId, { createdBy })`: Owner and Admin any, Member only `createdBy === userId` (not once the recorder's account is gone and `createdBy` is null), Viewer none. The API answers 403 (the Transaction is visible, so not 404). It also applies to attaching and detaching Labels now, which a Member could previously do on anyone's Transaction.
- Replays (decided for 12's open point): once a Transaction's `version` is above 1 (edited, relabelled, deleted or restored), a replayed create with its id answers 200 with the current copy without comparing fields. Only an unchanged one is compared field by field (409 on a difference). A replay still never revives a deleted one.
- api-client: `getTransaction`, `updateTransaction`, `deleteTransaction`, `restoreTransaction`, and `transactionConflict(error)`, which returns the server copy of a 409 stale edit (undefined for any other error). 15 can use it for keep-mine (resend with the copy's `version`) and keep-theirs.
- Web: list rows the viewer may change get Edit (link to `/transactions/:id`) and Delete. Deleting shows "تراکنش حذف شد." with "برگرداندن" (restore) until undone or the next delete. `TransactionForm` takes an optional `transaction` (and `onSaved`) to edit; it offers archived Accounts, Categories and Labels only when that Transaction names them. On a conflict it offers "نسخهٔ تازه را بیاور" (load the server copy) or "تغییرات من بماند" (resend against the server copy's version). A 404 on save says the Transaction was deleted. The edit page sends a Member back to the list for a Transaction they cannot change.
