# 18: Reports and Controllable Spending redesign

**What to build:** Users explore Reports on any screen size (swipe between Periods, tap for details) and see what they could save through Controllable Spending.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] Report charts usable on a phone
- [ ] Controllable Spending highlights potential savings
- [ ] Every chart has a text summary for screen readers
- [ ] Designed at phone width first; works without horizontal scroll from a small phone to a wide desktop
- [ ] Built only from the design-system components and tokens; Persian/RTL first, English/LTR checked
- [ ] Empty, loading (skeleton) and error-with-retry states on every list and chart
- [ ] Keyboard, focus order and screen-reader labels checked; both themes reviewed in the browser
- [ ] Existing web tests still pass (updated only where a control moved, never removed)

Spec: `.scratch/design-refresh/spec.md`.
