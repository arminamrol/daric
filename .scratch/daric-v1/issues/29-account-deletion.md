# 29: Account deletion and ownership transfer

**What to build:** A user permanently deletes their account and data after re-authenticating; if their Workspace has other Members they must transfer ownership first.

**Blocked by:** 27

**Status:** ready-for-agent

- [ ] Ownership transfer endpoint and UI
- [ ] Deletion requires re-auth; sole-owner Workspaces are hard-deleted
- [ ] Audit rows kept with the actor anonymised
- [ ] HTTP tests prove no remaining personal data
- [ ] If the User has active Plus time, deletion warns that it is forfeited; payments rows kept anonymised for accounting
