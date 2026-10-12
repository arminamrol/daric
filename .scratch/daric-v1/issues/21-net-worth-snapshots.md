# 21: Net Worth Snapshots and history

**What to build:** Net Worth is recorded at each Workspace-Calendar month end and on demand, and the user sees a history chart.

**Blocked by:** 20

**Status:** done

- [x] Scheduled job takes AUTO snapshots at month end per Workspace timezone; manual snapshot endpoint
- [x] Snapshot stores totals and breakdown
- [x] History chart (Recharts) with accessible data table fallback
- [x] Tests for scheduling boundaries and idempotency (one AUTO per month)

## Comments

Notes for later tickets:

- Table `net_worth_snapshots` in `0012_net_worth_snapshots.sql`: `kind` (`snapshot_kind`: `AUTO | MANUAL`), `day`, `base_currency`, `total` / `assets` / `liabilities` (bigint, Base Currency), `breakdown` jsonb (`byCurrency`, `accounts`, `ratesUsed`, `missing` in the wire shape of `netWorthSchema`), `created_at` (served as `takenAt`). SELECT and INSERT only: a snapshot is never changed or deleted. Partial unique index `net_worth_snapshots_auto_day_key` on `(workspace_id, day) WHERE kind = 'AUTO'`.
- Core `net-worth/snapshots.ts`: `dueAutoSnapshotDays(workspaceCalendar, now, { createdAt, lastAutoDay })` → the last days of every month that has ended in the Workspace's timezone, from the month the Workspace was created in, or from the first month ending after the latest AUTO snapshot (so a calendar change does not backfill the new calendar's months), oldest first. Due from local midnight after the last day.
- Job: `SnapshotJob` (`net-worth/snapshot-job.ts`) runs `NetWorthService.takeDueAutoSnapshots(now)` at startup and every `SNAPSHOT_JOB_INTERVAL_MINUTES` (default 60; 0 turns it off; tests set 0 and call it with a fixed `now`). It reads Workspaces and members past row-level security, then works in each Workspace through `runInWorkspace` as an Owner (else its oldest Member); a Workspace with no Members is skipped. One Workspace failing does not stop the others (an `AggregateError` at the end). Passes don't overlap; parallel processes are safe through the unique index and `ON CONFLICT DO NOTHING`. `takeDueAutoSnapshots(now, { workspaceId })` limits it to one Workspace (the seed and tests use this).
- An AUTO snapshot is valued as of its day: Valuations and rates on the day, and balances counting only Transactions on or before it (`AccountsService.list({ balancesOn })`). It uses the Workspace's Base Currency and Account names at the time it is taken, and every Account counts, including ones created after the day (Accounts have no opening date), so a late catch-up can count an Account in months before it existed.
- A MANUAL snapshot stores exactly what `GET /net-worth` shows (balances count every Transaction, so it follows the existing balance rule, unlike AUTO).
- API: `GET /v1/workspaces/:wsId/net-worth/snapshots` (every Member; oldest first, same day by time taken; summaries with totals and `missing`), `POST …/snapshots` (Member+, 201 with the full snapshot), `GET …/snapshots/:snapshotId` (full snapshot with breakdown). Audit: `net_worth_snapshot.create` with `snapshotId` (MANUAL only; AUTO is not audited).
- Web: the `/net-worth` page has a History section: a Recharts line of `total` over time (loaded as its own chunk, `HistoryChart.tsx`; x is the day, ticks on month ends), with the same numbers in a table inside a "show as table" disclosure (newest first, marking totals with missing rates). Snapshots in a former Base Currency are left out with a count. Members and above get "record today's Net Worth". Hooks `useNetWorthHistory` / `useTakeSnapshot` in `net-worth.ts`; the history isn't refreshed by Transaction or rate changes (snapshots don't change).
- Demo seed: the demo Workspace's `created_at` is set to the start of the first demo month, and `seed-cli` runs the job for that Workspace, so the demo shows a snapshot of each ended month.
- Open points from review: the chart places points with `Number(total)` (exact up to 2^53 minor units; labels are formatted from the number for the axis only, the tooltip and table use the bigint). Back-dating Accounts' existence needs an Account opening date. Manual snapshots can't be deleted. ADR-0001 says nothing about background jobs reading past RLS; this job is the first one and runs each Workspace scoped as one of its Members.
