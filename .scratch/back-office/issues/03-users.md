# 03: Back Office Users

**What to build:** The Operator finds a User by email or browses newest first, filters by Plan state, and sees their account and billing details only.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Search by email; paged list newest first; filter by Trial, Plus, Grace Period, Free
- [ ] Detail: email, sign-up date, verified, Plan, Trial, expiry, Grace end, suspended Members, Entitlements, Signed-in Device and Workspace counts, Payment history, Operator actions on this User
- [ ] Test asserts the detail response contains no Workspace or financial data

Spec: `.scratch/back-office/spec.md`.
