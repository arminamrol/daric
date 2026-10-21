# 07: Promotions

**What to build:** The Operator runs a time-limited sale; during it every checkout shows the Promotion's name and discount, and the larger of it and the Tier Discount applies.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] Create (name, percent, start, end), end early, list past/running/upcoming; overlapping windows refused
- [ ] Pricing applies the larger of Promotion and Tier Discount, never both
- [ ] Payment stores which discount applied; checkout and Payment history show it
- [ ] A Payment started during a Promotion keeps its price after it ends
- [ ] Pricing unit tests and HTTP tests

Spec: `.scratch/back-office/spec.md`.
