import { daysInMonth, fromEpochDay, toEpochDay } from './calendar';
import type { CalendarDate, CalendarSystem } from './calendar';
import { instantMs, localEpochDay, startOfLocalDay } from './zone';

/** A Workspace's calendar and IANA timezone; together they alone define Periods (ADR-0002). */
export interface WorkspaceCalendar {
  readonly calendar: CalendarSystem;
  readonly timeZone: string;
}

export interface MonthPeriod {
  readonly kind: 'month';
  readonly year: number;
  readonly month: number;
}

export interface YearPeriod {
  readonly kind: 'year';
  readonly year: number;
}

/** A month or year of the Workspace Calendar. */
export type Period = MonthPeriod | YearPeriod;

/** The day `instant` falls on in the Workspace Calendar and timezone. */
export function localDateOf(instant: Date, workspace: WorkspaceCalendar): CalendarDate {
  return fromEpochDay(workspace.calendar, localEpochDay(instantMs(instant), workspace.timeZone));
}

export function monthPeriodOf(instant: Date, workspace: WorkspaceCalendar): MonthPeriod {
  const { year, month } = localDateOf(instant, workspace);
  return { kind: 'month', year, month };
}

export function yearPeriodOf(instant: Date, workspace: WorkspaceCalendar): YearPeriod {
  return { kind: 'year', year: localDateOf(instant, workspace).year };
}

export function nextPeriod<P extends Period>(period: P): P;
export function nextPeriod(period: Period): Period {
  if (period.kind === 'year') return { kind: 'year', year: period.year + 1 };
  return period.month === 12
    ? { kind: 'month', year: period.year + 1, month: 1 }
    : { kind: 'month', year: period.year, month: period.month + 1 };
}

export function previousPeriod<P extends Period>(period: P): P;
export function previousPeriod(period: Period): Period {
  if (period.kind === 'year') return { kind: 'year', year: period.year - 1 };
  return period.month === 1
    ? { kind: 'month', year: period.year - 1, month: 12 }
    : { kind: 'month', year: period.year, month: period.month - 1 };
}

/** The twelve month Periods of the year `period`, in order. */
export function monthsOfYear(period: YearPeriod): MonthPeriod[] {
  return Array.from({ length: 12 }, (_, i) => ({ kind: 'month', year: period.year, month: i + 1 }));
}

function firstEpochDay(period: Period, calendar: CalendarSystem): number {
  const month = period.kind === 'month' ? period.month : 1;
  return toEpochDay(calendar, { year: period.year, month, day: 1 });
}

/** The first instant of `period`: local midnight of its first day in the Workspace timezone. */
export function periodStart(period: Period, workspace: WorkspaceCalendar): Date {
  const day = firstEpochDay(period, workspace.calendar);
  return new Date(startOfLocalDay(day, workspace.timeZone));
}

/** The first instant after `period` (exclusive end), i.e. the start of the next Period. */
export function periodEnd(period: Period, workspace: WorkspaceCalendar): Date {
  return periodStart(nextPeriod(period), workspace);
}

/** Calendar days in `period`. */
export function daysInPeriod(
  period: Period,
  workspace: Pick<WorkspaceCalendar, 'calendar'>,
): number {
  const { calendar } = workspace;
  return firstEpochDay(nextPeriod(period), calendar) - firstEpochDay(period, calendar);
}

/** Days of the current month after today (today excluded); a Projection input. */
export function remainingDaysInMonth(today: Date, workspace: WorkspaceCalendar): number {
  const { year, month, day } = localDateOf(today, workspace);
  return daysInMonth(workspace.calendar, year, month) - day;
}

/** Whole months of the current year after the current month; a Projection input. */
export function fullMonthsRemainingInYear(today: Date, workspace: WorkspaceCalendar): number {
  return 12 - localDateOf(today, workspace).month;
}
