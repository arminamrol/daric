# 42: Buy Plus on the web with Zarinpal

**What to build:** A User picks 1–12 months of Plus, sees the server-computed price with tiered discount, pays through Zarinpal, and returns to an extended Subscription and a Payment in their history; any Plus-gated action on web shows a paywall that leads here.

**Blocked by:** 40

**Status:** ready-for-agent

- [ ] PaymentProvider interface with a Zarinpal adapter and a deterministic fake for tests
- [ ] Price computed on the server from config: monthly price × months with discounts (3+ 5%, 6+ 10%, 12 ~17%), as an integer Amount; client never sends a price
- [ ] payments table; checkout creates a pending Payment and redirects; callback verifies with the provider before extending
- [ ] Extension starts from the current expiry if still active (including Trial and Grace Period), else from now
- [ ] Callback is idempotent: verifying the same Payment twice extends once
- [ ] Payment history on the Subscription page
- [ ] Reusable web paywall component: explains the Plus feature and links to checkout
- [ ] HTTP tests with the fake provider: success, failure, cancel, double callback, extension math
