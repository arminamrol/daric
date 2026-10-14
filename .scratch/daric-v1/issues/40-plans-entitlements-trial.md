# 40: Plans, Entitlements and Trial

**What to build:** A new User automatically gets a 14-day Plus Trial; a Subscription page on web shows their Plan, expiry and Entitlements; with billing disabled (self-hosted) every Entitlement is unlimited (ADR-0008).

**Blocked by:** 05, 08

**Status:** done

- [x] subscriptions table per User (plan, trial_ends_at, expires_at); not workspace-scoped
- [x] Plans, limits and prices read from config; `BILLING_ENABLED` flag, false by default
- [x] Registration starts the Trial in the same transaction that creates the Personal Workspace
- [x] One server-side Entitlement service answers: device limit, can share a Workspace, AI analyses left this month; clients only read it
- [x] `GET` endpoint returning the current Plan, expiry and Entitlements
- [x] Web Subscription page under settings (fa/RTL, Workspace-Calendar dates)
- [x] Unit tests for the Entitlement service (Free, Trial, Plus, expired, billing disabled)

## Comments

Notes for later tickets:

- `subscriptions` (one row per User, unique `user_id`): `plan` is the Plan the time was bought for, `trial_ends_at` when the sign-up Trial ends, `expires_at` when Plus time ends. Not Workspace-scoped: no RLS and no grants for `daric_app`, like the identity tables. Migration 0017 gave every User who existed before it a 14-day Trial from the migration time.
- `subscriptionView` (`apps/api/src/modules/billing/entitlements.ts`) is the one function that decides the Plan in effect and the Entitlements. Plus applies while `now < expires_at`, Free after. A User is `onTrial` while `expires_at <= trial_ends_at`, so 42 only needs to move `expires_at` (from the current expiry if still active, else from now). 43 adds the 7-day Grace Period in this same function.
- `EntitlementsService` (global, owner connection) has `startTrial(tx, userId)`, `subscriptionOf(userId)` and `entitlementsOf(userId)`. 41 and 40.1 should ask `entitlementsOf`. It always reads through `this.db`; a check inside a transaction (e.g. 41's login) may want an `Executor` parameter.
- `null` in an Entitlement means unlimited. With `BILLING_ENABLED=false` (the default) every Entitlement is unlimited and `shareWorkspace` is true. The Plan is still worked out and returned.
- Config: `BILLING_ENABLED`, `TRIAL_DAYS` (14), `FREE_DEVICE_LIMIT` (1), `PLUS_DEVICE_LIMIT` (3), `FREE_AI_ANALYSES_PER_MONTH` (1), `PLUS_AI_ANALYSES_PER_MONTH` (30), `PLUS_MONTHLY_PRICE_IRR` (2,000,000 rials). `billingConfig(config)` in `modules/billing/billing-config.ts` maps them; `plusMonthlyPrice` is a `Money` that nothing reads yet. 42 adds the tiered discounts.
- AI analyses are not counted yet: `aiAnalysesUsedThisMonth` is 0 until 40.5, which must also decide what "this month" is (calendar month, and in which timezone).
- `GET /v1/me/subscription` returns `subscriptionSchema` from core. On the web, `useSubscription()` (`['subscription']` query) reads it and the Subscription page is at `/settings/subscription`, linked from Settings. Dates go through `useFormatters().date(..., { style: 'long' })`. Like every other date on screen (08), that means the User's display calendar and the current Workspace's timezone; the ticket's "Workspace-Calendar dates" is read that way.
