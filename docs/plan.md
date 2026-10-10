# Daric — v1 Plan

Vocabulary: see `CONTEXT.md`. Decisions: see `docs/adr/`.

## Monorepo

```
apps/api           NestJS + Drizzle (src/modules, src/common, src/db/{schema,migrations,seed})
apps/web           Vite + React Router + TanStack Query + Tailwind (logical props) + PWA
apps/mobile        Expo Router + TanStack Query
packages/core      pure TS: zod schemas, money, calendar, budget, net worth, projection, analysis
packages/api-client typed client over core zod schemas
packages/offline-queue  write queue + storage adapters (IndexedDB / SQLite-MMKV)
packages/i18n      fa/en dictionaries, direction + digit/number formatting
packages/design-tokens  gold/navy palette → Tailwind preset + RN theme
packages/config    tsconfig, eslint, vitest presets
docker/            compose: postgres, mailpit, api
```

## Schema

Common columns on domain tables: `id uuid (v7, client-generatable)`, `workspace_id`, `created_at`, `updated_at`, `version`; financial tables add `deleted_at` (Accounts are archived instead: `archived_at`, never deleted). RLS on every domain table (ADR-0001). Money = `bigint` minor units (ADR-0004).

- Identity: `users`, `auth_identities` (password now, phone OTP later), `refresh_tokens` (family rotation + reuse detection), `email_tokens` (verify/reset)
- Tenancy: `workspaces` (type, base_currency, calendar, timezone, money_display, settings), `workspace_members` (role), `invitations`
- Governance: `user_consents`, `audit_logs` (append-only, no amounts/notes), `feature_flags`, `offline_devices`
- Money: `currencies` (code, minor_units), `exchange_rates`, `accounts` (type CASH|BANK|CARD|WALLET|LOAN|OTHER_ASSET, class ASSET|LIABILITY, currency, opening_balance), `account_valuations`, `net_worth_snapshots`
- Activity: `categories` (one level parent), `labels` (controllable), `transactions` (INCOME|EXPENSE|TRANSFER; transfer has `to_account_id` + `to_amount`), `transaction_labels`, `recurring_rules` (auto_post, default confirm)
- Planning: `budgets` (category, label?, MONTHLY|YEARLY), `projection_settings`, `planned_items` (FIXED_MONTHLY requires category | ONE_OFF)
- AI: `ai_analyses` (payload_sent), `ai_suggestions` (fact ids, status, rating), `ai_usage`
- Billing (per User, not workspace-scoped): `subscriptions` (plan, trial_ends_at, expires_at), `payments` (provider, provider_ref, months, amount, status, created_at)

## Roles

| Action | Owner | Admin | Member | Viewer |
|---|---|---|---|---|
| View data and reports | ✓ | ✓ | ✓ | ✓ |
| Transactions | all | all | own only | ✗ |
| Accounts, categories, labels, budgets, recurring, planned items | ✓ | ✓ | ✗ | ✗ |
| Invite and change roles | ✓ | ✓ (not the Owner or other Admins) | ✗ | ✗ |
| Export, AI analysis | ✓ | ✓ | ✗ | ✗ |
| Delete or transfer workspace | ✓ | ✗ | ✗ | ✗ |

## API modules

`auth`, `me` (incl. account deletion), under `/v1/workspaces/:wsId`: `workspaces`, `members`, `invitations`, `consents`, `audit`, `accounts`, `valuations`, `currencies`/`exchange-rates`, `categories`, `labels`, `transactions`, `recurring`, `budgets`, `net-worth`, `projection`, `reports`, `export`, `ai`. Per User: `billing` (subscription, checkout, payment callback, payment history). Cross-cutting: WorkspaceGuard + RolesGuard, nestjs-zod validation + OpenAPI, helmet, CORS, throttler, CSRF (web), pino with redaction, pluggable mailer (SMTP; Mailpit in dev), pluggable AiProvider (ADR-0003), pluggable PaymentProvider + EntitlementService (ADR-0008).

## Year-end projection (`core/projection`)

Inputs: Workspace-Calendar year `[yearStart, yearEnd]`, `today` (workspace tz), Transactions in Base Currency, Recurring Rules, Planned Items, `N` trailing months (default 3).
`A` = actuals yearStart..today; `f` = days left in current month / days in month; `M` = full months after current; `rem = M + f`. Computed per type (income/expense) and per Category; totals = sum of categories.

- **Automatic**: `V` = variable (non-recurring) total over last N closed months / months used (window may cross into previous year; fewer months → use available + warning; none → 0 + warning). `R` = Recurring occurrences in `(today, yearEnd]`. `P = A + round(V × rem) + R`.
- **Manual**: `P = A + Σ fixed occurrences in (today, yearEnd] + Σ one-offs in (today, yearEnd]`.
- **Combined**: per Category, Fixed Planned Item > Recurring Rule > Trailing Average; one-offs added.
- Rounding: half away from zero, once, on the final multiply.

Worked example (Jalali 1405, today 17 Mehr, Mehr = 30 days → f = 13/30, M = 5, rem = 5.4333; million Toman):

