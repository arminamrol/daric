# 05: Sign up creates a Personal Workspace

**What to build:** A person can register with email and password and log in through the API; registering creates their Personal Workspace with them as Owner, and no request can ever read another Workspace's data (ADR-0001).

**Blocked by:** 01

**Status:** done

- [x] NestJS app with Drizzle + drizzle-kit migrations; users, auth_identities, refresh_tokens, workspaces, workspace_members, audit_logs tables
- [x] Register and login endpoints; argon2id hashing; zod validation; OpenAPI generated from schemas
- [x] Registration creates a Personal Workspace and an Owner Member in one transaction
- [x] Workspace-scoped routes under `/v1/workspaces/:wsId`; WorkspaceGuard resolves membership and role; RolesGuard enforces minimum role
- [x] Each request runs in a transaction with the workspace id set locally; RLS policies on every domain table
- [x] Helmet, CORS, rate limiting, log redaction (no amounts, notes or tokens in logs)
- [x] HTTP tests: user A cannot read or write user B's Workspace even if the app-layer filter is removed
- [x] Login and registration are written to the audit log

## Comments

Notes for later tickets:

- Register and login return `accessToken`/`refreshToken` in the JSON body and the API accepts only `Authorization: Bearer` for now. 06 must move web clients to httpOnly cookies and stop returning tokens in the body for them; 07 keeps the body/bearer path for mobile and adds rotation (refresh tokens are already stored as SHA-256 hashes with a `family_id`).
- `GET /v1/me` returns the User and every Workspace they belong to with their Role. `GET`/`PATCH /v1/workspaces/:wsId` exist (PATCH renames, Admin+) mainly to prove guards and RLS; 08 extends PATCH into the full settings API.
- Workspace scoping: controllers use `@WorkspaceController(path)`; handlers use `scopedTx()`. The scope comes from the URL and the token, not from the guards. Services filter by id only and must not re-check membership with joins (that would mask a broken RLS policy in tests). Every new table with `workspace_id` needs grants for `daric_app`, `ENABLE ROW LEVEL SECURITY` and a policy on `workspace_id = (SELECT app_member_workspace_id())` in a custom migration; `src/db/scope.test.ts` fails otherwise. Identity tables have no grants for `daric_app`.
- Login and failed-login audit rows have `workspace_id = null`, so a Workspace-scoped audit view cannot show them; a per-User view (e.g. under `/v1/me`) would need its own policy or the owner connection.
- The Personal Workspace is created with the name `Personal`; the web UI may want to show a localised label for PERSONAL workspaces until the user renames it.
- Logs: keys matching amount/note/password/token/secret/authorization/cookie are censored at any depth; requests log method and path only; errors keep type, message (without Drizzle's `params:`), stack, code, SQL text and cause, never `params` or Postgres `detail`.
- nestjs-pino keeps one root logger per process: a test that inspects logs must be the only app booted in its file.
- The API is not compiled with decorator metadata; use `@Inject(...)` in constructors and `@ZodBody(Dto)` for bodies.

