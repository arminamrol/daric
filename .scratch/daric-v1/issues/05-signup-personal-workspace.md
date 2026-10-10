# 05: Sign up creates a Personal Workspace

**What to build:** A person can register with email and password and log in through the API; registering creates their Personal Workspace with them as Owner, and no request can ever read another Workspace's data (ADR-0001).

**Blocked by:** 01

**Status:** in-progress

- [ ] NestJS app with Drizzle + drizzle-kit migrations; users, auth_identities, refresh_tokens, workspaces, workspace_members, audit_logs tables
- [ ] Register and login endpoints; argon2id hashing; zod validation; OpenAPI generated from schemas
- [ ] Registration creates a Personal Workspace and an Owner Member in one transaction
- [ ] Workspace-scoped routes under `/v1/workspaces/:wsId`; WorkspaceGuard resolves membership and role; RolesGuard enforces minimum role
- [ ] Each request runs in a transaction with the workspace id set locally; RLS policies on every domain table
- [ ] Helmet, CORS, rate limiting, log redaction (no amounts, notes or tokens in logs)
- [ ] HTTP tests: user A cannot read or write user B's Workspace even if the app-layer filter is removed
- [ ] Login and registration are written to the audit log
