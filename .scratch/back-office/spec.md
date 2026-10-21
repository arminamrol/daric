# Back Office: Operator, configurable billing, Payment Methods

**Status:** ready-for-agent

## Problem Statement

I run Daric and take real money for Plus, but I have no way to see or steer that business without opening a database shell on production. I cannot see who signed up, who is on a Trial, who paid, or how much came in. When a User writes "I paid but Plus is not active", I cannot look up their Payment, ask the gateway again, or give them the days they are owed. Every price, discount, Trial length and limit is baked into deployment config, so running a Nowruz sale or trying a different price means a redeploy. Daric can only take money through one gateway, Zarinpal, whose merchant approval is not settled; if it falls through, I cannot sell Plus at all, and adding another gateway is not a quick job today.

## Solution

An Operator part of the web app, the **Back Office**, open only to Users I flag as **Operators**. It shows Users' account and billing details (never their financial data), Payments, and business metrics. From it I can grant Plus days, ask a Payment Provider to re-verify a stuck Payment, and approve or reject card-to-card Payments. Billing configuration moves out of env into the database, so I change the Plus price, Tier Discounts, Promotions, Trial and Grace days, each Plan's limits, the enabled Payment Methods and `PAYMENT_LINK_MODE` from the Back Office, each change versioned and audit-logged with a reason. Users get a Payment Method choice at checkout when more than one is on, including card-to-card, which needs no gateway contract. Adding a new Payment Provider becomes one adapter plus its credentials, which I then switch on from the Back Office.

## User Stories

### Operator access

1. As the person running Daric, I want to mark a User as an Operator with a command-line script, so that nobody can make themselves an Operator from the app.
2. As the person running Daric, I want to remove a User's Operator flag with the same script, so that access is revoked without a redeploy.
3. As an Operator, I want to only be accepted once my email is verified, so that an unverified account can never reach the Back Office.
4. As an Operator, I want a Back Office link in the web app's navigation, so that I can get there without typing a URL.
5. As a User who is not an Operator, I want the Back Office to not exist for me (no link, and a not-found page if I open its address), so that its existence leaks nothing.
6. As an Operator, I want the API to refuse every Back Office request from a non-Operator, so that hiding the link is never the only protection.
7. As an Operator, I want to re-enter my password before any change I make in the Back Office, so that a stolen open session cannot move money or change prices.
8. As an Operator, I want a wrong password on a confirmation to refuse the change without logging me out, so that a typo costs nothing.
9. As an Operator on a self-hosted instance with billing disabled, I want the Back Office to still show Users and sign-up metrics, so that I can see who uses my instance.
10. As an Operator on a self-hosted instance with billing disabled, I want every billing section hidden, so that I am not shown settings that do nothing.
11. As an Operator, I want the Back Office designed for a desktop browser, so that it stays small and I am not waiting on a mobile version.

### Finding Users

12. As an Operator, I want to search Users by email, so that I can find the one who wrote to me.
13. As an Operator, I want a paged list of Users, newest first, so that I can see who signed up recently.
14. As an Operator, I want to filter Users by Plan state (on Trial, Plus, in Grace Period, Free), so that I can find a group quickly.
15. As an Operator, I want to see a User's email, sign-up date and whether their email is verified, so that I can answer basic support questions.
16. As an Operator, I want to see a User's Plan, whether they are on a Trial, their Subscription expiry, Grace Period end and whether their shared Workspaces' Members are suspended, so that I know exactly what they can do.
17. As an Operator, I want to see a User's current Entitlements as the server computes them, so that I see what the User sees.
18. As an Operator, I want to see how many Signed-in Devices and Workspaces a User has, without seeing the devices' details or the Workspaces' contents, so that I can explain device-limit sign-outs.
19. As an Operator, I want to see a User's Payment history with each Payment's Payment Method, months, amount, state and dates, so that I can check what they paid.
20. As an Operator, I want to see the Back Office actions taken on a User (Plus granted, Payments re-verified, reviews), so that I know what has already been done for them.
21. As a User, I want the Operator to never see my Transactions, Accounts, balances, Labels, Categories or any other Workspace data, so that using Daric stays private.

### Metrics

