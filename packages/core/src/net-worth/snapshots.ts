import { addDays, monthPeriodOfDay, nextPeriod, periodDays, todayIn } from '../calendar';
import type { IsoDay, WorkspaceCalendar } from '../calendar';

/**
 * The month-end days whose automatic Net Worth Snapshot is due at `now`:
 * the last day of every Workspace-Calendar month that has ended in the
 * Workspace's timezone, from the month the Workspace was created in, or from
 * the first month ending after `lastAutoDay` (its latest automatic snapshot),
 * oldest first. A month is due from local midnight after its last day.
 */
export function dueAutoSnapshotDays(
  workspace: WorkspaceCalendar,
  now: Date,
  since: { createdAt: Date; lastAutoDay?: IsoDay | null },
): IsoDay[] {
  const today = todayIn(now, workspace.timeZone);
  const created = todayIn(since.createdAt, workspace.timeZone);
  const after = since.lastAutoDay ? addDays(since.lastAutoDay, 1) : created;
  const from = after > created ? after : created;
  const days: IsoDay[] = [];
  for (let month = monthPeriodOfDay(from, workspace.calendar); ; month = nextPeriod(month)) {
    const lastDay = addDays(periodDays(month, workspace.calendar).until, -1);
    if (lastDay >= today) return days;
    days.push(lastDay);
  }
}
