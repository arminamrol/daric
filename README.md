# Daric

Personal and household finance: accounts, transactions, budgets, net worth, reports and year-end projection, Persian-first (Jalali calendar, RTL) with English.

- Vocabulary: [`CONTEXT.md`](CONTEXT.md)
- Plan: [`docs/plan.md`](docs/plan.md)
- Decisions: [`docs/adr/`](docs/adr/)

## Repository layout

```
apps/api               NestJS API (Drizzle + Postgres)
apps/web               Vite + React web app / PWA
apps/mobile            Expo app (Expo Router)
packages/core          pure TypeScript domain logic
packages/api-client    typed API client
packages/offline-queue offline write queue
packages/i18n          fa/en dictionaries and formatting
packages/design-tokens gold/navy palette → Tailwind preset + RN theme
packages/config        shared tsconfig, ESLint and Vitest presets
docker/                Docker Compose for local services
```

pnpm workspaces + Turborepo. Every package has `lint`, `typecheck` and `test` scripts; Turbo runs them across the repo.

## Requirements

- Node.js 22.12+ (see `.nvmrc`)
- pnpm 10 (`corepack enable` picks up the version from `package.json`)
- Docker with Compose v2

## Setup

```sh
pnpm install
cp .env.example .env
pnpm db:up           # Postgres on :5432, Mailpit SMTP on :1025, inbox at http://localhost:8025
pnpm --filter @daric/api db:migrate
pnpm db:seed          # optional: demo user with six months of Persian data
pnpm check            # lint + typecheck + test across all packages (API tests need Postgres)
```

Stop the services with `pnpm db:down` (data persists in the `postgres-data` volume).

## Scripts

| Command             | What it does                                         |
| ------------------- | ---------------------------------------------------- |
| `pnpm dev`          | Web app at http://localhost:5173, API at :3000       |
| `pnpm build`        | Production builds (`apps/web/dist`, `apps/api/dist`) |
| `pnpm lint`         | ESLint in every package                              |
| `pnpm typecheck`    | `tsc --noEmit` in every package                      |
| `pnpm test`         | Vitest in every package                              |
| `pnpm check`        | All three of the above                               |
| `pnpm format`       | Prettier, writing changes                            |
| `pnpm format:check` | Prettier, check only (run in CI)                     |
| `pnpm db:up`        | Start Postgres and Mailpit (`docker/compose.yml`)    |
| `pnpm db:down`      | Stop them                                            |
| `pnpm db:seed`      | Create or reset the demo user (see below)            |

Run one package's task with a filter, e.g. `pnpm --filter @daric/core test`.

## Web app

Persian and right-to-left by default, light and dark themes, installable as a PWA.

- Styling is Tailwind with the Daric preset from `@daric/design-tokens`. Use semantic colors (`bg-surface`, `text-foreground`, `text-accent`, …); they follow the theme on their own, so `dark:` is not needed.
- Use logical utilities only (`ms-`/`me-`, `ps-`/`pe-`, `start-`/`end-`, `text-start`/`text-end`). ESLint rejects left/right utilities in `className` and left/right properties in CSS.
- UI text comes from `@daric/i18n` (`fa.ts` defines the keys); wrap values from outside the dictionary in `isolate()` when they go into a message.
- After changing `packages/design-tokens/src/tokens.ts`, regenerate the preset with `pnpm --filter @daric/design-tokens generate` (a test fails until you do).
- After changing `apps/web/public/favicon.svg`, regenerate the PWA icons with `pnpm --filter @daric/web icons`.
- The service worker only runs in the production build: try it with `pnpm build` then `pnpm --filter @daric/web preview`.

## Mobile app

Expo Router app in `apps/mobile`, Persian and right-to-left, light and dark themes.

- Run it on a simulator with `pnpm --filter @daric/mobile ios` (or `android`); this generates the native projects (`ios/`, `android/`, not committed) and starts Metro. With the API on another machine, set `EXPO_PUBLIC_API_URL` (default `http://localhost:3000`; an Android emulator reaches the host at `http://10.0.2.2:3000`).
- Styles come from `nativeTheme` in `@daric/design-tokens`; use `start`/`end` properties, never `left`/`right`. UI text comes from `@daric/i18n`.
- Logic that does not need React Native (token store, SQLite store, offline device, fast-entry validation) sits in plain modules with Vitest tests; screens stay thin.

## API

NestJS on Express with Drizzle over Postgres. Routes live under `/v1`; the OpenAPI document is at `/v1/openapi.json` (UI at `/v1/docs`), generated from the zod schemas in `@daric/core`.

