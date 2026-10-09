# 11: Record Income and Expense (fast entry)

**What to build:** A user records an Income or Expense in a few keystrokes and sees it in a list grouped by Period, with the Account balance updated.

**Blocked by:** 09, 10, 03

**Status:** ready-for-agent

- [ ] Transactions table with soft delete, version, UUIDv7 id accepted from client (idempotent create)
- [ ] Create and list API, filters by Period, Account, Category
- [ ] Fast entry form: amount-first, keyboard-friendly, remembers last Account/Category, date defaults to today in display calendar
- [ ] List grouped by Period with totals; Account balances reflect Transactions
- [ ] Notes never appear in logs
- [ ] HTTP tests: idempotent create with same id, validation, isolation
