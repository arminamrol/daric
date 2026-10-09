# 21: Net Worth Snapshots and history

**What to build:** Net Worth is recorded at each Workspace-Calendar month end and on demand, and the user sees a history chart.

**Blocked by:** 20

**Status:** ready-for-agent

- [ ] Scheduled job takes AUTO snapshots at month end per Workspace timezone; manual snapshot endpoint
- [ ] Snapshot stores totals and breakdown
- [ ] History chart (Recharts) with accessible data table fallback
- [ ] Tests for scheduling boundaries and idempotency (one AUTO per month)
