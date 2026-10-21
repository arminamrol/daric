# 05: Re-verify a Pending Payment

**What to build:** The Operator finds long-Pending gateway Payments and asks the Payment Provider again; a paid one activates Plus once and the User gets an email.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] List of Pending Payments, oldest first
- [ ] Re-verify: paid extends the Subscription exactly once; not paid marks Failed; unreachable provider leaves Pending with a clear error
- [ ] New "Plus is active until …" email
- [ ] Operator audit entry

Spec: `.scratch/back-office/spec.md`.