22. As an Operator, I want to see how many Users signed up per day and per month, so that I can tell whether Daric is growing.
23. As an Operator, I want to see how many Users are on a Trial, on Plus, in their Grace Period and on Free right now, so that I know the shape of my user base.
24. As an Operator, I want to see Payments per day and per month by state, so that I can spot a gateway failing.
25. As an Operator, I want to see revenue (the sum of Paid Payments) per day and per month in IRR, so that I know what I earned.
26. As an Operator, I want to see what share of ended Trials turned into a Paid Payment, so that I can judge whether the Trial works.
27. As an Operator, I want to see revenue and Payment counts broken down by Payment Method, so that I can tell which way of paying Users prefer.
28. As an Operator, I want to see how many card-to-card Payments are Awaiting Review and how many are overdue, so that I do not leave Users waiting.
29. As an Operator, I want metrics shown in my chosen calendar and language, so that the dates match how I think.

### Granting Plus

30. As an Operator, I want to grant a User a number of Plus days, so that I can compensate them for a problem or reward them.
31. As an Operator, I want a reason required for every grant, so that I remember later why someone got free time.
32. As an Operator, I want granted days added the same way a purchase adds time (from the current expiry while Plus or its Grace Period runs, otherwise from now), so that a grant never takes away time they already had.
33. As a User given Plus days, I want my Entitlements to update immediately, so that I can use Plus straight away.
34. As a User given Plus days, I want an email telling me how many days I got and until when, so that I know it happened.
35. As an Operator, I want a granted period to never count as revenue or as a Payment, so that my metrics stay honest.

### Stuck Payments

36. As an Operator, I want to see Payments that have been Pending for a long time, so that I can find ones the gateway never confirmed.
37. As an Operator, I want to ask the Payment Provider to verify a Pending Payment again, so that a Payment the User completed but whose callback was lost becomes Paid.
38. As an Operator, I want re-verifying a Payment the provider says went through to extend the User's Subscription exactly once, so that repeated attempts never give double time.
39. As an Operator, I want re-verifying a Payment the provider says did not go through to mark it Failed, so that the User's history is correct.
40. As an Operator, I want a clear message when the provider cannot be reached, with the Payment left Pending, so that nothing is decided on a guess.
41. As a User whose stuck Payment was confirmed this way, I want an email saying my Plus is active and until when, so that I know it worked even though I left the checkout.

### Billing configuration

42. As an Operator, I want to set the monthly Plus price in IRR, so that I can change what Plus costs without a redeploy.
43. As an Operator, I want to set the Tier Discounts (from how many months, what percent off), so that I can reward longer purchases.
44. As an Operator, I want to add, change and remove Tier Discounts, so that the tiers fit my pricing.
45. As an Operator, I want to set the Trial length in days, so that I can try a longer or shorter Trial.
46. As an Operator, I want a Trial-length change to apply only to Users who sign up afterwards, so that nobody's existing Trial moves.
47. As an Operator, I want to set the Grace Period length in days, so that I can be more or less forgiving.
48. As an Operator, I want to set each Plan's limits (number of Signed-in Devices, whether sharing a Workspace is allowed), so that I can tune Free and Plus.
49. As an Operator, I want a preview of the price for every number of months (1 to 12) before I save, so that I can see exactly what Users will be charged.
50. As an Operator, I want to give a reason for every configuration change, so that the history explains itself.
51. As an Operator, I want to see the history of configuration changes with who made them, when and why, so that I can trace a pricing mistake.
52. As an Operator, I want a price change to apply only to Payments started afterwards, so that a User halfway through checkout is not charged a different amount.
53. As an Operator, I want invalid configuration refused (negative price, a discount of 100% or more, negative Trial or Grace days, duplicate tiers), so that I cannot break checkout by accident.
54. As an Operator setting up a fresh instance, I want the configuration seeded from the existing env values on first boot, so that upgrading changes nothing until I change it.
55. As a User, I want the Plan and paywall to never mention AI analyses while AI is not offered, so that I am not sold something that does not exist.

### Promotions

