# 07: New app shell and navigation

**What to build:** On a desktop browser Users get a collapsible sidebar; on a phone browser a bottom tab bar with a central "+" that opens the record-a-Transaction sheet; every section is reachable the same way on both.

**Blocked by:** 03, 06

**Status:** in-progress

- [ ] Sections: Home, Transactions, Budgets, Insights, More (as split in 01); More lists Accounts, Categories, Labels, Recurring, Rates, Settings
- [ ] Desktop sidebar collapsible, with Workspace switcher and record-a-Transaction action
- [ ] Phone tab bar with "+" opening the Transaction form as a sheet
- [ ] A slot for a Back Office link shown only to Operators
- [ ] Existing routes keep their addresses; email links and mobile deep links still work
- [ ] Offline/sync status and Grace Period notice placed in the shell
- [ ] Web tests cover sidebar and tab bar navigation and the "+" sheet; existing tests pass

Spec: `.scratch/design-refresh/spec.md`.