| | Expense | Income |
|---|---|---|
| A | 420 | 600 |
| V (Tir/Mordad/Shahrivar) | 38/42/40 → 40 | 10/30/20 → 20 |
| V × rem | 217.33 | 108.67 |
| R | rent 25×5 + subscription 0.5×6 = 128 | salary 80×6 = 480 |
| **Automatic** | **765.33** | **1,188.67** |
| Planned | rent 125 + installment 8×5 = 40 + one-off insurance 15 | salary 480 |
| **Manual** | **600** | **1,080** |
| **Combined** | 420 + 165 + 15 + 3 + 32×5.4333 = **776.87** | **1,188.67** |

The UI shows the assumptions: window months, V per Category, recurring and planned item lists, and warnings.

## Plans & Entitlements

License and business model: ADR-0007. Mechanism: ADR-0008. All limits and prices live in config; `BILLING_ENABLED=false` (self-host default) makes every Entitlement unlimited.

| | Free | Plus |
|---|---|---|
| Transactions, Accounts, Categories, Labels, Budgets, Recurring Rules | ✓ | ✓ |
| Projection, Reports, Net Worth, Valuations | ✓ | ✓ |
| Export and account deletion | ✓ (always) | ✓ |
| Signed-in Devices | 1 | config (e.g. 5) |
| Offline on the signed-in Device | ✓ | ✓ |
| Share a Workspace (Invitations, Members) | ✗ | ✓ (Owner's Plan) |
| AI analyses per month | 1 | config quota |
| Business Workspace, attachments | later | later |

- **Trial**: 14 days of Plus once at sign-up.
- **Devices**: a Signed-in Device is a refresh-token family. Logging in past the limit revokes the least recently used family; that device sees why and an upgrade link.
- **Sharing**: the Owner's Plan gates creating Invitations; Members need no Plan of their own, but their device limit follows their own Plan.
- **Purchase**: 1–12 months, server-priced: monthly price × n, discount 5% at 3+, 10% at 6+, ~17% at 12. Extends from the current expiry. Prepaid, no auto-renew.
- **Checkout**: always on the web through Zarinpal. Mobile opens the browser and returns via `daric://billing/return`. Server-side `PAYMENT_LINK_MODE` = `external` | `info` | `none` controls the in-app link (store builds may need `info`; direct APK uses `external`).
- **Reminders**: email 7 days and 1 day before a Subscription or Trial ends.
- **Grace and expiry**: 7-day Grace Period with a banner; then only the most recently active Signed-in Device stays, Members of the Owner's Workspaces are suspended (restored on resubscribe), AI stops with history kept. Data is never deleted for non-payment.
- **Refunds**: manual by support, within 7 days and only if no AI quota was used. No proration.

## AI (Phase 8, feature-flagged)

1. Requires the Plus AI Entitlement (Free: 1 analysis per month). Off by default; enabling records `ai_analysis` Consent (policy_version) after an explanation screen.
2. "Analyze my spending" → `core/analysis.buildFactSheet()` (category/label totals, change vs previous period, controllable share, savings at 10/20/30%, each fact with an id). Category/Label names included; notes, account names, people's names only with the `ai_include_names` opt-in.
3. Preview returns the exact payload; confirm sends its hash; server sends only the matching payload. "Remember my choice" = revocable Consent per workspace.
4. Provider via `AiProvider`. Output zod `{suggestions:[{factIds, kind, title, body, followUp?}]}` with no number fields; digits in text rejected or stripped; unknown factIds dropped; savings recomputed by core.
5. Accept, Dismiss or Snooze; a follow-up (budget, controllable flag, reminder) needs a second confirmation. Rating, history deletion, audit log entry, rate and usage limits.

## Defaults

- Budgets warn at 80% and show overspent above 100%. No rollover. A parent category includes its children. Transfers are excluded.
- Missed recurring occurrences are all listed as Due, oldest first.
- The controllable-savings slider defaults to 20%.
- Net Worth Snapshots are taken automatically at each Workspace-Calendar month end, plus on demand.
- In Toman display, input is ×10 when stored.
- Account deletion: hard delete after re-authentication; audit rows anonymised; ownership must be transferred if other members exist.
- No split transactions in v1. All assets are self-hosted (no CDN).
- Access token 15 min, refresh token 30 days.

## Roadmap

1. Scaffold, tooling, CI (lint/typecheck/test), Docker, `core` with tests (money, calendar, budget, net worth, projection), i18n + design-tokens skeleton.
2. API foundation: auth (cookies + bearer, rotation, CSRF), users, workspaces, members, guards + RLS, Drizzle schema/migrations, consents, audit, mailer, seed.
3. Accounts, categories, labels, transactions (incl. transfers) API + web UI (fa/RTL, PWA shell, offline queue).
4. Budgets, recurring rules, exchange rates, net worth + snapshots (API + web).
5. Projection (3 modes) + reports.
6. Mobile parity.
7. Plans & Entitlements, Trial, device limit, web checkout, grace/expiry, mobile paywall; English locale, onboarding, export/delete, invitations UI, empty/error states, polish.
8. AI module.
