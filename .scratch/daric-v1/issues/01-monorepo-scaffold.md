# 01: Monorepo scaffold, CI, Docker

**What to build:** A developer clones the repo, runs one install and one command to get lint, typecheck and tests passing locally and in CI, and starts Postgres and Mailpit with Docker Compose.

**Blocked by:** None (can start immediately)

**Status:** in-progress

- [x] pnpm workspaces + Turborepo with apps (api, web, mobile placeholders) and packages (core, api-client, offline-queue, i18n, design-tokens, config)
- [x] TypeScript strict everywhere via shared tsconfig bases; shared ESLint and Vitest presets
- [x] `lint`, `typecheck`, `test` pipelines run across all packages via Turbo
- [ ] CI workflow runs lint, typecheck, test on every push/PR and is green
- [x] Docker Compose starts Postgres and Mailpit; `.env.example` documents every variable
- [x] README with setup steps and environment variables

## Comments

- CI workflow is written and the same steps pass locally (`pnpm format:check && pnpm check`); tick the CI box and set `Status: done` once the first PR run is green.
