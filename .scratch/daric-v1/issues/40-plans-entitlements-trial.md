# 40: Plans, Entitlements and Trial

**What to build:** A new User automatically gets a 14-day Plus Trial; a Subscription page on web shows their Plan, expiry and Entitlements; with billing disabled (self-hosted) every Entitlement is unlimited (ADR-0008).

**Blocked by:** 05, 08

**Status:** ready-for-agent

- [ ] subscriptions table per User (plan, trial_ends_at, expires_at); not workspace-scoped
- [ ] Plans, limits and prices read from config; `BILLING_ENABLED` flag, false by default
- [ ] Registration starts the Trial in the same transaction that creates the Personal Workspace
- [ ] One server-side Entitlement service answers: device limit, can share a Workspace, AI analyses left this month; clients only read it
- [ ] `GET` endpoint returning the current Plan, expiry and Entitlements
- [ ] Web Subscription page under settings (fa/RTL, Workspace-Calendar dates)
- [ ] Unit tests for the Entitlement service (Free, Trial, Plus, expired, billing disabled)