- Schema: `apps/api/src/db/schema`. After changing it run `pnpm --filter @daric/api db:generate`, then `db:migrate`. Row-level security, grants and SQL functions go in custom migrations (`drizzle-kit generate --custom`).
- Workspace scoping (ADR-0001): Workspace routes use `@WorkspaceController()`, which puts them under `/v1/workspaces/:wsId`, checks membership and `@MinRole`, and runs each request in a transaction as the `daric_app` role with `app.user_id` and `app.workspace_id` set. Inside, use `scopedTx()`. Every table with a `workspace_id` needs grants for `daric_app`, RLS enabled and a policy on `workspace_id = (SELECT app_member_workspace_id())`; a test fails otherwise.
- The API is not compiled with decorator metadata (tsx, esbuild and Vitest do not emit it), so constructor parameters use `@Inject(...)` and request bodies use `@ZodBody(Dto)`.
- Logs never hold Amounts, notes, passwords or tokens: keys matching those are censored and requests are logged by method and path only.
- Tests (`pnpm --filter @daric/api test`) recreate and migrate a `<database>_test` database next to `DATABASE_URL`'s.
- The database user in `DATABASE_URL` must be able to create the `daric_app` role and be granted it (the first migration does both); a superuser works.

## Demo data

`pnpm db:seed` creates a demo user, `demo@example.com` with password `daric-demo`, whose Personal Workspace (Jalali calendar, rials) holds Accounts, Categories, Labels, Budgets, Recurring Rules (this month’s rent waiting as a Due Occurrence), a dollar Exchange Rate from the first of each month, gold coins with a Valuation on the first of each month, a month-end Net Worth Snapshot of each month that has ended, Planned Items for the Projection (a rent rise, a short course, a car insurance and a bonus), and Income, Expenses and Transfers from the start of the Jalali month six months ago up to today. Running it again deletes the demo user and the Workspaces they own and seeds them afresh, dated from the new today; other users' Workspaces are untouched. It refuses to run with `NODE_ENV=production`.

The seed lives in `apps/api/src/db/seed/demo.ts`. A feature that adds an entity (Budgets, Recurring Rules, …) adds demo rows for it there and extends `demo.http.test.ts`. It also adds the table to the data export (`apps/api/src/modules/export/export.service.ts`) and to `export.http.test.ts`, which checks that every row of the seeded Workspace is exported.

## Environment variables

All variables live in `.env` (copied from [`.env.example`](.env.example), git-ignored).

| Variable                        | Default                                       | Used by        | Purpose                                   |
| ------------------------------- | --------------------------------------------- | -------------- | ----------------------------------------- |
| `POSTGRES_USER`                 | `daric`                                       | Docker Compose | Postgres superuser created on first start |
| `POSTGRES_PASSWORD`             | `daric`                                       | Docker Compose | Its password                              |
| `POSTGRES_DB`                   | `daric`                                       | Docker Compose | Database created on first start           |
| `POSTGRES_PORT`                 | `5432`                                        | Docker Compose | Host port Postgres is published on        |
| `DATABASE_URL`                  | `postgres://daric:daric@localhost:5432/daric` | API            | Connection string; must match the above   |
| `MAILPIT_SMTP_PORT`             | `1025`                                        | Docker Compose | Host port of Mailpit's SMTP server        |
| `MAILPIT_UI_PORT`               | `8025`                                        | Docker Compose | Host port of Mailpit's web inbox          |
| `SMTP_HOST`                     | `localhost`                                   | API            | SMTP server for outgoing mail             |
| `SMTP_PORT`                     | `1025`                                        | API            | Its port                                  |
| `SMTP_SECURE`                   | `false`                                       | API            | `true` for TLS from the start (port 465)  |
| `SMTP_USER`, `SMTP_PASSWORD`    | unset                                         | API            | SMTP login, when the server needs one     |
| `MAIL_FROM`                     | `Daric <no-reply@daric.local>`                | API            | Sender address on outgoing mail           |
| `APP_URL`                       | `http://localhost:5173`                       | API            | Web app origin that mailed links open     |
| `PORT`                          | `3000`                                        | API            | Port the API listens on                   |
| `JWT_SECRET`                    | (dev placeholder)                             | API            | Signs access tokens; 32+ characters       |
| `ACCESS_TOKEN_TTL_SECONDS`      | `900`                                         | API            | Access token lifetime                     |
| `REFRESH_TOKEN_TTL_SECONDS`     | `2592000`                                     | API            | Refresh token lifetime                    |
| `CORS_ORIGINS`                  | `http://localhost:5173`                       | API            | Comma-separated allowed browser origins   |
| `RATE_LIMIT_PER_MINUTE`         | `120`                                         | API            | Requests per minute per client            |
| `AUTH_RATE_LIMIT_PER_MINUTE`    | `10`                                          | API            | Same, for login, registration and links   |
| `MAIL_RATE_LIMIT_PER_HOUR`      | `5`                                           | API            | Mail-sending requests per hour per client |
| `TRUST_PROXY`                   | `0`                                           | API            | Reverse proxies in front of the API       |
| `SNAPSHOT_JOB_INTERVAL_MINUTES` | `60`                                          | API            | Month-end Net Worth Snapshot job; 0 = off |
| `LOG_LEVEL`                     | `info`                                        | API            | Pino log level                            |

Postgres credentials only apply when its volume is first created; after changing them run `docker compose --project-directory . -f docker/compose.yml down -v` (this deletes local data).

## Contributing

Work is tracked as local Markdown tickets under `.scratch/`; see [`AGENTS.md`](AGENTS.md). Each ticket gets its own branch and pull request. CI (`.github/workflows/ci.yml`) runs format check, lint, typecheck, test and build on every pull request and every push to `main`.
