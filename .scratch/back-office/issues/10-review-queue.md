# 10: Card-to-card review queue

**What to build:** The Operator approves or rejects reported card-to-card Payments; approval activates Plus, rejection tells the User why, both by email.

**Blocked by:** 09

**Status:** ready-for-agent

- [ ] Queue of Awaiting Review Payments, oldest first, overdue after 7 days
- [ ] Approve marks Paid and extends the Subscription; reject marks Failed with a reason the User reads
- [ ] A second review of the same Payment refused
- [ ] Approve and reject emails in the User's language; Operator audit entries

Spec: `.scratch/back-office/spec.md`.
