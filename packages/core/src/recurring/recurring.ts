import { addDays, calendarDateOf, dayOf, daysInMonth } from '../calendar';
import type { CalendarSystem, IsoDay } from '../calendar';

/** How often a Recurring Rule repeats: every `interval` weeks, months or years. */
export const recurrenceFrequencies = ['WEEKLY', 'MONTHLY', 'YEARLY'] as const;
export type RecurrenceFrequency = (typeof recurrenceFrequencies)[number];

/** The longest gap between two occurrences, in the rule's own unit. */
export const MAX_RECURRENCE_INTERVAL = 52;

/**
 * When a Recurring Rule falls due. A monthly or yearly rule keeps the day (and,
 * yearly, the month) of `startOn` in the Workspace Calendar; in a month too
 * short for that day it falls on the month's last day, and returns to its own
 * day after. A weekly rule keeps the weekday.
 */
export interface RecurrenceSchedule {
  readonly frequency: RecurrenceFrequency;
  /** Every how many weeks, months or years; 1 or more. */
  readonly interval: number;
  /** The first occurrence. */
  readonly startOn: IsoDay;
  /** No occurrence falls after this day; null repeats forever. */
  readonly endOn: IsoDay | null;
}

/**
 * The `n`th occurrence (from 0) of `schedule` on `calendar`, ignoring its end.
 * Counted from the start each time, so a day moved to a short month's end
 * does not drag the ones after it.
 */
function occurrenceAt(schedule: RecurrenceSchedule, calendar: CalendarSystem, n: number): IsoDay {
  const step = n * schedule.interval;
  if (schedule.frequency === 'WEEKLY') return addDays(schedule.startOn, 7 * step);
  const start = calendarDateOf(schedule.startOn, calendar);
  const months = schedule.frequency === 'MONTHLY' ? step : 12 * step;
  const index = start.year * 12 + (start.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const day = Math.min(start.day, daysInMonth(calendar, year, month));
  return dayOf(calendar, { year, month, day });
}

/** The occurrences of `schedule` from `from` up to, not including, `until`, in order. */
export function occurrencesBetween(
  schedule: RecurrenceSchedule,
  calendar: CalendarSystem,
  from: IsoDay,
  until: IsoDay,
): IsoDay[] {
  const days: IsoDay[] = [];
  for (let n = 0; ; n++) {
    const day = occurrenceAt(schedule, calendar, n);
    if (day >= until || (schedule.endOn !== null && day > schedule.endOn)) return days;
    if (day >= from) days.push(day);
  }
}

/** Whether `schedule` falls on `day`. */
export function isOccurrence(
  schedule: RecurrenceSchedule,
  calendar: CalendarSystem,
  day: IsoDay,
): boolean {
  return occurrencesBetween(schedule, calendar, day, addDays(day, 1)).length > 0;
}

/** The first occurrence on or after `day`, or null when the rule has ended by then. */
export function nextOccurrence(
  schedule: RecurrenceSchedule,
  calendar: CalendarSystem,
  day: IsoDay,
): IsoDay | null {
  for (let n = 0; ; n++) {
    const next = occurrenceAt(schedule, calendar, n);
    if (schedule.endOn !== null && next > schedule.endOn) return null;
    if (next >= day) return next;
  }
}

/**
 * The Due Occurrences of `schedule` on `today`: every occurrence up to and
 * including today, missed ones too, that is not `handled` (confirmed or
 * skipped) nor before `from` when given, oldest first.
 */
export function dueOccurrences(
  schedule: RecurrenceSchedule,
  calendar: CalendarSystem,
  today: IsoDay,
  handled: readonly IsoDay[],
  from: IsoDay | null = null,
): IsoDay[] {
  const done = new Set(handled);
  const first = from !== null && from > schedule.startOn ? from : schedule.startOn;
  return occurrencesBetween(schedule, calendar, first, addDays(today, 1)).filter(
    (day) => !done.has(day),
  );
}
