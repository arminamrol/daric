# 10: Home dashboard

**What to build:** Users open Daric to a Home screen showing Net Worth, this Period's Income and Expense, Budgets near their limit, Due Occurrences and recent Transactions.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] Big, clear numbers with gentle count-up (reduced-motion respected)
- [ ] Each block links to its full screen
- [ ] Designed at phone width first; works without horizontal scroll from a small phone to a wide desktop
- [ ] Built only from the design-system components and tokens; Persian/RTL first, English/LTR checked
- [ ] Empty, loading (skeleton) and error-with-retry states on every list and chart
- [ ] Keyboard, focus order and screen-reader labels checked; both themes reviewed in the browser
- [ ] Existing web tests still pass (updated only where a control moved, never removed)

Spec: `.scratch/design-refresh/spec.md`.
