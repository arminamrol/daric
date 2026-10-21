# 01: Prefactor: billing configuration in the database

**What to build:** Nothing changes for Users: billing configuration and Plans now come from the database, seeded from today's env on first boot, ready for the Operator to change them.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Versioned billing configuration (price, Tier Discounts, Trial days, Grace days, PAYMENT_LINK_MODE) and Plans as rows (Free, Plus) with their limits
- [ ] Seeded from today's env values and built-in tiers on first boot; those env variables ignored afterwards; BILLING_ENABLED and credentials stay in env
- [ ] Entitlements, pricing, sign-up Trial and the expiry job read the current version through a cached loader
- [ ] Existing billing, entitlement and expiry tests pass unchanged; a test covers seeding from env

Spec: `.scratch/back-office/spec.md`.
See ADR-0009.
