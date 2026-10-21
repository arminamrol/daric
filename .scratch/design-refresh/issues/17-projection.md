# 17: Projection redesign

**What to build:** Users understand the Projection visually: actuals so far versus the estimate to year end, with Planned Items and Projection Mode.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] Projection chart of actuals versus estimate
- [ ] Projection Mode, assumptions and Planned Items redesigned
- [ ] Designed at phone width first; works without horizontal scroll from a small phone to a wide desktop
- [ ] Built only from the design-system components and tokens; Persian/RTL first, English/LTR checked
- [ ] Empty, loading (skeleton) and error-with-retry states on every list and chart
- [ ] Keyboard, focus order and screen-reader labels checked; both themes reviewed in the browser
- [ ] Existing web tests still pass (updated only where a control moved, never removed)

Spec: `.scratch/design-refresh/spec.md`.
