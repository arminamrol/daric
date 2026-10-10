import { toLatinDigits } from '../money/parse';
import { fromEpochDay, toEpochDay } from './calendar';
import type { CalendarDate, CalendarSystem } from './calendar';
import { nextPeriod } from './period';
import type { MonthPeriod, Period } from './period';
import { instantMs, localEpochDay } from './zone';

/**
 * A day with no time of day, as `YYYY-MM-DD` on the Gregorian calendar (ISO
 * 8601), e.g. the day a Transaction happened. Which Period it falls in depends
 * only on the Workspace Calendar; the timezone only decides which day "today" is.
 */
export type IsoDay = string;

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function epochDayOf(day: IsoDay): number | undefined {
  const match = ISO_DAY.exec(day);
  if (!match) return undefined;
  const [, year, month, date] = match.map(Number) as [number, number, number, number];
  try {
    return toEpochDay('gregorian', { year, month, day: date });
  } catch {
    return undefined;
  }
}

function toIsoDay(epochDay: number): IsoDay {
  const { year, month, day } = fromEpochDay('gregorian', epochDay);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function requireEpochDay(day: IsoDay): number {
  const epochDay = epochDayOf(day);
  if (epochDay === undefined) throw new RangeError(`Invalid day ${day}`);
  return epochDay;
}

/** Whether `day` is a real day written as `YYYY-MM-DD`. */
export function isIsoDay(day: string): boolean {
  return epochDayOf(day) !== undefined;
}

/** The day `instant` falls on in `timeZone`. */
export function todayIn(instant: Date, timeZone: string): IsoDay {
  return toIsoDay(localEpochDay(instantMs(instant), timeZone));
}

/** The ISO day of a valid `date` of `calendar`. */
export function dayOf(calendar: CalendarSystem, date: CalendarDate): IsoDay {
  return toIsoDay(toEpochDay(calendar, date));
}

/** `day` as a date of `calendar`. */
export function calendarDateOf(day: IsoDay, calendar: CalendarSystem): CalendarDate {
  return fromEpochDay(calendar, requireEpochDay(day));
}

/** The month of the Workspace Calendar that `day` falls in. */
export function monthPeriodOfDay(day: IsoDay, calendar: CalendarSystem): MonthPeriod {
  const { year, month } = calendarDateOf(day, calendar);
  return { kind: 'month', year, month };
}

/** The first day of `period` and the first day after it. */
export function periodDays(
  period: Period,
  calendar: CalendarSystem,
): { from: IsoDay; until: IsoDay } {
  const first = (p: Period) =>
    toEpochDay(calendar, { year: p.year, month: p.kind === 'month' ? p.month : 1, day: 1 });
  return { from: toIsoDay(first(period)), until: toIsoDay(first(nextPeriod(period))) };
}

const DISPLAY_DAY = /^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/;

/**
 * Reads a day typed as year/month/day in `calendar` (the User's display
 * calendar), in Persian or Latin digits, separated by `/`, `-` or `.`.
 * Undefined when it is not a real day.
 */
export function parseDisplayDay(text: string, calendar: CalendarSystem): IsoDay | undefined {
  const match = DISPLAY_DAY.exec(toLatinDigits(text).trim());
  if (!match) return undefined;
  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  try {
    return dayOf(calendar, { year, month, day });
  } catch {
    return undefined;
  }
}
