# 20: Billing screens redesign

**What to build:** The Plan, checkout, paywall and Grace Period notices look trustworthy and show exactly what Users get and pay, including Payment Method choice, discounts and card-to-card.

**Blocked by:** 07, BO-09

**Status:** ready-for-agent

- [ ] Subscription page, checkout, paywall and Grace banner redesigned
- [ ] Payment Method picker, discount line, card-to-card instructions/report and Awaiting Review redesigned
- [ ] No mention of AI analyses
- [ ] Designed at phone width first; works without horizontal scroll from a small phone to a wide desktop
- [ ] Built only from the design-system components and tokens; Persian/RTL first, English/LTR checked
- [ ] Empty, loading (skeleton) and error-with-retry states on every list and chart
- [ ] Keyboard, focus order and screen-reader labels checked; both themes reviewed in the browser
- [ ] Existing web tests still pass (updated only where a control moved, never removed)

Spec: `.scratch/design-refresh/spec.md`.
