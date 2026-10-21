# 09: Card-to-card checkout

**What to build:** A User pays by card-to-card: sees the amount and destination card, reports the transfer, and the Payment shows as Awaiting Review.

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] Operator sets destination card number and holder name; card-to-card is a Payment Method in the same list
- [ ] Checkout shows amount, copyable card number and holder name
- [ ] Report form: tracking number, last four digits, transfer time (validated); duplicate tracking number refused
- [ ] New Payment state Awaiting Review shown in checkout and Payment history

Spec: `.scratch/back-office/spec.md`.
