# 01: Monorepo scaffold, CI, Docker

**What to build:** A developer clones the repo, runs one install and one command to get lint, typecheck and tests passing locally and in CI, and starts Postgres and Mailpit with Docker Compose.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] pnpm workspaces + Turborepo with apps (api, web, mobile placeholders) and packages (core, api-client, offline-queue, i18n, design-tokens, config)
- [ ] TypeScript strict everywhere via shared tsconfig bases; shared ESLint and Vitest presets
- [ ] `lint`, `typecheck`, `test` pipelines run across all packages via Turbo
- [ ] CI workflow runs lint, typecheck, test on every push/PR and is green
- [ ] Docker Compose starts Postgres and Mailpit; `.env.example` documents every variable
- [ ] README with setup steps and environment variables
