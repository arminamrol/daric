# 44: Mobile Subscription, paywall and deep-link return

**What to build:** Mobile users see their Plan and Signed-in Devices, hit the same paywall on Plus-gated actions, buy through the browser, and come back to the app with Plus already active; the server decides whether the app shows a purchase link at all.

**Blocked by:** 42, 30, DR-26, BO-08

**Status:** ready-for-agent

- [ ] Subscription screen with Plan, expiry, Entitlements and Signed-in Devices
- [ ] Paywall component with parity to web
- [ ] Server-side `PAYMENT_LINK_MODE` (`external` | `info` | `none`) read at app start: external opens the web checkout in the browser, info shows text only, none hides purchase UI
- [ ] Checkout return via `daric://billing/return` refreshes Entitlements
- [ ] Device-limit sign-out reason shown on mobile
- [ ] No store in-app billing anywhere

## Comments

- Starts after the native redesign in `.scratch/design-refresh/` so it is built on the new mobile components. `PAYMENT_LINK_MODE` is now read from the Back Office billing config (`.scratch/back-office/spec.md`), not env; the Payment Method choice comes from there too.
- Cross-effort blockers: `DR-NN` is `.scratch/design-refresh/issues/NN-*`, `BO-NN` is `.scratch/back-office/issues/NN-*`.
