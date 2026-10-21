# 08: Payment Providers and Payment Methods

**What to build:** The Operator switches Payment Methods on or off and orders them; Users pick one at checkout when several are on, and adding a gateway is one adapter plus credentials.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] Registry of Payment Providers registered only when their credentials exist; callback route per provider
- [ ] Payment Methods page: on/off, label, order; providers without credentials shown unavailable
- [ ] Checkout picks a Payment Method (choice when several, none shown when one, clear message when none); off or unknown refused
- [ ] Payment records its Payment Method; re-verify uses its original provider even if switched off
- [ ] Prices endpoint returns enabled Payment Methods and PAYMENT_LINK_MODE; PAYMENT_LINK_MODE editable in the Back Office
- [ ] Fake provider becomes a set of named fakes; HTTP and web tests

Spec: `.scratch/back-office/spec.md`.
