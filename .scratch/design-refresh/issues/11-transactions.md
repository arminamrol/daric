# 11: Transactions redesign

**What to build:** Users scan Transactions grouped by day, filter them in a sheet on phones, and record or edit one quickly, amount first.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] List grouped by day with Category icons, Labels and Amounts
- [ ] Filters collapse into a sheet at phone width
- [ ] Record/edit form: amount first, then Category, Account, date, with defaults
- [ ] Transfers look distinct from Income and Expense
- [ ] Designed at phone width first; works without horizontal scroll from a small phone to a wide desktop
- [ ] Built only from the design-system components and tokens; Persian/RTL first, English/LTR checked
- [ ] Empty, loading (skeleton) and error-with-retry states on every list and chart
- [ ] Keyboard, focus order and screen-reader labels checked; both themes reviewed in the browser
- [ ] Existing web tests still pass (updated only where a control moved, never removed)

Spec: `.scratch/design-refresh/spec.md`.
