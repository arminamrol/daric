# Daric

Personal and household finance: accounts, transactions, budgets, net worth and year-end projection, Persian-first (Jalali calendar, RTL) with English.

- Vocabulary: [`CONTEXT.md`](CONTEXT.md)
- Plan: [`docs/plan.md`](docs/plan.md)
- Decisions: [`docs/adr/`](docs/adr/)

## Repository layout

```
apps/api               NestJS API (placeholder)
apps/web               Vite + React web app / PWA (placeholder)
apps/mobile            Expo app (placeholder)
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
pnpm services:up      # Postgres on :5432, Mailpit SMTP on :1025, inbox at http://localhost:8025
pnpm check        # lint + typecheck + test across all packages
```

Stop the services with `pnpm services:down` (data persists in the `postgres-data` volume).

## Scripts

| Command              | What it does                                      |
| -------------------- | ------------------------------------------------- |
| `pnpm lint`          | ESLint in every package                           |
| `pnpm typecheck`     | `tsc --noEmit` in every package                   |
| `pnpm test`          | Vitest in every package                           |
| `pnpm check`         | All three of the above                            |
| `pnpm format`        | Prettier, writing changes                         |
| `pnpm format:check`  | Prettier, check only (run in CI)                  |
| `pnpm services:up`   | Start Postgres and Mailpit (`docker/compose.yml`) |
| `pnpm services:down` | Stop them                                         |

Run one package's task with a filter, e.g. `pnpm --filter @daric/core test`.

## Environment variables

All variables live in `.env` (copied from [`.env.example`](.env.example), git-ignored).

| Variable            | Default                                       | Used by        | Purpose                                   |
| ------------------- | --------------------------------------------- | -------------- | ----------------------------------------- |
| `POSTGRES_USER`     | `daric`                                       | Docker Compose | Postgres superuser created on first start |
| `POSTGRES_PASSWORD` | `daric`                                       | Docker Compose | Its password                              |
| `POSTGRES_DB`       | `daric`                                       | Docker Compose | Database created on first start           |
| `POSTGRES_PORT`     | `5432`                                        | Docker Compose | Host port Postgres is published on        |
| `DATABASE_URL`      | `postgres://daric:daric@localhost:5432/daric` | API            | Connection string; must match the above   |
| `MAILPIT_SMTP_PORT` | `1025`                                        | Docker Compose | Host port of Mailpit's SMTP server        |
| `MAILPIT_UI_PORT`   | `8025`                                        | Docker Compose | Host port of Mailpit's web inbox          |
| `SMTP_HOST`         | `localhost`                                   | API            | SMTP server for outgoing mail             |
| `SMTP_PORT`         | `1025`                                        | API            | Its port                                  |
| `MAIL_FROM`         | `Daric <no-reply@daric.local>`                | API            | Sender address on outgoing mail           |

Postgres credentials only apply when its volume is first created; after changing them run `docker compose --project-directory . -f docker/compose.yml down -v` (this deletes local data).

## Contributing

Work is tracked as local Markdown tickets under `.scratch/`; see [`AGENTS.md`](AGENTS.md). Each ticket gets its own branch and pull request. CI (`.github/workflows/ci.yml`) runs format check, lint, typecheck and test on every pull request and every push to `main`.
