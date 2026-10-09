# 14: Edit and delete Transactions with versioning

**What to build:** A user edits or deletes a Transaction; stale edits are rejected with a conflict, and Members can only change their own Transactions.

**Blocked by:** 11

**Status:** ready-for-agent

- [ ] Update requires the current version; mismatch returns a conflict with the server copy
- [ ] Delete is a soft delete and always wins
- [ ] Member role can only edit/delete Transactions they created; Admin/Owner any; Viewer none
- [ ] Edit and delete on web with undo for delete
- [ ] HTTP tests for version conflict and role rules
