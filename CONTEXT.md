# Daric

Personal finance (later small-business) app: record money movements, plan spending, track what you own and owe, and project the year end.

## Language

### Tenancy

**Workspace**:
The owner of all financial data; every record belongs to exactly one Workspace. Type is Personal (now) or Business (later).
_Avoid_: Account (reserved for money accounts), tenant, organization

**Member**:
A User's membership in a Workspace with a Role (Owner, Admin, Member, Viewer).
_Avoid_: Collaborator, participant

**Invitation**:
An Owner-issued, revocable offer for a person to become a Member with a given Role.

**Offline Device**:
A browser or phone on which the User agreed to keep Workspace data for offline use; its data is wiped on logout.

**Signed-in Device**:
A browser or phone with a live login (one refresh-token family). Counted against the User's device Entitlement; unrelated to whether it keeps data offline.
_Avoid_: Session (as a user-facing term)

**Consent**:
A User's recorded, revocable permission for a specific purpose (e.g. AI analysis, workspace sharing), tied to a policy version.

### Time

**Workspace Calendar**:
The calendar (Jalali or Gregorian) and timezone of a Workspace; it alone defines Periods. A User's display calendar only changes how dates are shown.

**Period**:
A month or year as defined by the Workspace Calendar. Budgets, reports and the Projection are bucketed by Period.
_Avoid_: Cycle, interval

### Money

**Account**:
A place money is held or owed (cash, bank, card, wallet, loan, other asset). Has a currency, fixed once created, and is either an Asset or a Liability. A Liability's balance is what is owed: positive means money is owed. Archived, never deleted.
_Avoid_: Wallet (as a generic term), user account

**Valuation**:
A manually entered value of an Account at a point in time, used for things whose value changes without transactions (gold, car, property).

**Amount**:
An integer count of a currency's minor unit; the currency defines how many decimals it has (IRR 0, USD 2). Never fractional.
_Avoid_: Value, sum (when meaning a stored amount)

**Base Currency**:
The Workspace's currency into which everything is converted for totals.

**Exchange Rate**:
A manually entered rate from a currency to the Base Currency, effective from a date.

**Net Worth**:
Sum of Asset Accounts minus sum of Liability Accounts, converted to Base Currency with the user's Exchange Rates (per-currency totals shown alongside).

**Net Worth Snapshot**:
A stored Net Worth figure at a moment, kept to draw history.

### Activity

**Transaction**:
A single dated money movement on an Account: Income, Expense, or Transfer.
_Avoid_: Entry, record, payment

**Transfer**:
A Transaction moving money between two Accounts of the same Workspace; it is neither Income nor Expense. Between different currencies the user enters both Amounts; nothing is converted automatically.

**Category**:
User-editable classification of Income or Expense, at most one level deep (parent → child). Totals of a parent include its children.

**Label**:
A free tag attached to many Transactions, independent of Category.
_Avoid_: Tag

**Controllable Label**:
A Label flagged as reducible spending (e.g. eating out, subscriptions).

**Recurring Rule**:
A template that produces Transactions on a schedule (rent, salary, subscriptions).
_Avoid_: Subscription (that is a kind of spending, not the mechanism)

**Due Occurrence**:
A Recurring Rule's occurrence that has come due and waits for the user's one-tap confirmation (unless the rule auto-posts).

### Planning

**Budget**:
A spending limit for a Category (optionally narrowed to one Label) per Period, monthly or yearly.

**Projection**:
The estimated Income and Expense totals at the end of the current Workspace-Calendar year.
_Avoid_: Forecast, prediction

**Projection Mode**:
Automatic (actuals + Trailing Average + Recurring Rules), Manual (actuals + Planned Items), or Combined.

**Trailing Average**:
Average monthly variable (non-recurring) amount over the last N closed months, default 3.

**Planned Item**:
A user-entered expected amount for the Projection: Fixed Monthly (requires a Category) or One-Off.

**Precedence (Combined mode)**:
Within a Category, a Fixed Monthly Planned Item overrides Recurring Rules, which override the Trailing Average.

### AI

**Fact Sheet**:
The de-identified, aggregated numbers our code computes and the user previews before an AI analysis; each fact has an id.

**Suggestion**:
An AI-written idea to reduce spending that cites Facts; any amounts shown with it are computed by our code, never by the AI.
_Avoid_: Recommendation, advice

### Billing

**Plan**:
What a User has paid for: Free or Plus (Daric Plus). A Business plan may come later.
_Avoid_: Tier, package

**Subscription**:
A User's prepaid Plus time, with an expiry date. Belongs to the User, not to a Workspace. Includes a 14-day Trial at sign-up.

**Trial**:
The Plus time every new User gets once at sign-up.

**Entitlement**:
What a User may do under their Plan (Signed-in Devices, sharing a Workspace, AI analyses per month), decided by the server. All unlimited when billing is disabled (self-hosted).
_Avoid_: Permission (that is a Role's concern), feature flag

**Grace Period**:
The 7 days after a Subscription ends during which Plus Entitlements still apply.

**Payment**:
One completed or failed purchase of Plus months through a payment provider.
_Avoid_: Transaction (reserved for money movements in a Workspace), invoice
