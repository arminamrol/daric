# 17: Budgets

**What to build:** A user sets a monthly or yearly Budget for a Category (optionally narrowed to a Label) and sees progress, remaining Amount, a warning at 80% and an overspent state above 100%.

**Blocked by:** 12, 03

**Status:** ready-for-agent

- [ ] core budget functions: spent, remaining, ratio, state (ok/warning/over) per Period; parent Category includes children; Transfers excluded
- [ ] Budgets API with role checks; amounts in Base Currency
- [ ] Budgets screen with progress bars and accessible state indicators
- [ ] Unit tests in core; HTTP tests for CRUD and isolation
