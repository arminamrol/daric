# 09: Accounts

**What to build:** A user creates, lists, edits and archives Accounts (cash, bank, card, wallet, loan, asset) with a currency, Asset/Liability class and opening balance, and sees each balance.

**Blocked by:** 02, 08

**Status:** ready-for-agent

- [ ] Currencies table seeded with minor units
- [ ] Accounts API with role checks (Owner/Admin manage, everyone views)
- [ ] Balance = opening balance + effect of Transactions (zero for now), computed in core
- [ ] Web accounts list and form; archived Accounts hidden by default
- [ ] HTTP tests for CRUD, roles and workspace isolation
