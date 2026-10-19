# 42: Buy Plus on the web with Zarinpal

**What to build:** A User picks 1–12 months of Plus, sees the server-computed price with tiered discount, pays through Zarinpal, and returns to an extended Subscription and a Payment in their history; any Plus-gated action on web shows a paywall that leads here.

**Blocked by:** 40

**Status:** done

- [x] PaymentProvider interface with a Zarinpal adapter and a deterministic fake for tests
- [x] Price computed on the server from config: monthly price × months with discounts (3+ 5%, 6+ 10%, 12 ~17%), as an integer Amount; client never sends a price
- [x] payments table; checkout creates a pending Payment and redirects; callback verifies with the provider before extending
- [x] Extension starts from the current expiry if still active (including Trial and Grace Period), else from now
- [x] Callback is idempotent: verifying the same Payment twice extends once
- [x] Payment history on the Subscription page
- [x] Reusable web paywall component: explains the Plus feature and links to checkout
- [x] HTTP tests with the fake provider: success, failure, cancel, double callback, extension math

## Comments

Notes for later tickets:

- `payments` (migration 0020), one row per checkout, owner connection like `subscriptions` (no RLS, no `daric_app` grants), `cascade` with the User. `status` PENDING → PAID | FAILED | CANCELED, set once. `amount`/`currency` are the server's price at checkout; `provider` + `reference` (Zarinpal's Authority) are unique together; `receipt` is Zarinpal's `ref_id`; `plus_until` is the expiry the Payment produced.
- Pricing is `plusPrice(billing, months)` in `modules/billing/pricing.ts`: `PLUS_MONTHLY_PRICE_IRR` × months less the largest tier reached in `PLUS_DISCOUNTS` (`billing-config.ts`: 3+ 5%, 6+ 10%, 12 = ten months' price, shown as 17%), rounded down. A month of Plus is 30 days (`DAYS_PER_PLUS_MONTH`).
- `extendedExpiry` extends from the current expiry while `now < expiresAt + graceDays`, else from now. `GRACE_DAYS` (7) lives in `billing-config.ts` as `billing.graceDays`; 43 should make `subscriptionView` use that same value for the Grace Period.
- `PaymentProvider` (`payment-provider.ts`): `request`, `parseCallback`, `verify`. `ZarinpalProvider` (v4 REST, IRR, codes 100/101 = paid) is built from `ZARINPAL_MERCHANT_ID` and `ZARINPAL_SANDBOX`; without a merchant id checkout answers 503. The description sent to Zarinpal is Persian. Tests get `FakePaymentProvider` as `t.payments` (`pay(reference)`, `lastReference()`, `failRequests`, `failVerify`, `verifications`); its callback is `?reference=…&status=OK|NOK`.
- Routes: `GET /v1/me/subscription/prices`, `POST /v1/me/payments {months}` → `{payment, redirectUrl}`, `GET /v1/me/payments` (newest first, Pending left out), `GET /v1/me/payments/:id`. All 404 with billing disabled (prices and checkout). `GET /v1/payments/callback` is public, the provider's `callback_url` (`APP_URL` + path: the API shares the web origin); it verifies inside a transaction holding the Payment's row lock (`settle`), so it extends once however often it is hit, and always answers 302 to `APP_URL/settings/subscription?payment=<id>`. Only Zarinpal's -51 counts as unpaid; any other refusal, a 5xx or a timeout leaves the Payment Pending, and `GET /v1/me/payments/:id` verifies a Pending one again (only a confirmed payment changes it there). A Failed or Canceled Payment is verified again by a later callback, since anyone holding the Authority can send `Status=NOK` before the User pays. 44 needs a way back to the app (deep link) — likely a `return` choice stored on the Payment at checkout, picked by the callback's redirect.
- The device-limit notice on the login page (`AuthForm`, 41) still links to `/settings/subscription`, not to checkout: the User is signed out there.
- Web: `/settings/subscription/checkout` (`CheckoutPage`, months 1–12 as radios, server prices, "Pay with Zarinpal" → `leave.to(redirectUrl)` from `lib/leave.ts`, which tests stub). The Subscription page shows a Buy/Extend link, the result of `?payment=` and the Payment history. `ui/Paywall.tsx` (`title`, `body`, optional `cannotBuy`) links to checkout; the Members page's sharing paywall uses it. 43's Grace banner should link to `CHECKOUT_PATH`.
