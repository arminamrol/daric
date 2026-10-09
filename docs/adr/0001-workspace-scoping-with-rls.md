# Workspace scoping enforced by Postgres RLS plus app guards

All domain data belongs to a Workspace. Scoping is enforced twice: a NestJS guard resolves membership and role, and every request runs in a transaction that does `SET LOCAL app.workspace_id`, with row-level security policies on every domain table. We chose this over app-layer-only filtering so a forgotten `where workspace_id = ?` cannot leak data; the cost is one transaction per request and RLS-aware migrations.