56. As an Operator, I want to create a Promotion with a name, a percent off and a start and end time, so that I can run a sale like Nowruz.
57. As an Operator, I want a Promotion to apply automatically to every purchase within its window, so that Users need no code.
58. As an Operator, I want a Promotion and a Tier Discount to never compound: the larger one wins, so that I never sell below what I intended.
59. As an Operator, I want overlapping Promotions refused, so that it is always clear which one applies.
60. As an Operator, I want to end a Promotion early, so that I can stop a sale that went wrong.
61. As an Operator, I want to see past, running and upcoming Promotions, so that I can plan sales.
62. As a User, I want the checkout to show the full price, the discount applied and its name (a Promotion's name or the Tier Discount), so that I see the deal I am getting.
63. As a User, I want a Payment started during a Promotion to keep its price even if the Promotion ends before I finish paying, so that I am never surprised.
64. As a User, I want my Payment history to show the discount each Payment got, so that my receipts make sense.

### Payment Methods

65. As an Operator, I want to see every Payment Provider the deployment has credentials for, so that I know what I can switch on.
66. As an Operator, I want to switch each Payment Method on or off, so that I can stop using a gateway that is failing.
67. As an Operator, I want to set each Payment Method's display label and order, so that the checkout shows the one I prefer first.
68. As an Operator, I want a Payment Provider without credentials to be shown as unavailable and impossible to switch on, so that Users never reach a broken checkout.
69. As an Operator, I want switching a Payment Method off to leave its Pending Payments verifiable, so that Users who already paid still get their time.
70. As a User, I want to pick how I pay when more than one Payment Method is on, so that I can use the one I trust.
71. As a User, I want no choice step when only one Payment Method is on, so that checkout stays as quick as today.
72. As a User, I want a clear message when no Payment Method is on, so that I know buying is unavailable rather than broken.
73. As an Operator, I want to set `PAYMENT_LINK_MODE` (external, info, none) from the Back Office, so that a store build can hide the purchase link without a release.
74. As a mobile User, I want the app to follow the current `PAYMENT_LINK_MODE` and Payment Methods at start, so that what I see matches what the server allows.
75. As the developer, I want adding a Payment Provider to mean writing one adapter and adding its credentials to env, so that a new gateway goes live fast.

### Card-to-card

76. As an Operator, I want to set the destination card number and the card holder's name for card-to-card, so that Users know where to send money.
77. As a User choosing card-to-card, I want to see the exact amount, the destination card number (easy to copy) and the holder's name, so that I transfer the right sum to the right card.
78. As a User, I want to report my transfer with its tracking number, my card's last four digits and when I made it, so that the Operator can find it in the bank statement.
79. As a User, I want my report checked before sending (tracking number present, four digits, transfer time not in the future), so that I do not send something unusable.
80. As a User who reported a transfer, I want the Payment shown as Awaiting Review with an honest note on how long review may take, so that I know it was received.
81. As a User, I want to be prevented from reporting the same tracking number twice, so that a double tap does not create two Payments.
82. As an Operator, I want a queue of Payments Awaiting Review, oldest first, with the amount, months, reported details and the User's email, so that I can check them against my bank account.
83. As an Operator, I want Payments Awaiting Review for more than 7 days marked overdue, so that none is forgotten.
84. As an Operator, I want to approve a Payment, so that it becomes Paid and extends the User's Subscription.
85. As an Operator, I want to reject a Payment with a reason the User will read, so that they know what was wrong.
86. As a User whose card-to-card Payment was approved, I want an email and my Plus active straight away, so that I can use it.
87. As a User whose card-to-card Payment was rejected, I want an email with the Operator's reason, so that I can fix it or contact support.
88. As an Operator, I want a Payment that has already been approved or rejected to be impossible to review again, so that two Operators cannot both act on it.
89. As an Operator, I want card-to-card to be a Payment Method like any other, switched on or off and ordered in the same list, so that I can stop accepting it once a gateway works.

### Audit

90. As an Operator, I want every Back Office change recorded in an Operator audit log with the Operator, the time, what changed and the reason, so that every change can be traced.
91. As an Operator, I want to read and page through the Operator audit log, so that I can review what Operators did.
92. As a User, I want Operator actions on my account kept out of my Workspaces' audit logs, so that Workspace history only records Workspace activity.

## Implementation Decisions

### Domain and vocabulary

- Uses the terms Operator, Back Office, Payment Provider, Payment Method, Tier Discount, Promotion and Awaiting Review as defined in `CONTEXT.md`. "Admin" is not used anywhere in this feature: it is a Workspace Role.
- ADR-0009 records the move of billing configuration from env to the database and amends ADR-0008's "priced by the server from config".

### Operator identity and access

- The User gets an Operator flag, set and cleared only by a new API command-line script that takes an email. There is no API endpoint that changes it.
- An Operator guard checks the authenticated User is flagged and verified; it protects every Back Office endpoint. The User's profile response gains an Operator boolean so the web app can show the link and routes.
- Back Office write endpoints require the Operator's current password in the request body and refuse the change when it is wrong, without ending the session. Read endpoints do not ask for it.
- Back Office queries run outside Workspace scope and touch only user, subscription, payment, signed-in-device count, workspace count, billing configuration and the Operator audit log. They never read Workspace tables; this is a rule reviewers check, and tests assert the User detail response contains no financial fields.

### Billing configuration in the database

- A billing configuration row holds the Plus monthly price, Tier Discounts, Trial days, Grace days, `PAYMENT_LINK_MODE` and the card-to-card destination (card number, holder name). Each change writes a new version, with the Operator, the reason and the time, and becomes current; old versions are kept for history.
- Plans become rows keyed by the existing codes (Free, Plus) holding their limits. The Plan code stays the shared type the clients use; no endpoint creates Plans, and switching between paid Plans is not supported. The AI-analyses limit stays in the data model but is not shown in any Plan or paywall copy and is omitted from Plan descriptions while AI is deferred.
- On first boot, when no configuration exists, it is seeded from today's env values (price, Trial days, device and AI limits) and today's built-in Tier Discounts and Grace days, so upgrading changes nothing. After seeding those env variables are ignored; `BILLING_ENABLED` and Payment Provider credentials stay in env.
- The billing configuration the Entitlement service, pricing and the expiry job already take as input is now loaded from the current database version (cached and refreshed on change) instead of built from env. The pure functions keep their shape; only where the configuration comes from changes.
- Trial length is read when a User signs up, so a change only affects later sign-ups. Grace days apply as configured at the time they are evaluated.
- Validation on save: price a positive whole amount; each Tier Discount from 2 to 12 months, percent between 0 and 100 exclusive, no duplicate month counts; Trial days 0 or more; Grace days 0 or more; device limits 1 or more.

### Pricing and Promotions

- A Promotion row: name, percent off, start, end, created by, ended early by. Overlapping windows are refused. Ending early sets the end to now.
- Pricing takes the current configuration and the Promotion running now; the discount applied is the larger of the Tier Discount reached and the Promotion, never both. The price result gains which discount applied (Tier Discount or the Promotion's name).
- A Payment stores the price it was started at, as today, plus which discount applied. The checkout page's price list and a new Back Office price preview use the same pricing endpoint.

### Payment Providers and Payment Methods

- The single injected Payment Provider becomes a registry of providers keyed by name. The deployment registers a provider only when its credentials are present. The existing provider interface (request, parse callback, verify) is kept unchanged. The provider callback route carries the provider's name so the right adapter parses it.
- A Payment Method row per registered provider plus one for card-to-card: on/off, label, display order. A provider without credentials appears as unavailable and cannot be switched on.
- The checkout request gains the chosen Payment Method. The server refuses a Payment Method that is off or unknown. When only one is on, the web client sends it without asking.
- The prices endpoint the checkout already reads also returns the enabled Payment Methods, in order, and `PAYMENT_LINK_MODE`, so web and mobile read them at start.
- A Payment records the Payment Method it used. Re-verification uses the provider the Payment was started with, even if that Payment Method has since been switched off.

### Card-to-card

- A new Payment state, Awaiting Review, alongside Pending, Paid, Failed and Canceled. A card-to-card checkout creates the Payment and returns the destination card and amount. The User's report (tracking number, last four digits, transfer time) moves it to Awaiting Review. A tracking number already used on another card-to-card Payment is refused.
- Approve sets Paid and extends the Subscription with the same extend-from-expiry rule as a gateway Payment; reject sets Failed and stores the reason shown to the User. Both are conditional on the Payment still being Awaiting Review, so a second review is refused.
- Approve and reject send emails through the existing mailer, in the User's language.
- Overdue means Awaiting Review for more than 7 days; it is a view in the queue and a metric, not a state.

### Grant Plus

- Grant takes a number of days (1 to 365) and a reason and extends the Subscription with the same rule as a purchase, with days instead of months. It creates no Payment and is never counted as revenue. A grant to a Free User whose Plus has lapsed starts from now. The User receives an email.

### Re-verify

- Re-verify only applies to Pending gateway Payments. It calls the Payment's provider verify; Paid extends the Subscription once (guarded the same way the callback is), not paid marks Failed, an unreachable provider leaves it Pending and returns an error the Back Office shows.

### Metrics

- Metric endpoints return daily and monthly buckets in the Operator's timezone for: sign-ups, Payments by state and Payment Method, revenue of Paid Payments by Payment Method, and counts of Users on Trial, Plus, in Grace Period and Free now. Trial-to-Plus conversion is the share of Users whose Trial ended in the range who have a Paid Payment.
- Metrics are computed by queries on demand; no metrics tables or background aggregation.

### Operator audit log

- A separate Operator audit log, not the Workspace audit log: Operator, action, target User (when there is one), before-and-after or details, reason, time. Written in the same database transaction as the change. Read in pages, newest first, in the Back Office, and filtered to one User on the User detail page.

### Web

- Back Office routes inside the web app, behind the Operator flag: Overview (metrics), Users (search, list, detail with grant and re-verify), Review queue (card-to-card), Billing (price, Tier Discounts, Trial and Grace days, Plan limits, preview, history), Promotions, Payment Methods (including card-to-card destination and `PAYMENT_LINK_MODE`), Audit log.
- Every write opens a confirmation that asks for the reason (where needed) and the password.
- The checkout page gains the Payment Method choice, the discount line, the card-to-card instructions and report form, and the Awaiting Review state. The Subscription page's Payment history shows the Payment Method, the discount and Awaiting Review.
- Built on the new design system from the design refresh (see `.scratch/design-refresh/spec.md`), desktop-first.

### Mobile

- The mobile app reads the enabled Payment Methods and `PAYMENT_LINK_MODE` from the billing endpoint at start. Card-to-card on mobile follows the same rule as other purchases: it happens on the web, reached through the purchase link (ticket 44).

## Testing Decisions

- Tests drive external behaviour only: requests in, responses, emails and stored state out. No test reaches into a service's internals or asserts on queries.
- **API HTTP tests** are the main seam: a started test app against a real Postgres, calling endpoints as a User or an Operator, as the existing payments, expiry and subscription HTTP tests do. They cover: Operator guard (non-Operator, unverified Operator, wrong password on writes); seeding from env on first boot; each configuration change applying only to later Payments and sign-ups; validation refusals; Promotions (window, overlap refusal, larger-discount-wins, price kept after the Promotion ends); Payment Method on/off and refusal of an off one; card-to-card full flow (report, duplicate tracking number, approve, reject, second review refused, emails); grant (extend rule, email, no Payment created, not in revenue); re-verify (paid once with its email, failed, provider unreachable); metrics buckets; Operator audit entries for every write; and the User detail response containing no Workspace data.
- The fake payment provider becomes a set of named fakes so tests can run with two gateways and switch one off. The fake mailer asserts the grant, approve and reject emails.
- **Pure-function tests** extend the existing pricing and entitlement tests for Promotions, the larger-discount rule and configuration loaded from the database version.
- **Web tests** render the app against the fake API, as the existing checkout and subscription tests do, covering: the Back Office hidden from non-Operators; User search and detail; the grant and review confirmations asking for a reason and password; the Billing page preview; Payment Method choice at checkout (several, one, none); the card-to-card instructions, report form validation and Awaiting Review display.

## Out of Scope

- Discount codes (coupons) the User types at checkout.
- Creating new Plans (e.g. Business, Family) from the Back Office, and switching between paid Plans.
- Two-factor authentication for Operators.
- Prices in currencies other than IRR.
- Receipt image upload for card-to-card.
- Resending verification emails, revoking a User's Signed-in Devices, or disabling Users from the Back Office.
- Any view of a User's Workspace or financial data, even for support.
- Refunds.
- A mobile Back Office.
- Exporting metrics, or metrics tables and background aggregation.
- AI: its Entitlement stays in the model but is not offered (see `.scratch/daric-later/`).

## Further Notes

- Order: the design refresh's foundation (logo, tokens, components) comes first, then this effort, then the screen-by-screen redesign, so the Back Office is built on the new components and payments can go live before the long redesign pass.
- Ticket 44 (mobile paywall) now reads `PAYMENT_LINK_MODE` and Payment Methods from the billing endpoint instead of env.
- Card-to-card lets Plus go on sale before any gateway contract is approved. It can be switched off once a gateway works.
- Operator passwords and the review queue are the only defence on money-moving actions in v1, so the Operator audit log should be reviewed regularly until 2FA exists.
